import { ExecuteRequestDto } from './components/shared/dto/execute-request.dto';
import { Response } from 'express';
import { ClientService } from './components/clients/client.service';
import { AppService, VideoDetails } from './app.service';
export declare class AppController {
    private readonly clientService;
    private readonly appService;
    private readonly logger;
    private readonly DEFAULT_TIMEOUT;
    private readonly MAX_CONTENT_SIZE;
    constructor(clientService: ClientService, appService: AppService);
    getHello(): string;
    health(): string;
    refreshMap(): Promise<void>;
    setupClient(clientId: string, query: any): Promise<void>;
    forward(url: string, query: Record<string, unknown>): Promise<any>;
    processUsers(limit: number, skip: number): Promise<{
        processed: number;
        skipped: boolean;
    }>;
    exit(): string;
    executeRequest(req: ExecuteRequestDto, res: Response): Promise<any>;
    private sanitizeHeaders;
    private sanitizeUrl;
    private sanitizeParams;
    private isSensitiveField;
    private isBinaryResponse;
    private handleRequestError;
    blockUserAll(tgId: string): Promise<string>;
    unblockUserAll(tgId: string): Promise<string>;
    isRecentUser(chatId: string): Promise<{
        count: number;
        videoDetails: VideoDetails;
    }>;
    updateRecentUser(chatId: string, videoDetails: any): Promise<VideoDetails>;
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
    sendToChannel(message: string, chatId: string, token: string): Promise<any>;
    webTelemetry(message: string): Promise<{
        ok: boolean;
    }>;
    sendToAll(query: string): Promise<string>;
    joinChannelsforBufferClients(): Promise<string>;
    maskedCls(query: object): Promise<any>;
    portalData(query: object): Promise<{
        client: any;
        upis: object;
    }>;
    requestCall(username: string, chatId: string, type?: string): Promise<any>;
    refreshPrimary(): Promise<string>;
    refreshSecondary(): Promise<string>;
    exitPrimary(): Promise<string>;
    exitSecondary(): Promise<string>;
    getVidData(profile: string, clientId: string, chatId: any): Promise<any>;
    updateVidData(profile: string, clientId: string, body: any): Promise<any>;
    updtaeUserConfig(filter: any, data: any): Promise<void>;
    getUserConfig(filter: any): Promise<any>;
    getallupiIds(): Promise<any>;
    updateUserConfig(chatId: string, profile: string, data: any): Promise<any>;
    getUserInfo(filter: any): Promise<any>;
    getData(res: Response): Promise<void>;
}
