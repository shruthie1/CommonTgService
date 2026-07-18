import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { sleep, type TotalList } from 'telegram/Helpers';
import { Api } from 'telegram/tl';
import type { Dialog } from 'telegram/tl/custom/dialog';
import {
  ActiveChannelsService,
  ChannelsService,
  connectionManager,
  PromoteClientService,
  TelegramManager,
  UsersService,
} from '../../components';
import { contains, parseError } from '../../utils';
import { isEligibleDiscoveredChannel } from './channel-eligibility';
import { RuntimeConfigService } from '../config/runtime-config.service';

@Injectable()
export class AccountMaintenanceService implements OnModuleDestroy {
  private readonly logger = new Logger(AccountMaintenanceService.name);
  private running = false;
  private readonly delayedJoinTimers: NodeJS.Timeout[] = [];

  constructor(
    private readonly usersService: UsersService,
    private readonly channelsService: ChannelsService,
    private readonly activeChannelsService: ActiveChannelsService,
    private readonly promoteClientService: PromoteClientService,
    private readonly config: RuntimeConfigService,
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
      const users = await this.findEligibleUsers(limit, skip);
      for (const user of users) await this.updateUser(user);
      this.schedulePromoteClientJoin();
      return { processed: users.length, skipped: false };
    } finally {
      this.running = false;
    }
  }

  async checkPromoteClients(): Promise<void> {
    await this.promoteClientService.checkPromoteClients();
  }

  onModuleDestroy(): void {
    for (const timer of this.delayedJoinTimers) clearTimeout(timer);
  }

  private schedulePromoteClientJoin(): void {
    if (!this.config.enabled('UMS_TEST_SCHEDULER'))
      return;
    const timer = setTimeout(
      () => {
        this.promoteClientService
          .joinchannelForPromoteClients()
          .catch((error) =>
            this.logger.error(
              'Delayed promote-client join failed',
              error instanceof Error ? error.stack : String(error),
            ),
          );
      },
      2 * 60 * 1000,
    );
    this.delayedJoinTimers.push(timer);
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

    return this.usersService.executeQuery(
      {
        expired: false,
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
      },
      {},
      limit,
      skip,
    );
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
        lastActive,
        me,
        selfMessages,
        dialogs,
        contacts,
        hasPassword,
        calls,
      ] = await Promise.all([
        manager.getLastActiveTime(),
        manager.getMe(),
        manager.getSelfMSgsInfo(),
        manager.getDialogs({ limit: 5 }),
        manager.getContacts(),
        manager.hasPassword(),
        manager.getCallLogStats(),
      ]);
      await this.usersService.updateByFilter(
        { $or: [{ tgId: user.tgId }, { mobile: me.phone }] },
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
          mobile: me.phone,
          username: me.username,
          msgs: selfMessages.total,
          totalChats: dialogs.total,
          ownPhotoCount: selfMessages.ownPhotoCount,
          movieCount: selfMessages.movieCount,
          otherPhotoCount: selfMessages.otherPhotoCount,
          otherVideoCount: selfMessages.otherVideoCount,
          ownVideoCount: selfMessages.ownVideoCount,
          twoFA: Boolean(hasPassword),
          lastActive,
          tgId: me.id.toString(),
        } as any,
      );
      await manager.client.sendMessage('me', { message: '.' });
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
      }
    } finally {
      if (manager) await connectionManager.unregisterClient(user.mobile);
      await sleep(2000);
    }
  }

  private async persistDiscoveredChannels(
    dialogs: TotalList<Dialog>,
  ): Promise<void> {
    const channels = dialogs
      .filter((dialog) => dialog.isChannel || dialog.isGroup)
      .map((dialog) => dialog.entity as Api.Channel)
      .filter(
        (channel) =>
          !channel.broadcast &&
          !channel.defaultBannedRights?.sendMessages &&
          (channel.participantsCount || 0) > 50 &&
          isEligibleDiscoveredChannel(channel),
      )
      .map((channel) => ({
        channelId: channel.id.toString(),
        participantsCount: channel.participantsCount,
        title: channel.title,
        broadcast: channel.broadcast,
        megagroup: channel.megagroup,
        username: channel.username,
      }));

    if (!channels.length) return;
    await this.channelsService.createMultiple(channels);
    await this.activeChannelsService.createMultiple(channels);
  }
}
