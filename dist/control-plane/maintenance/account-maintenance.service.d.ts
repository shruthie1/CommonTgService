import { ActiveChannelsService, BufferClientService, ChannelsService, PromoteClientService, UsersService } from '../../components';
export declare class AccountMaintenanceService {
    private readonly usersService;
    private readonly channelsService;
    private readonly activeChannelsService;
    private readonly bufferClientService;
    private readonly promoteClientService;
    private readonly logger;
    private running;
    constructor(usersService: UsersService, channelsService: ChannelsService, activeChannelsService: ActiveChannelsService, bufferClientService: BufferClientService, promoteClientService: PromoteClientService);
    processEligibleUsers(limit?: number, skip?: number): Promise<{
        processed: number;
        skipped: boolean;
    }>;
    checkPromoteClients(): Promise<void>;
    rotateReadyPromoteClients(): Promise<boolean>;
    preparePromoteClientJoin(): Promise<string>;
    refreshPromoteClientInfo(): Promise<void>;
    private findEligibleUsers;
    private updateUser;
    private persistDiscoveredChannels;
}
