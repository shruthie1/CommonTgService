import { ClientService } from '../clients/client.service';
import { PromoteClientService } from '../promote-clients/promote-client.service';
import { IpManagementService } from './ip-management.service';
export declare class ClientIpIntegrationService {
    private readonly clientService;
    private readonly promoteClientService;
    private readonly ipManagementService;
    private readonly logger;
    constructor(clientService: ClientService, promoteClientService: PromoteClientService, ipManagementService: IpManagementService);
    private getPromoteMobiles;
    autoAssignIpsToClient(clientId: string): Promise<{
        clientId: string;
        mainMobile: {
            mobile: string;
            ipAddress: string | null;
            status: string;
        };
        promoteMobiles: Array<{
            mobile: string;
            ipAddress: string | null;
            status: string;
        }>;
        summary: {
            totalMobiles: number;
            assigned: number;
            failed: number;
            errors: string[];
        };
    }>;
    getIpForMobile(mobile: string, clientId?: string, autoAssign?: boolean): Promise<string | null>;
    getClientIpSummary(clientId: string): Promise<{
        clientId: string;
        clientName: string;
        mainMobile: {
            mobile: string;
            ipAddress: string | null;
            type: 'main';
            status: string;
        };
        promoteMobiles: Array<{
            mobile: string;
            ipAddress: string | null;
            type: 'promote';
            status: string;
        }>;
        dedicatedIps: string[];
        statistics: {
            totalMobiles: number;
            assignedMobiles: number;
            unassignedMobiles: number;
            totalDedicatedIps: number;
        };
    }>;
    assignIpToMainMobile(clientId: string, mobile: string, preferredCountry?: string): Promise<{
        clientId: string;
        mobile: string;
        mobileType: 'main';
        ipAddress: string;
        status: string;
    }>;
    assignIpsToPromoteMobiles(clientId: string, promoteMobiles: string[], preferredCountry?: string): Promise<{
        clientId: string;
        assigned: number;
        failed: number;
        results: Array<{
            mobile: string;
            mobileType: 'promote';
            ipAddress?: string;
            status: string;
            error?: string;
        }>;
    }>;
    getMobileType(mobile: string, clientId?: string): Promise<'main' | 'promote' | 'unknown'>;
    releaseIpFromMobile(mobile: string, clientId?: string): Promise<{
        mobile: string;
        releasedIp: string | null;
        status: string;
        message: string;
    }>;
    checkMobileIpStatus(mobile: string): Promise<{
        mobile: string;
        hasIp: boolean;
        ipAddress: string | null;
        mobileType?: 'main' | 'promote' | 'unknown';
        clientId?: string;
    }>;
}
