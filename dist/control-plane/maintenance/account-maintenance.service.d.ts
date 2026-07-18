import { OnModuleDestroy } from '@nestjs/common';
import { ActiveChannelsService, ChannelsService, PromoteClientService, UsersService } from '../../components';
import { RuntimeConfigService } from '../config/runtime-config.service';
export declare class AccountMaintenanceService implements OnModuleDestroy {
    private readonly usersService;
    private readonly channelsService;
    private readonly activeChannelsService;
    private readonly promoteClientService;
    private readonly config;
    private readonly logger;
    private running;
    private readonly delayedJoinTimers;
    constructor(usersService: UsersService, channelsService: ChannelsService, activeChannelsService: ActiveChannelsService, promoteClientService: PromoteClientService, config: RuntimeConfigService);
    processEligibleUsers(limit?: number, skip?: number): Promise<{
        processed: number;
        skipped: boolean;
    }>;
    checkPromoteClients(): Promise<void>;
    onModuleDestroy(): void;
    private schedulePromoteClientJoin;
    private findEligibleUsers;
    private updateUser;
    private persistDiscoveredChannels;
}
