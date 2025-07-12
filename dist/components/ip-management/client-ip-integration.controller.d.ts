import { ClientIpIntegrationService } from './client-ip-integration.service';
export declare class ClientIpIntegrationController {
    private readonly clientIpIntegrationService;
    constructor(clientIpIntegrationService: ClientIpIntegrationService);
    autoAssignIpsToClient(clientId: string): Promise<any>;
    getIpForMobile(mobile: string, clientId?: string, autoAssign?: string): Promise<{
        mobile: string;
        ipAddress: string | null;
        source: string;
    }>;
    getClientIpSummary(clientId: string): Promise<any>;
    autoAssignAllIpsViaClientService(clientId: string): Promise<any>;
    assignIpToMainMobile(clientId: string, body: {
        mobile: string;
        preferredCountry?: string;
    }): Promise<any>;
    assignIpsToPromoteMobiles(clientId: string, body: {
        promoteMobiles: string[];
        preferredCountry?: string;
    }): Promise<any>;
    releaseIpFromMobile(mobile: string, clientId?: string): Promise<any>;
    checkMobileIpStatus(mobile: string): Promise<any>;
}
