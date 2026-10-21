import { Injectable, Logger } from '@nestjs/common';
import { sleep, type TotalList } from 'telegram/Helpers';
import { Api } from 'telegram/tl';
import type { Dialog } from 'telegram/tl/custom/dialog';
import {
  ActiveChannelsService,
  BufferClientService,
  ChannelsService,
  connectionManager,
  PromoteClientService,
  TelegramManager,
  UsersService,
} from '../../components';
import { contains, parseError } from '../../utils';
import { getTelegramChannelLiveFacts } from '../../utils/telegram-utils/channel-live-facts';
import { isEligibleDiscoveredChannel } from './channel-eligibility';

// users holds one doc per session, so one mobile can have several docs. The
// selection query sorts by mobile and over-fetches by this factor so that `limit`
// still yields up to `limit` distinct mobiles after duplicates are dropped.
const DUPLICATE_DOC_OVERFETCH = 5;

// Owner rule: every automated Telegram retry backs off exponentially and stops.
// A non-permanent failure waits 3h x 2^(failures-1), capped at 7 days, and the
// row is never selected again once it has failed MAX_MAINTENANCE_FAILURES times.
const MAINTENANCE_RETRY_BASE_MS = 3 * 60 * 60 * 1000;
const MAINTENANCE_RETRY_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MAINTENANCE_FAILURES = 5;

@Injectable()
export class AccountMaintenanceService {
  private readonly logger = new Logger(AccountMaintenanceService.name);
  private running = false;

  constructor(
    private readonly usersService: UsersService,
    private readonly channelsService: ChannelsService,
    private readonly activeChannelsService: ActiveChannelsService,
    private readonly bufferClientService: BufferClientService,
    private readonly promoteClientService: PromoteClientService,
  ) {}

  async processEligibleUsers(
    limit = 300,
    skip = 0,
  ): Promise<{ processed: number; skipped: boolean }> {
    if (this.running) {
      this.logger.warn(
        'Account maintenance skipped; previous run is still active',
      );
      return { processed: 0, skipped: true };
    }

    this.running = true;
    try {
      this.logger.log(`Starting raw-user maintenance (limit=${limit}, skip=${skip})`);
      const users = await this.findEligibleUsers(limit, skip);
      for (const user of users) await this.updateUser(user);
      this.logger.log(`Completed raw-user maintenance: processed=${users.length}`);
      return { processed: users.length, skipped: false };
    } finally {
      this.running = false;
    }
  }

  async checkPromoteClients(): Promise<void> {
    this.logger.log('Delegating promote-client health check to UMS lifecycle owner');
    await this.promoteClientService.checkPromoteClients();
  }

  async rotateReadyPromoteClients(): Promise<boolean> {
    this.logger.log('Evaluating one READY promote-client rotation outcome');
    return this.promoteClientService.rotateReadyPromoteClients();
  }

  /**
   * The UMS promote owner calls this independently of user processing.  Keeping
   * the two operations separate prevents a user-maintenance run from silently
   * creating a second promote join loop.
   */
  async preparePromoteClientJoin(): Promise<string> {
    this.logger.log('Starting UMS-owned promote-client join preparation');
    return this.promoteClientService.joinchannelForPromoteClients();
  }

  async refreshPromoteClientInfo(): Promise<void> {
    this.logger.log('Refreshing promote-client information (UMS owner)');
    await this.promoteClientService.updateInfo();
  }

  private async findEligibleUsers(
    limit: number,
    skip: number,
  ): Promise<Array<{ mobile: string; tgId: string } & Record<string, any>>> {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(now);
    monthAgo.setDate(monthAgo.getDate() - 30);
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 70);

    // A mobile in either pool is owned by its lifecycle worker (CMS for
    // buffer, UMS for promote).  UMS-test must never open that same Telegram
    // session while it is doing the independent raw-user maintenance pass.
    const [bufferClients, promoteClients] = await Promise.all([
      this.bufferClientService.findAll(),
      this.promoteClientService.findAll(),
    ]);
    const lifecycleMobiles = [
      ...new Set(
        [...bufferClients, ...promoteClients]
          .map((client) => client.mobile)
          .filter((mobile): mobile is string => Boolean(mobile)),
      ),
    ];
    this.logger.log(
      `Raw-user query excludes lifecycle pool mobiles: buffer=${bufferClients.length}, promote=${promoteClients.length}, unique=${lifecycleMobiles.length}`,
    );

    // Sorted by mobile so a mobile's duplicate docs are adjacent; within a mobile
    // the representative is the newest doc (updatedAt desc, _id asc), the same
    // tiebreak usersService.search uses.
    const rows = await this.usersService.executeQuery(
      {
        expired: false,
        ...(lifecycleMobiles.length
          ? { mobile: { $nin: lifecycleMobiles } }
          : {}),
        updatedAt: { $lt: weekAgo },
        $or: [
          { createdAt: { $gt: monthAgo }, updatedAt: { $lt: weekAgo } },
          {
            createdAt: { $lte: monthAgo, $gt: threeMonthsAgo },
            updatedAt: { $lt: monthAgo },
          },
          {
            createdAt: { $lte: threeMonthsAgo },
            updatedAt: { $lte: threeMonthsAgo },
          },
        ],
        // $not also matches docs that never failed (field missing).
        maintenanceRetryAt: { $not: { $gt: now } },
        maintenanceFailures: { $not: { $gte: MAX_MAINTENANCE_FAILURES } },
      },
      { mobile: 1, updatedAt: -1, _id: 1 },
      (skip + limit) * DUPLICATE_DOC_OVERFETCH,
      0,
    );

    // One login per mobile per run: both `limit` and `skip` count mobiles.
    const seenMobiles = new Set<string>();
    const representatives: typeof rows = [];
    for (const row of rows) {
      if (seenMobiles.has(row.mobile)) continue;
      seenMobiles.add(row.mobile);
      representatives.push(row);
    }
    return representatives.slice(skip, skip + limit);
  }

  private maintenanceRetryDelayMs(failures: number): number {
    return Math.min(
      MAINTENANCE_RETRY_BASE_MS * 2 ** Math.max(0, failures - 1),
      MAINTENANCE_RETRY_MAX_MS,
    );
  }

  /**
   * Records a non-permanent failure on every doc of this account so the next
   * selection skips it until the backoff expires.  Filters by tgId and writes no
   * `mobile`, so a non-canonical stored mobile cannot trip the schema setter.
   */
  private async recordMaintenanceFailure(
    user: { mobile: string; tgId: string } & Record<string, any>,
  ): Promise<void> {
    const failures = (Number(user.maintenanceFailures) || 0) + 1;
    const retryAt = new Date(Date.now() + this.maintenanceRetryDelayMs(failures));
    try {
      await this.usersService.updateByFilter(
        { tgId: user.tgId },
        { maintenanceFailures: failures, maintenanceRetryAt: retryAt } as any,
      );
      this.logger.warn(
        failures >= MAX_MAINTENANCE_FAILURES
          ? `Account maintenance for ${user.mobile} failed ${failures} times; no further retries`
          : `Account maintenance for ${user.mobile} failed (${failures}/${MAX_MAINTENANCE_FAILURES}); next retry after ${retryAt.toISOString()}`,
      );
    } catch (recordError) {
      this.logger.error(
        `Could not record maintenance backoff for ${user.mobile}: ${parseError(recordError, 'RecordMaintenanceFailure', false).message}`,
      );
    }
  }

  private async updateUser(
    user: { mobile: string; tgId: string } & Record<string, any>,
  ): Promise<void> {
    let manager: TelegramManager | undefined;
    try {
      manager = await connectionManager.getClient(user.mobile, {
        autoDisconnect: true,
        handler: false,
      });
      const [
        foreignLastActive,
        me,
        selfMessages,
        dialogs,
        contacts,
        hasPassword,
        calls,
      ] = await Promise.all([
        manager.getLastForeignActiveDate(),
        manager.getMe(),
        manager.getSelfMSgsInfo(),
        manager.getDialogs({ limit: 5 }),
        manager.getContacts(),
        manager.hasPassword(),
        manager.getCallLogStats(),
      ]);
      // lastActive: write a real foreign-session date when there is one. With no foreign
      // authorization (we hold the only session) or a failed lookup, keep the stored value so the
      // account can age past the enrollment threshold; only a user with no stored value gets today.
      const lastActive =
        foreignLastActive ??
        (user.lastActive ? undefined : new Date().toISOString().split('T')[0]);
      // Filter and write by tgId only.  `me.phone` can be '' or non-canonical
      // (hidden number, legacy format); the users mobile setter throws on it,
      // which used to fail the whole write so updatedAt never moved and the
      // account was re-selected every run.  The stored mobile stays as is.
      await this.usersService.updateByFilter(
        { tgId: user.tgId },
        {
          contacts: 'savedCount' in contacts ? contacts.savedCount : 0,
          calls: calls || {
            incoming: 0,
            outgoing: 0,
            totalCalls: 0,
            video: 0,
            audio: 0,
          },
          firstName: me.firstName,
          lastName: me.lastName,
          username: me.username,
          msgs: selfMessages.total,
          totalChats: dialogs.total,
          ownPhotoCount: selfMessages.ownPhotoCount,
          movieCount: selfMessages.movieCount,
          otherPhotoCount: selfMessages.otherPhotoCount,
          otherVideoCount: selfMessages.otherVideoCount,
          ownVideoCount: selfMessages.ownVideoCount,
          twoFA: Boolean(hasPassword),
          ...(lastActive ? { lastActive } : {}),
          tgId: me.id.toString(),
          maintenanceFailures: 0,
          maintenanceRetryAt: null,
        } as any,
      );
      // Bring the account online (replaces the old "." to Saved Messages). Best-effort:
      // a failed status call must not fail the refresh above or the discovery below.
      try {
        await manager.setOnlineStatus();
      } catch (statusError) {
        this.logger.warn(
          `Online status update failed for ${user.mobile}: ${parseError(statusError, 'UpdateStatus', false).message}`,
        );
      }
      await this.persistDiscoveredChannels(dialogs);
    } catch (error) {
      const details = parseError(
        error,
        `Account maintenance failed for ${user.mobile}`,
        false,
      );
      if (
        contains(details.message.toLowerCase(), [
          'user_deactivated_ban',
          'user_deactivated',
          'session_revoked',
          'auth_key_unregistered',
        ])
      ) {
        await this.usersService.delete(user.tgId);
      } else {
        await this.recordMaintenanceFailure(user);
      }
    } finally {
      if (manager) await connectionManager.unregisterClient(user.mobile);
      await sleep(2000);
    }
  }

  private async persistDiscoveredChannels(
    dialogs: TotalList<Dialog>,
  ): Promise<void> {
    const now = Date.now();
    const discovered = await Promise.all(
      dialogs
        .filter((dialog) => dialog.isChannel || dialog.isGroup)
        .map(async (dialog) => {
          const channel = dialog.entity as Api.Channel;
          if (!isEligibleDiscoveredChannel(channel)) return null;

          // This uses the same complete Telegram fact calculation as runtime
          // hydration. Discovery must never mark a restricted, left, private,
          // forbidden, broadcast, or write-restricted dialog as sendable.
          const facts = await getTelegramChannelLiveFacts(
            { getEntity: async () => channel },
            { channelId: channel.id, entity: channel },
          );
          // `private` (only from a ChannelForbidden entity) and `left` are THIS account's access, not
          // a channel fact: such a dialog must not write the shared doc (it closed the channel for
          // every account; 2026-10-04: 342 of 1,700 "private" channels were promoted afterwards).
          if (!facts || facts.private || facts.left) {
            return null;
          }

          return {
            channelId: facts.channelId,
            canSendMsgs: facts.canSendMsgs,
            private: false,
            forbidden: facts.forbidden,
            lastHydrationStatus: 'success',
            lastHydrationReason: facts.canSendMsgs ? 'live_sendable' : 'live_unsendable',
            lastHydratedAt: now,
            lastLiveCheckedAt: now,
            participantsCount: facts.participantsCount,
            accessHash: channel.accessHash?.toString(),
            title: facts.title ?? '',
            broadcast: facts.broadcast,
            megagroup: facts.megagroup,
            username: facts.username ?? '',
          };
        }),
    );
    const observedChannels = discovered.filter((channel): channel is NonNullable<typeof channel> => channel !== null);

    if (!observedChannels.length) return;

    // Preserve the discovery policy for new records: only sufficiently large,
    // live-sendable channels enter the pool. Existing records are also refreshed
    // when they are currently unsendable so canSendMsgs converges in both
    // directions without inflating the inventory with new rejected dialogs.
    const observedIds = observedChannels.map((channel) => channel.channelId);
    const [knownActiveIds, knownChannelIds] = await Promise.all([
      this.activeChannelsService.findExistingChannelIds(observedIds),
      this.channelsService.findExistingChannelIds(observedIds),
    ]);
    const knownActiveIdSet = new Set(knownActiveIds);
    const knownChannelIdSet = new Set(knownChannelIds);
    const isNewSendableChannel = (channel: (typeof observedChannels)[number]) =>
      channel.canSendMsgs && (channel.participantsCount ?? 0) > 50;
    const activeChannelUpdates = observedChannels.filter((channel) =>
      isNewSendableChannel(channel) || knownActiveIdSet.has(channel.channelId),
    );
    const channelUpdates = observedChannels.filter((channel) =>
      isNewSendableChannel(channel) || knownChannelIdSet.has(channel.channelId),
    );

    if (!activeChannelUpdates.length && !channelUpdates.length) return;
    await Promise.all([
      channelUpdates.length ? this.channelsService.createMultiple(channelUpdates) : Promise.resolve(),
      activeChannelUpdates.length ? this.activeChannelsService.createMultiple(activeChannelUpdates) : Promise.resolve(),
    ]);
  }
}
