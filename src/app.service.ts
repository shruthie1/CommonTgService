import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { sleep, TotalList } from 'telegram/Helpers';
import { Api } from 'telegram/tl';
import { Dialog } from 'telegram/tl/custom/dialog';
import * as schedule from 'node-schedule-tz';
import {
  UsersService,
  TelegramService,
  UserDataService,
  ClientService,
  ActiveChannelsService,
  UpiIdService,
  Stat1Service,
  Stat2Service,
  PromoteStatService,
  ChannelsService,
  User,
  TelegramManager,
  CreateChannelDto,
  Channel,
  connectionManager,
  ActiveChannel,
  BufferClientService,
  TimestampService,
  BotsService,
  ChannelCategory,
  EventManagerService,
} from './components';
import type { SetupClientQueryDto } from './components/clients/dto/setup-client.dto';
import { fetchWithTimeout, parseError, ppplbot } from './utils';
import { RuntimeConfigService } from './control-plane/config/runtime-config.service';
import { AccountMaintenanceService } from './control-plane/maintenance/account-maintenance.service';

export interface VideoDetails {
  videoId?: string;
  title?: string;
  duration?: number;
  [key: string]: any; // Allow additional properties while maintaining some type safety
}

interface UserAccessData {
  timestamps: number[];
  videoDetails: VideoDetails;
}

@Injectable()
export class AppService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AppService.name);
  private userAccessData: Map<string, UserAccessData> = new Map();
  private cleanupInterval: NodeJS.Timeout;
  private joinChannelIntervalId: NodeJS.Timeout;
  private joinChannelMap: Map<string, Channel[] | ActiveChannel[]> = new Map();
  private joinChannelQueueRunning = false;
  private readonly scheduledJobs: Array<{ cancel: () => unknown }> = [];
  private refresTime: number = 0;

  constructor(
    private usersService: UsersService,
    private telegramService: TelegramService,
    private userDataService: UserDataService,
    private clientService: ClientService,
    private activeChannelsService: ActiveChannelsService,
    private upiIdService: UpiIdService,
    private statService: Stat1Service,
    private stat2Service: Stat2Service,
    private promoteStatService: PromoteStatService,
    private channelsService: ChannelsService,
    private timestampService: TimestampService,
    private botsService: BotsService,
    private readonly eventManagerService: EventManagerService,
    private readonly runtimeConfig: RuntimeConfigService,
    private readonly bufferClientService: BufferClientService,
    private readonly maintenance: AccountMaintenanceService,
  ) {
    console.log('App Module Constructor initiated !!');
  }
  onModuleInit() {
    console.log('App Module initiated !!');

    if (this.runtimeConfig.enabled('UMS_SCHEDULER')) {
      this.logger.log('Starting UMS access-data cleanup interval (every 15 minutes)');
      this.cleanupInterval = setInterval(
        () => this.cleanupOldAccessData(),
        15 * 60 * 1000,
      );
    }

    try {
      if (this.runtimeConfig.enabled('UMS_SCHEDULER')) {
        const channelJoinJob = schedule.scheduleJob(
          'ums-channel-join-cycle',
          '25 2,9,16 * * * ',
          'Asia/Kolkata',
          async () => {
            this.logger.log('Starting UMS primary-client channel join/leave cycle');
            try {
              await fetchWithTimeout(
                `${ppplbot()}&text=ExecutingjoinchannelForClients-${process.env.clientId}`,
              );
            } catch (error) {
              parseError(error, 'UMS scheduled join notification failed');
            }

            try {
              // Original UMS used the UTC calendar day with an IST schedule.
              if (new Date().getUTCDate() % 3 === 1) {
                this.logger.log('UMS channel cycle branch=leave-all');
                await this.leaveChannelsAll();
              } else {
                this.logger.log('UMS channel cycle branch=join');
                await this.joinchannelForClients();
              }
              this.logger.log('Completed UMS primary-client channel join/leave cycle');
            } catch (error) {
              parseError(error, 'UMS scheduled channel join failed');
            }
          },
        );
        if (channelJoinJob) this.scheduledJobs.push(channelJoinJob);
      }

      if (this.runtimeConfig.enabled('UMS_SCHEDULER')) {
        const retentionJob = schedule.scheduleJob(
          'ums-user-data-retention',
          '0 3 * * * ',
          'Asia/Kolkata',
          async () => {
            this.logger.log('Starting UMS user-data/timestamp retention');
            try {
              const res = await this.userDataService.removeRedundantData();
              await this.timestampService.clear();
              console.log(
                'Deleted userdata older than month | count: ',
                res.deletedCount,
              );
              this.logger.log(
                `Completed UMS user-data/timestamp retention: deleted=${res.deletedCount}`,
              );
            } catch (e) {
              console.error('Error Deleteing old userData', e);
            }
          },
        );
        if (retentionJob) this.scheduledJobs.push(retentionJob);
      }

      // schedule.scheduleJob('test3', '25 2,9 * * * ', 'Asia/Kolkata', async () => {
      //   const now = new Date();
      //   if (now.getUTCDate() % 3 === 1) {
      //     this.leaveChannelsAll()
      //   }
      //   await this.joinchannelForClients()
      // })

      // schedule.scheduleJob('test3', ' 25 0 * * * ', 'Asia/Kolkata', async () => {
      //   const now = new Date();
      //   if (now.getUTCDate() % 9 === 1) {
      //     setTimeout(async () => {
      //       await this.activeChannelsService.resetAvailableMsgs();
      //       await this.activeChannelsService.updateBannedChannels();
      //       await this.activeChannelsService.updateDefaultReactions();
      //     }, 30000);
      //   }

      //   await fetchWithTimeout(`${ppplbot()}&text=${encodeURIComponent(await this.getPromotionStatsPlain())}`);
      //   await this.userDataService.resetPaidUsers();
      //   await this.statService.deleteAll();
      //   await this.stat2Service.deleteAll();
      //   await this.promoteStatService.reinitPromoteStats();
      // })
      // this.checkPromotions();
      console.log(
        'Added enabled UMS cron jobs:',
        this.runtimeConfig.activeSchedulers(),
      );
    } catch (error) {
      console.log('Some Error: ', error);
    }
  }

  async setupClient(clientId: string, query: SetupClientQueryDto) {
    return this.clientService.setupClient(clientId, query);
  }

  async checkBufferClients(): Promise<void> {
    await this.bufferClientService.checkBufferClients();
  }

  async rotateReadyBufferClients(): Promise<boolean> {
    return this.bufferClientService.rotateReadyBufferClients();
  }

  async joinBufferClients(): Promise<void> {
    await this.bufferClientService.joinchannelForBufferClients();
  }

  async updateBufferClientInfo(): Promise<void> {
    try {
      await fetchWithTimeout(`${ppplbot()}&text=Updating Buffer Clients Info`);
    } catch (error) {
      this.logger.error('CMS buffer-info notification failed; continuing update', error);
    }
    await this.bufferClientService.updateInfo();
  }

  async forwardGetRequest(
    externalUrl: string,
    queryParams: Record<string, unknown>,
  ) {
    try {
      return (await axios.get(externalUrl, { params: queryParams })).data;
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.error(`Forward request failed: ${axiosError.message}`, axiosError.stack);
      throw new Error(`Forward GET request failed: ${axiosError.message}`);
    }
  }

  async processEligibleUsers(limit: number, skip: number) {
    return this.maintenance.processEligibleUsers(limit, skip);
  }
  async checkPromotions() {
    setInterval(async () => {
      const clients = await this.clientService.findAll();
      for (const client of clients) {
        const userPromoteStats = await this.promoteStatService.findByClient(
          client.clientId,
        );
        if (
          userPromoteStats?.isActive &&
          (Date.now() - userPromoteStats?.lastUpdatedTimeStamp) / (1000 * 60) >
            6
        ) {
          try {
            await fetchWithTimeout(`${client.repl}/promote`, {
              timeout: 120000,
            });
            console.log(client.clientId, ': Promote Triggered!!');
          } catch (error) {
            parseError(error, 'Promotion Check Err');
          }
        } else {
          console.log(
            client.clientId,
            ': ALL Good!! ---',
            Math.floor(
              (Date.now() - userPromoteStats?.lastUpdatedTimeStamp) /
                (1000 * 60),
            ),
          );
        }
      }
    }, 240000);
  }

  async getPromotionStatsPlain() {
    let resp = '';
    const result = await this.promoteStatService.findAll();
    for (const data of result) {
      resp += `\n${data.client.toUpperCase()} : ${data.totalCount} ${data.totalCount > 0 ? ` | ${Number((Date.now() - data.lastUpdatedTimeStamp) / (1000 * 60)).toFixed(2)}` : ''}`;
    }
    return resp;
  }

  async leaveChannelsAll() {
    await this.sendToAll('leavechannels');
  }

  async sendToAll(endpoint: string) {
    const clients = await this.clientService.findAll();
    for (const client of clients) {
      const url = `${client.repl}/${endpoint}`;
      console.log('Trying : ', url);
      fetchWithTimeout(url);
      await sleep(2000);
    }
  }

  public async exitPrimary() {
    const clients = await this.clientService.findAll();
    for (const client of clients) {
      if (client.clientId.toLowerCase().includes('1')) {
        await fetchWithTimeout(`${client.repl}/exit`);
        await sleep(40000);
      }
    }
  }

  public async exitSecondary() {
    const clients = await this.clientService.findAll();
    for (const client of clients) {
      if (client.clientId.toLowerCase().includes('2')) {
        await fetchWithTimeout(`${client.repl}/exit`);
        await sleep(40000);
      }
    }
  }

  public async refreshPrimary() {
    const clients = await this.clientService.findAll();
    for (const client of clients) {
      if (client.clientId.toLowerCase().includes('1')) {
        await fetchWithTimeout(`${client.repl}/exec/refresh`);
        await sleep(40000);
      }
    }
  }

  public async refreshSecondary() {
    const clients = await this.clientService.findAll();
    for (const client of clients) {
      if (client.clientId.toLowerCase().includes('2')) {
        await fetchWithTimeout(`${client.repl}/exec/refresh`);
        await sleep(40000);
      }
    }
  }
  async getUser(limit?: number, skip?: number) {
    const currentDate = new Date();

    const weekAgoDate = new Date(currentDate);
    weekAgoDate.setDate(currentDate.getDate() - 7);

    const monthAgoDate = new Date(currentDate);
    monthAgoDate.setDate(currentDate.getDate() - 30);

    const threeMonthAgoDate = new Date(currentDate);
    threeMonthAgoDate.setDate(currentDate.getDate() - 90);

    const query = {
      expired: false,
      $or: [
        { createdAt: { $gt: monthAgoDate }, updatedAt: { $lt: weekAgoDate } },
        {
          createdAt: { $lte: monthAgoDate, $gt: threeMonthAgoDate },
          updatedAt: { $lt: monthAgoDate },
        },
        {
          createdAt: { $lte: threeMonthAgoDate },
          updatedAt: { $lte: threeMonthAgoDate },
        },
      ],
    };
    const users = await this.usersService.executeQuery(
      query,
      {},
      limit || 300,
      skip || 0,
    );
    return users;
  }
  getHello(): string {
    return 'Hello World!';
  }

  private cleanupOldAccessData(): void {
    const currentTime = Date.now();
    for (const [chatId, accessData] of this.userAccessData.entries()) {
      const recentAccessData = accessData.timestamps.filter(
        (timestamp) => currentTime - timestamp <= 15 * 60 * 1000,
      );

      if (recentAccessData.length === 0) {
        // No recent accesses, remove the entry completely
        this.userAccessData.delete(chatId);
      } else if (recentAccessData.length < accessData.timestamps.length) {
        // Update with only recent timestamps
        this.userAccessData.set(chatId, {
          timestamps: recentAccessData,
          videoDetails: accessData.videoDetails,
        });
      }
    }
  }

  async isRecentUser(
    chatId: string,
  ): Promise<{ count: number; videoDetails: VideoDetails }> {
    const accessData = this.userAccessData.get(chatId) || {
      timestamps: [],
      videoDetails: {},
    };
    const currentTime = Date.now();
    const recentAccessData = accessData.timestamps.filter(
      (timestamp) => currentTime - timestamp <= 15 * 60 * 1000,
    );
    recentAccessData.push(currentTime);

    this.userAccessData.set(chatId, {
      videoDetails: accessData.videoDetails,
      timestamps: recentAccessData, // Only store recent timestamps
    });

    const result = {
      count: recentAccessData.length,
      videoDetails: accessData.videoDetails,
    };
    console.log('Get', chatId, result);
    return result;
  }

  async updateRecentUser(
    chatId: string,
    videoDetails: VideoDetails,
  ): Promise<{ count: number; videoDetails: VideoDetails }> {
    const accessData = this.userAccessData.get(chatId) || {
      timestamps: [],
      videoDetails: {},
    };
    const updatedVideoDetails = { ...accessData.videoDetails, ...videoDetails };

    this.userAccessData.set(chatId, {
      videoDetails: updatedVideoDetails,
      timestamps: accessData.timestamps,
    });

    const result = {
      count: accessData.timestamps.length,
      videoDetails: updatedVideoDetails, // Return the updated video details
    };
    console.log('Update:', chatId, {
      videoDetails: updatedVideoDetails,
      timestamps: accessData.timestamps,
    });
    return result;
  }

  async resetRecentUser(chatId: string): Promise<{ count: number }> {
    this.userAccessData.delete(chatId);
    console.log('Deleted User Access Data for: ', chatId);
    return { count: 0 };
  }

  async getPaymentStats(chatId: string, profile: string) {
    const resp = {
      paid: 0,
      demoGiven: 0,
      secondShow: 0,
      fullShow: 0,
      latestCallTime: 0,
      canCall: true,
      videos: [],
    };
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const twentyDays = Date.now() - 20 * 24 * 60 * 60 * 1000;

    try {
      const query1 = {
        chatId,
        profile: { $exists: true, $ne: profile },
        payAmount: { $gte: 10 },
      };
      const query2 = { chatId, profile: { $exists: true, $ne: profile } };

      const document = await this.userDataService.executeQuery(query1);
      const document2 = await this.userDataService.executeQuery(query2);

      if (document.length > 0) {
        resp.paid = document.length;
      }

      if (document2.length > 0) {
        for (const doc of document2) {
          if (doc.canReply == 0 && doc.lastMsgTimeStamp > threeDaysAgo) {
            resp.canCall = false;
          }
          if (doc.callTime > threeDaysAgo) {
            if (doc.demoGiven) {
              resp.demoGiven++;
            }
            if (doc.secondShow) {
              resp.secondShow++;
            }
            if (doc.fullShow) {
              resp.fullShow++;
            }
            if (doc.callTime > resp.latestCallTime) {
              resp.latestCallTime = doc.callTime;
            }
            resp.videos.push(...doc.videos);
          } else {
            if (doc.lastMsgTimeStamp < twentyDays) {
              await fetchWithTimeout(
                `${ppplbot()}&text=${encodeURIComponent(`ReSetting UserData for Profile: ${doc.profile} | ChatId: ${doc.chatId}\n\n LastMsg: ${getReadableTimeDifference(doc.lastMsgTimeStamp, Date.now())} `)}`,
              );
              await this.userDataService.update(doc.profile, doc.chatId, {
                payAmount: 0,
                demoGiven: false,
                secondShow: false,
                highestPayAmount: 0,
                lastMsgTimeStamp: Date.now(),
              });
            }
          }
        }
      }
    } catch (error) {
      parseError(error);
    }
    console.log(resp);
    return resp;
  }

  // Known channels that have dedicated bot categories in the bots collection. Routing through
  // the category (BotsService) picks a bot that is ACTUALLY an admin in the channel and applies
  // the correct MarkdownV2 escaping — the raw ppplbot rotator below just cycles BOT_TOKENS, which
  // aren't members of these channels (Telegram then 400s "chat not found").
  private static readonly CHANNEL_CATEGORY_MAP: Record<
    string,
    ChannelCategory
  > = {
    '-1002529408777': ChannelCategory.VC_NOTIFICATIONS,
    '-1002472867139': ChannelCategory.VC_WARNINGS,
  };

  async sendToChannel(chatId: string, token: string, message: string) {
    function decodeIfEncoded(str: string): string {
      try {
        return str !== decodeURIComponent(str) ? decodeURIComponent(str) : str;
      } catch (e) {
        return str;
      }
    }
    function escapeMarkdownV2(text: string): string {
      // NOTE: `*` must be escaped for MarkdownV2 (it opens/closes bold); the old regex omitted it,
      // which 400s "can't parse entities" on any message containing `*`.
      text = text.replace(/([\\_*`\[\]()~>#+\-=|{}.!])/g, '\\$1');
      return text;
    }
    const decodedMessage = decodeIfEncoded(message);
    console.log('Message:', decodedMessage);

    // Prefer the native category-routed bot service for known channels (no explicit token given).
    // BotsService.sendMessageByCategory selects a bot that is actually an admin in the channel.
    // Send as PLAIN TEXT (no parseMode): these are arbitrary status strings ("Opened VcUI ✅✅",
    // "Video Data Fetch Error", etc.) with punctuation/emoji, not Markdown. executeSendMessage
    // does NOT escape, so passing MarkdownV2 with unescaped `.`/`-`/`!`/`*` would 400
    // "can't parse entities". Plain text renders reliably.
    const category = !token
      ? AppService.CHANNEL_CATEGORY_MAP[chatId]
      : undefined;
    if (category) {
      try {
        const sent = await this.botsService.sendMessageByCategory(
          category,
          decodedMessage,
        );
        if (sent) return { ok: true };
        console.warn(
          `sendToChannel: category ${category} send returned falsy; falling back to ppplbot`,
        );
      } catch (error) {
        parseError(error, `sendToChannel category ${category}`, false);
        // fall through to the legacy path below
      }
    }

    const escapedMessage = escapeMarkdownV2(decodedMessage);
    const encodedMessage = encodeURIComponent(escapedMessage).replace(
      /%5Cn/g,
      '%0A',
    );
    const url = `${ppplbot(chatId, token)}&parse_mode=MarkdownV2&text=${encodedMessage}`;
    return (await fetchWithTimeout(url, {}, 0))?.data;
  }

  async findAllMasked(query: object) {
    return await this.clientService.findAllMasked();
  }
  async portalData(query: object) {
    const client = (await this.clientService.findAllMasked())[0];
    const upis = await this.upiIdService.findOne();
    return { client, upis };
  }
  async joinchannelForClients(): Promise<string> {
    console.log('Joining Channel Started');
    await sleep(2000);
    const clients = await this.clientService.findAll();
    await Promise.all(
      clients.map(async (document) => {
        try {
          const resp = await fetchWithTimeout(
            `${document.repl}/channelinfo`,
            { timeout: 200000 },
            1,
          );
          await fetchWithTimeout(
            `${ppplbot()}&text=Channel SendTrue :: ${document.clientId}: ${resp.data.canSendTrueCount}`,
          );
          if (
            resp?.data?.canSendTrueCount &&
            resp?.data?.canSendTrueCount < 350
          ) {
            const result = await this.activeChannelsService.getActiveChannels(
              150,
              0,
              resp.data?.ids,
            );
            await fetchWithTimeout(
              `${ppplbot()}&text=Started Joining Channels for ${document.clientId}: ${result.length}`,
            );
            this.joinChannelMap.set(document.repl, result);
          }
        } catch (error) {
          parseError(error);
        }
      }),
    );
    this.joinChannelQueue();
    console.log('Joining Channel Triggered Succesfully for ', clients.length);
    return 'Initiated Joining channels';
  }

  async joinChannelQueue() {
    if (this.joinChannelIntervalId) return;
    this.joinChannelIntervalId = setInterval(
      async () => {
        if (this.joinChannelQueueRunning) return;
        this.joinChannelQueueRunning = true;
        try {
          const keys = Array.from(this.joinChannelMap.keys());
          if (keys.length > 0) {
            console.log('In JOIN CHANNEL interval: ', new Date().toISOString());
            const promises = keys.map(async (url) => {
              const channels = this.joinChannelMap.get(url);
              if (channels && channels.length > 0) {
                const channel = channels.shift();
                console.log(url, ' Pending Channels :', channels.length);
                this.joinChannelMap.set(url, channels);
                try {
                  await fetchWithTimeout(
                    `${url}/joinchannel?username=${channel.username}`,
                  );
                  console.log(url, ' Trying to join :', channel.username);
                } catch (error) {
                  parseError(error, 'Outer Err: ');
                }
              } else {
                this.joinChannelMap.delete(url);
              }
            });
            await Promise.all(promises);
          } else {
            this.clearJoinChannelInterval();
          }
        } finally {
          this.joinChannelQueueRunning = false;
        }
      },
      3 * 60 * 1000,
    );
  }

  clearJoinChannelInterval() {
    if (this.joinChannelIntervalId) {
      console.log('Cleared joinChannel Set Interval');
      clearInterval(this.joinChannelIntervalId);
      this.joinChannelIntervalId = null;
    }
  }

  async refreshmap() {
    await this.clientService.refreshMap();
    // await this.clientService.checkNpoint();
  }

  async blockUserAll(chatId: string) {
    let profileData = '';
    const userDatas = await this.userDataService.search({ chatId });
    for (const userData of userDatas) {
      const profileRegex = new RegExp(userData.profile, 'i');
      const profiles = await this.clientService.executeQuery({
        clientId: { $regex: profileRegex },
      });
      for (const profile of profiles) {
        const url = `${profile.repl}/blockuser/${chatId}`;
        console.log('Executing: ', url);
        const result = await fetchWithTimeout(url);
        console.log(result.data);
      }
      profileData = profileData + ' | ' + userData.profile;
    }
    return profileData;
  }

  async unblockUserAll(chatId: string) {
    let profileData = '';
    const userDatas = await this.userDataService.search({ chatId });
    for (const userData of userDatas) {
      const profileRegex = new RegExp(userData.profile, 'i');
      const profiles = await this.clientService.executeQuery({
        clientId: { $regex: profileRegex },
      });
      for (const profile of profiles) {
        const url = `${profile.repl}/unblockuser/${chatId}`;
        console.log('Executing: ', url);
        const result = await fetchWithTimeout(url);
        console.log(result.data);
      }
      profileData = profileData + ' | ' + userData.profile;
    }
    return profileData;
  }

  async getRequestCall(
    username: string,
    chatId: string,
    type: string = '1',
  ): Promise<any> {
    const user = (
      await this.clientService.search({ username: username.toLowerCase() })
    )[0];
    console.log(`Call Request Recived: ${username} | ${chatId}`);
    if (user) {
      return await this.eventManagerService.schedulePaidEvents(
        chatId,
        user.clientId,
        type,
      );
    }
    return { message: 'No Such User Found' };
  }

  async getUserData(
    profile: string,
    clientId: string,
    chatId: string,
  ): Promise<any> {
    if (!profile) {
      profile = clientId?.replace(/\d/g, '');
    }
    return await this.userDataService.findOne(profile, chatId);
  }

  async updateUserData(
    profile: string,
    clientId: string,
    body: any,
  ): Promise<any> {
    if (!profile) {
      profile = clientId?.replace(/\d/g, '');
    }
    const chatId = body.chatId;
    return await this.userDataService.update(profile, chatId, body);
  }

  async updateUserConfig(
    chatId: string,
    profile: string,
    data: any,
  ): Promise<any> {
    this.userDataService.update(profile, chatId, data);
  }

  async getUserConfig(filter: any): Promise<any> {
    // Compatibility route from UMS-test. The legacy implementation returned
    // undefined; retain that response until a configuration contract exists.
    void filter;
    return undefined;
  }

  async getallupiIds() {
    return await this.upiIdService.findOne();
  }

  async getUserInfo(filter: any): Promise<any> {
    const client = <any>(await this.clientService.executeQuery(filter))[0];
    const result = { ...(client._doc ? client._doc : client) };
    delete result['session'];
    delete result['mobile'];
    delete result['deployKey'];
    delete result['promoteMobile'];
    return result;
  }

  extractNumberFromString(inputString) {
    const regexPattern = /\d+/;
    const matchResult = inputString?.match(regexPattern);
    if (matchResult && matchResult.length > 0) {
      // Parse the matched string into a number and return it
      return parseInt(matchResult[0], 10);
    }
    // If no number is found, return null
    return null;
  }

  async createInitializedObject() {
    const clients = await this.clientService.findAll();
    const initializedObject = {};
    for (const user of clients) {
      if (this.extractNumberFromString(user.clientId))
        initializedObject[user.clientId.toUpperCase()] = {
          profile: user.clientId.toUpperCase(),
          totalCount: 0,
          totalPaid: 0,
          totalOldPaid: 0,
          oldPaidDemo: 0,
          totalpendingDemos: 0,
          oldPendingDemos: 0,
          totalNew: 0,
          totalNewPaid: 0,
          newPaidDemo: 0,
          newPendingDemos: 0,
          names: '',
          fullShowPPl: 0,
          fullShowNames: '',
        };
    }

    return initializedObject;
  }

  async getData(): Promise<string> {
    const profileData = await this.createInitializedObject();
    const stats = await this.statService.findAll();
    for (const stat of stats) {
      const {
        count,
        newUser,
        payAmount,
        demoGivenToday,
        demoGiven,
        client,
        name,
        secondShow,
      } = stat;

      if (client && profileData[client.toUpperCase()]) {
        const userData = profileData[client.toUpperCase()];
        userData.totalCount += count;
        userData.totalPaid += payAmount > 0 ? 1 : 0;
        userData.totalOldPaid += payAmount > 0 && !newUser ? 1 : 0;
        userData.oldPaidDemo += demoGivenToday && !newUser ? 1 : 0;
        userData.totalpendingDemos += payAmount > 25 && !demoGiven ? 1 : 0;
        userData.oldPendingDemos +=
          payAmount > 25 && !demoGiven && !newUser ? 1 : 0;
        if (payAmount > 25 && !demoGiven) {
          userData.names = userData.names + ` ${name} |`;
        }

        if (
          demoGiven &&
          ((payAmount > 90 && !secondShow) || (payAmount > 150 && secondShow))
        ) {
          userData.fullShowPPl++;
          userData.fullShowNames = userData.fullShowNames + ` ${name} |`;
        }

        if (newUser) {
          userData.totalNew += 1;
          userData.totalNewPaid += payAmount > 0 ? 1 : 0;
          userData.newPaidDemo += demoGivenToday ? 1 : 0;
          userData.newPendingDemos += payAmount > 25 && !demoGiven ? 1 : 0;
        }
      }
    }

    const profileDataArray = Object.entries(profileData);
    profileDataArray.sort(
      (a: any, b: any) => b[1].totalpendingDemos - a[1].totalpendingDemos,
    );
    let reply = '';
    for (const [profile, userData] of profileDataArray) {
      reply += this.renderDashboardRow(
        profile,
        (userData as any).totalpendingDemos,
        (userData as any).names,
      );
    }

    profileDataArray.sort(
      (a: any, b: any) => b[1].fullShowPPl - a[1].fullShowPPl,
    );
    let reply2 = '';
    for (const [profile, userData] of profileDataArray) {
      reply2 += this.renderDashboardRow(
        profile,
        (userData as any).fullShowPPl,
        (userData as any).fullShowNames,
      );
    }

    const reply3 = await this.getPromotionStats();

    return `<main class="dashboard">
        <header class="dashboard-header">
          <p class="dashboard-eyebrow">Live overview</p>
          <h1>UMS dashboard</h1>
          <p class="dashboard-subtitle">Refreshes automatically every 20 seconds</p>
        </header>
        <div class="dashboard-grid">
          <section class="dashboard-card">
            <h2>Pending demos</h2>
            <div class="metric-list">${reply}</div>
          </section>
          <section class="dashboard-card">
            <h2>Full-show users</h2>
            <div class="metric-list">${reply2}</div>
          </section>
        </div>
        <section class="dashboard-card dashboard-card-wide">
          <h2>Promotion stats</h2>
          <div class="metric-list">${reply3}</div>
        </section>
      </main>`;
  }

  async getPromotionStats(): Promise<string> {
    let resp = '';
    const result = await this.promoteStatService.findAll();
    for (const data of result) {
      const minutes = data.totalCount > 0
        ? Number((Date.now() - data.lastUpdatedTimeStamp) / (1000 * 60)).toFixed(2)
        : '';
      resp += this.renderDashboardRow(data.client, data.totalCount, minutes ? `${minutes} min ago` : '');
    }
    return resp;
  }

  private renderDashboardRow(
    label: unknown,
    count: unknown,
    details: unknown,
  ): string {
    const safeDetails = this.escapeDashboardHtml(details).trim();
    return `<div class="metric-row">
      <span class="metric-label">${this.escapeDashboardHtml(String(label).toUpperCase())}</span>
      <strong class="metric-value">${this.escapeDashboardHtml(count)}</strong>
      ${safeDetails ? `<span class="metric-detail">${safeDetails}</span>` : ''}
    </div>`;
  }

  private escapeDashboardHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    })[character] || character);
  }

  async checkAndRefresh() {
    if (Date.now() > this.refresTime) {
      this.refresTime = Date.now() + 5 * 60 * 1000;
      const clients = await this.clientService.findAll();
      for (const value of clients) {
        await fetchWithTimeout(`${value.repl}/markasread`);
        await sleep(3000);
      }
    }
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.joinChannelIntervalId) {
      clearInterval(this.joinChannelIntervalId);
    }
    for (const job of this.scheduledJobs) job.cancel();
  }
}

function getReadableTimeDifference(ms1: number, ms2: number): string {
  const diff = Math.abs(ms1 - ms2); // get absolute difference
  const seconds = Math.floor(diff / 1000);

  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor((seconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  let result = [];
  if (days > 0) result.push(`${days}d`);
  if (hours > 0) result.push(`${hours}h`);
  if (minutes > 0) result.push(`${minutes}m`);
  if (secs > 0 || result.length === 0) result.push(`${secs}s`);

  return result.join(' ');
}
