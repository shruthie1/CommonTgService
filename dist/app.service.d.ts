import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { UsersService, TelegramService, UserDataService, ClientService, ActiveChannelsService, UpiIdService, Stat1Service, Stat2Service, PromoteStatService, ChannelsService, User, BufferClientService, TimestampService, BotsService, EventManagerService } from './components';
import type { SetupClientQueryDto } from './components/clients/dto/setup-client.dto';
import { RuntimeConfigService } from './control-plane/config/runtime-config.service';
import { AccountMaintenanceService } from './control-plane/maintenance/account-maintenance.service';
export interface VideoDetails {
    videoId?: string;
    title?: string;
    duration?: number;
    [key: string]: any;
}
export declare class AppService implements OnModuleInit, OnModuleDestroy {
    private usersService;
    private telegramService;
    private userDataService;
    private clientService;
    private activeChannelsService;
    private upiIdService;
    private statService;
    private stat2Service;
    private promoteStatService;
    private channelsService;
    private timestampService;
    private botsService;
    private readonly eventManagerService;
    private readonly runtimeConfig;
    private readonly bufferClientService;
    private readonly maintenance;
    private readonly logger;
    private userAccessData;
    private cleanupInterval;
    private joinChannelIntervalId;
    private joinChannelMap;
    private joinChannelQueueRunning;
    private readonly scheduledJobs;
    private refresTime;
    constructor(usersService: UsersService, telegramService: TelegramService, userDataService: UserDataService, clientService: ClientService, activeChannelsService: ActiveChannelsService, upiIdService: UpiIdService, statService: Stat1Service, stat2Service: Stat2Service, promoteStatService: PromoteStatService, channelsService: ChannelsService, timestampService: TimestampService, botsService: BotsService, eventManagerService: EventManagerService, runtimeConfig: RuntimeConfigService, bufferClientService: BufferClientService, maintenance: AccountMaintenanceService);
    onModuleInit(): void;
    setupClient(clientId: string, query: SetupClientQueryDto): Promise<void>;
    checkBufferClients(): Promise<void>;
    rotateReadyBufferClients(): Promise<boolean>;
    joinBufferClients(): Promise<void>;
    updateBufferClientInfo(): Promise<void>;
    forwardGetRequest(externalUrl: string, queryParams: Record<string, unknown>): Promise<any>;
    processEligibleUsers(limit: number, skip: number): Promise<{
        processed: number;
        skipped: boolean;
    }>;
    checkPromotions(): Promise<void>;
    getPromotionStatsPlain(): Promise<string>;
    leaveChannelsAll(): Promise<void>;
    sendToAll(endpoint: string): Promise<void>;
    exitPrimary(): Promise<void>;
    exitSecondary(): Promise<void>;
    refreshPrimary(): Promise<void>;
    refreshSecondary(): Promise<void>;
    getUser(limit?: number, skip?: number): Promise<User[]>;
    getHello(): string;
    private cleanupOldAccessData;
    isRecentUser(chatId: string): Promise<{
        count: number;
        videoDetails: VideoDetails;
    }>;
    updateRecentUser(chatId: string, videoDetails: VideoDetails): Promise<{
        count: number;
        videoDetails: VideoDetails;
    }>;
    resetRecentUser(chatId: string): Promise<{
        count: number;
    }>;
    getPaymentStats(chatId: string, profile: string): Promise<{
        paid: number;
        demoGiven: number;
        secondShow: number;
        fullShow: number;
        latestCallTime: number;
        canCall: boolean;
        videos: any[];
    }>;
    private static readonly CHANNEL_CATEGORY_MAP;
    sendToChannel(chatId: string, token: string, message: string): Promise<any>;
    findAllMasked(query: object): Promise<Partial<import("./components").Client>[]>;
    portalData(query: object): Promise<{
        client: Partial<import("./components").Client>;
        upis: any;
    }>;
    joinchannelForClients(): Promise<string>;
    joinChannelQueue(): Promise<void>;
    clearJoinChannelInterval(): void;
    refreshmap(): Promise<void>;
    blockUserAll(chatId: string): Promise<string>;
    unblockUserAll(chatId: string): Promise<string>;
    getRequestCall(username: string, chatId: string, type?: string): Promise<any>;
    getUserData(profile: string, clientId: string, chatId: string): Promise<any>;
    updateUserData(profile: string, clientId: string, body: any): Promise<any>;
    updateUserConfig(chatId: string, profile: string, data: any): Promise<any>;
    getUserConfig(filter: any): Promise<any>;
    getallupiIds(): Promise<any>;
    getUserInfo(filter: any): Promise<any>;
    extractNumberFromString(inputString: any): number;
    createInitializedObject(): Promise<{}>;
    getData(): Promise<string>;
    getPromotionStats(): Promise<{
        rows: string;
        summary: string;
    }>;
    private renderPromotionSummary;
    private renderOverviewRow;
    private renderOverviewMetric;
    private renderPromotionRow;
    private formatDashboardAge;
    private escapeDashboardHtml;
    checkAndRefresh(): Promise<void>;
    onModuleDestroy(): void;
}
