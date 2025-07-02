import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { ClientService } from '../clients/client.service';
import { PromoteClientService } from '../promote-clients/promote-client.service';
import { IpManagementService } from './ip-management.service';

@Injectable()
export class ClientIpIntegrationService {
    private readonly logger = new Logger(ClientIpIntegrationService.name);

    constructor(
        @Inject(forwardRef(() => ClientService))
        private readonly clientService: ClientService,
        @Inject(forwardRef(() => PromoteClientService))
        private readonly promoteClientService: PromoteClientService,
        private readonly ipManagementService: IpManagementService
    ) {}

    /**
     * Helper method to get promote mobiles for a client
     */
    private async getPromoteMobiles(clientId: string): Promise<string[]> {
        return await this.clientService.getPromoteMobiles(clientId);
    }

    /**
     * Auto-assign IPs to all mobile numbers for a client
     * Simplified: No mobileType needed - system handles main and promote mobiles automatically
     */
    async autoAssignIpsToClient(clientId: string): Promise<{
        clientId: string;
        mainMobile: { mobile: string; ipAddress: string | null; status: string };
        promoteMobiles: Array<{ mobile: string; ipAddress: string | null; status: string }>;
        summary: {
            totalMobiles: number;
            assigned: number;
            failed: number;
            errors: string[];
        };
    }> {
        this.logger.debug(`Auto-assigning IPs to all mobiles for client: ${clientId}`);

        // Get client data
        const client = await this.clientService.findOne(clientId);
        if (!client) {
            throw new NotFoundException(`Client ${clientId} not found`);
        }

        const errors: string[] = [];
        let assigned = 0;
        let failed = 0;

        // Handle main mobile
        let mainMobileResult: { mobile: string; ipAddress: string | null; status: string };
        try {
            const mainMapping = await this.ipManagementService.assignIpToMobile({
                mobile: client.mobile,
                clientId: client.clientId
            });
            mainMobileResult = {
                mobile: client.mobile,
                ipAddress: mainMapping.ipAddress,
                status: 'assigned'
            };
            assigned++;
        } catch (error) {
            mainMobileResult = {
                mobile: client.mobile,
                ipAddress: null,
                status: 'failed'
            };
            errors.push(`Main mobile ${client.mobile}: ${error.message}`);
            failed++;
        }

        // Handle promote mobiles
        const promoteMobileResults: Array<{ mobile: string; ipAddress: string | null; status: string }> = [];
        // Get promote mobiles from PromoteClient collection
        const promoteMobiles = await this.getPromoteMobiles(clientId);
        for (const promoteMobile of promoteMobiles) {
            try {
                const promoteMapping = await this.ipManagementService.assignIpToMobile({
                    mobile: promoteMobile,
                    clientId: client.clientId
                });
                promoteMobileResults.push({
                    mobile: promoteMobile,
                    ipAddress: promoteMapping.ipAddress,
                    status: 'assigned'
                });
                assigned++;
            } catch (error) {
                promoteMobileResults.push({
                    mobile: promoteMobile,
                    ipAddress: null,
                    status: 'failed'
                });
                errors.push(`Promote mobile ${promoteMobile}: ${error.message}`);
                failed++;
            }
        }

        const totalMobiles = 1 + promoteMobiles.length;

        this.logger.log(`Auto-assignment completed for ${clientId}: ${assigned}/${totalMobiles} assigned`);

        return {
            clientId,
            mainMobile: mainMobileResult,
            promoteMobiles: promoteMobileResults,
            summary: {
                totalMobiles,
                assigned,
                failed,
                errors
            }
        };
    }

    /**
     * Get IP for mobile with intelligent lookup
     * Can determine if mobile is main or promote from client context
     */
    async getIpForMobile(mobile: string, clientId?: string): Promise<string | null> {
        this.logger.debug(`Getting IP for mobile: ${mobile} (clientId: ${clientId})`);

        // Use the IP management service to get existing IP mapping
        const existingIp = await this.ipManagementService.getIpForMobile(mobile);
        if (existingIp) {
            this.logger.debug(`Found existing IP mapping for ${mobile}: ${existingIp}`);
            return existingIp;
        }

        // If clientId provided, we can get context about the mobile
        if (clientId) {
            const client = await this.clientService.findOne(clientId);
            if (client) {
                const isMainMobile = mobile === client.mobile;
                const { isPromote } = await this.clientService.isPromoteMobile(mobile);
                
                if (isMainMobile || isPromote) {
                    this.logger.debug(`Mobile ${mobile} belongs to client ${clientId} as ${isMainMobile ? 'main' : 'promote'} mobile`);
                    // Could auto-assign here if needed, but for now just return null
                }
            }
        }

        return null;
    }

    /**
     * Get comprehensive IP summary for a client
     * Shows all mobile numbers and their IP assignments
     */
    async getClientIpSummary(clientId: string): Promise<{
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
    }> {
        this.logger.debug(`Getting IP summary for client: ${clientId}`);

        // Get client data
        const client = await this.clientService.findOne(clientId);
        if (!client) {
            throw new NotFoundException(`Client ${clientId} not found`);
        }

        // Get client IP info from client service
        const clientIpInfo = await this.clientService.getClientIpInfo(clientId);

        // Process main mobile
        const mainMobile = {
            mobile: client.mobile,
            ipAddress: clientIpInfo.mainMobile.ipAddress,
            type: 'main' as const,
            status: clientIpInfo.mainMobile.hasIp ? 'assigned' : 'unassigned'
        };

        // Process promote mobiles
        const promoteMobilesData = clientIpInfo.promoteMobiles.map(pm => ({
            mobile: pm.mobile,
            ipAddress: pm.ipAddress,
            type: 'promote' as const,
            status: pm.hasIp ? 'assigned' : 'unassigned'
        }));

        // Calculate statistics
        const totalMobiles = clientIpInfo.summary.totalMobiles;
        const assignedMobiles = clientIpInfo.summary.mobilesWithIp;
        const unassignedMobiles = clientIpInfo.summary.mobilesWithoutIp;

        return {
            clientId,
            clientName: client.name,
            mainMobile,
            promoteMobiles: promoteMobilesData,
            dedicatedIps: clientIpInfo.dedicatedIps,
            statistics: {
                totalMobiles,
                assignedMobiles,
                unassignedMobiles,
                totalDedicatedIps: clientIpInfo.dedicatedIps.length
            }
        };
    }

    /**
     * Assign IP to main mobile number
     * Simplified: No mobileType field needed
     */
    async assignIpToMainMobile(clientId: string, mobile: string, preferredCountry?: string): Promise<{
        clientId: string;
        mobile: string;
        mobileType: 'main';
        ipAddress: string;
        status: string;
    }> {
        this.logger.debug(`Assigning IP to main mobile ${mobile} for client ${clientId}`);

        // Verify this is actually the main mobile for this client
        const client = await this.clientService.findOne(clientId);
        if (!client) {
            throw new NotFoundException(`Client ${clientId} not found`);
        }

        if (client.mobile !== mobile) {
            throw new BadRequestException(`Mobile ${mobile} is not the main mobile for client ${clientId}`);
        }

        const mapping = await this.ipManagementService.assignIpToMobile({
            mobile,
            clientId
        });

        return {
            clientId,
            mobile,
            mobileType: 'main',
            ipAddress: mapping.ipAddress,
            status: 'assigned'
        };
    }

    /**
     * Assign IPs to promote mobile numbers
     * Simplified: No mobileType field needed
     */
    async assignIpsToPromoteMobiles(clientId: string, promoteMobiles: string[], preferredCountry?: string): Promise<{
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
    }> {
        this.logger.debug(`Assigning IPs to ${promoteMobiles.length} promote mobiles for client ${clientId}`);

        // Verify client exists and mobiles are actually promote mobiles
        const client = await this.clientService.findOne(clientId);
        if (!client) {
            throw new NotFoundException(`Client ${clientId} not found`);
        }

        // Verify all provided mobiles are promote mobiles for this client
        const clientPromoteMobiles = await this.getPromoteMobiles(clientId);
        for (const mobile of promoteMobiles) {
            if (!clientPromoteMobiles.includes(mobile)) {
                throw new BadRequestException(`Mobile ${mobile} is not a promote mobile for client ${clientId}`);
            }
        }

        const bulkResult = await this.ipManagementService.bulkAssignIpsToMobiles({
            mobiles: promoteMobiles,
            clientId
        });

        // Transform results to include mobileType
        const results = bulkResult.results.map(result => ({
            mobile: result.mobile,
            mobileType: 'promote' as const,
            ipAddress: result.ipAddress,
            status: result.ipAddress ? 'assigned' : 'failed',
            error: result.error
        }));

        return {
            clientId,
            assigned: bulkResult.assigned,
            failed: bulkResult.failed,
            results
        };
    }

    /**
     * Helper method to determine mobile type from client data
     * This shows how we can determine mobile type without storing it in the mapping
     */
    async getMobileType(mobile: string, clientId?: string): Promise<'main' | 'promote' | 'unknown'> {
        if (!clientId) {
            // Use IP management service to find clientId
            const existingIp = await this.ipManagementService.getIpForMobile(mobile);
            if (!existingIp) {
                return 'unknown';
            }
            // If we can't determine clientId from IP service, we need to implement this logic there
            return 'unknown';
        }

        const client = await this.clientService.findOne(clientId);
        if (!client) {
            return 'unknown';
        }

        if (mobile === client.mobile) {
            return 'main';
        } else {
            // Check if mobile is a promote mobile for this client
            const { isPromote } = await this.clientService.isPromoteMobile(mobile);
            return isPromote ? 'promote' : 'unknown';
        }
    }
}