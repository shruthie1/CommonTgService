import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { ClientService } from '../clients/client.service';
import { PromoteClientService } from '../promote-clients/promote-client.service';
import { IpManagementService } from './ip-management.service';
import { Logger } from '../../utils';

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
        if (!clientId || clientId.trim() === '') {
            throw new BadRequestException('Client ID is required');
        }

        this.logger.debug(`Auto-assigning IPs to all mobiles for client: ${clientId}`);

        try {
            // Get client data
            const client = await this.clientService.findOne(clientId);
            if (!client) {
                throw new NotFoundException(`Client ${clientId} not found`);
            }

            if (!client.mobile || client.mobile.trim() === '') {
                throw new BadRequestException(`Client ${clientId} does not have a valid main mobile number`);
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
                this.logger.debug(`Successfully assigned IP ${mainMapping.ipAddress} to main mobile ${client.mobile}`);
            } catch (error) {
                mainMobileResult = {
                    mobile: client.mobile,
                    ipAddress: null,
                    status: 'failed'
                };
                const errorMsg = `Main mobile ${client.mobile}: ${error.message}`;
                errors.push(errorMsg);
                failed++;
                this.logger.error(errorMsg);
            }

            // Handle promote mobiles
            const promoteMobileResults: Array<{ mobile: string; ipAddress: string | null; status: string }> = [];
            try {
                // Get promote mobiles from PromoteClient collection
                const promoteMobiles = await this.getPromoteMobiles(clientId);
                this.logger.debug(`Found ${promoteMobiles.length} promote mobiles for client ${clientId}`);
                
                for (const promoteMobile of promoteMobiles) {
                    if (!promoteMobile || promoteMobile.trim() === '') {
                        const errorMsg = `Invalid promote mobile: empty or null`;
                        errors.push(errorMsg);
                        failed++;
                        promoteMobileResults.push({
                            mobile: promoteMobile,
                            ipAddress: null,
                            status: 'failed'
                        });
                        continue;
                    }

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
                        this.logger.debug(`Successfully assigned IP ${promoteMapping.ipAddress} to promote mobile ${promoteMobile}`);
                    } catch (error) {
                        promoteMobileResults.push({
                            mobile: promoteMobile,
                            ipAddress: null,
                            status: 'failed'
                        });
                        const errorMsg = `Promote mobile ${promoteMobile}: ${error.message}`;
                        errors.push(errorMsg);
                        failed++;
                        this.logger.error(errorMsg);
                    }
                }
            } catch (error) {
                const errorMsg = `Failed to retrieve promote mobiles for client ${clientId}: ${error.message}`;
                errors.push(errorMsg);
                this.logger.error(errorMsg);
            }

            const totalMobiles = 1 + promoteMobileResults.length;

            this.logger.log(`Auto-assignment completed for ${clientId}: ${assigned}/${totalMobiles} assigned, ${failed} failed`);

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
        } catch (error) {
            this.logger.error(`Failed to auto-assign IPs for client ${clientId}: ${error.message}`);
            if (error instanceof BadRequestException || error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException(`Failed to auto-assign IPs for client ${clientId}: ${error.message}`);
        }
    }

    /**
     * Get IP for mobile with intelligent lookup and optional auto-assignment
     * Can determine if mobile is main or promote from client context
     */
    async getIpForMobile(mobile: string, clientId?: string, autoAssign: boolean = false): Promise<string | null> {
        if (!mobile || mobile.trim() === '') {
            throw new BadRequestException('Mobile number is required');
        }

        this.logger.debug(`Getting IP for mobile: ${mobile} (clientId: ${clientId}, autoAssign: ${autoAssign})`);

        try {
            // Use the IP management service to get existing IP mapping
            const existingIp = await this.ipManagementService.getIpForMobile(mobile);
            if (existingIp) {
                this.logger.debug(`Found existing IP mapping for ${mobile}: ${existingIp}`);
                return existingIp;
            }

            // If auto-assignment is enabled and clientId provided
            if (autoAssign && clientId) {
                const client = await this.clientService.findOne(clientId);
                if (client) {
                    const isMainMobile = mobile === client.mobile;
                    const { isPromote } = await this.clientService.isPromoteMobile(mobile);
                    
                    if (isMainMobile || isPromote) {
                        this.logger.debug(`Mobile ${mobile} belongs to client ${clientId} as ${isMainMobile ? 'main' : 'promote'} mobile - attempting auto-assignment`);
                        
                        try {
                            const mapping = await this.ipManagementService.assignIpToMobile({
                                mobile,
                                clientId
                            });
                            this.logger.log(`Auto-assigned IP ${mapping.ipAddress} to mobile ${mobile}`);
                            return mapping.ipAddress;
                        } catch (assignError) {
                            this.logger.warn(`Failed to auto-assign IP to mobile ${mobile}: ${assignError.message}`);
                            // Continue to return null instead of throwing error
                        }
                    } else {
                        this.logger.debug(`Mobile ${mobile} does not belong to client ${clientId}`);
                    }
                } else {
                    this.logger.warn(`Client ${clientId} not found`);
                }
            }

            return null;
        } catch (error) {
            this.logger.error(`Error getting IP for mobile ${mobile}: ${error.message}`);
            if (error instanceof BadRequestException || error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException(`Failed to get IP for mobile ${mobile}`);
        }
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
        if (!clientId || clientId.trim() === '') {
            throw new BadRequestException('Client ID is required');
        }

        this.logger.debug(`Getting IP summary for client: ${clientId}`);

        try {
            // Get client data
            const client = await this.clientService.findOne(clientId);
            if (!client) {
                throw new NotFoundException(`Client ${clientId} not found`);
            }

            // Get client IP info from client service
            const clientIpInfo = await this.clientService.getClientIpInfo(clientId);

            // Validate client IP info structure
            if (!clientIpInfo || !clientIpInfo.mainMobile) {
                throw new BadRequestException(`Invalid client IP info structure for client ${clientId}`);
            }

            // Process main mobile
            const mainMobile = {
                mobile: client.mobile,
                ipAddress: clientIpInfo.mainMobile.ipAddress,
                type: 'main' as const,
                status: clientIpInfo.mainMobile.hasIp ? 'assigned' : 'unassigned'
            };

            // Process promote mobiles with validation
            const promoteMobilesData = (clientIpInfo.promoteMobiles || []).map(pm => {
                if (!pm || typeof pm.mobile !== 'string') {
                    this.logger.warn(`Invalid promote mobile data found for client ${clientId}`);
                    return null;
                }
                return {
                    mobile: pm.mobile,
                    ipAddress: pm.ipAddress,
                    type: 'promote' as const,
                    status: pm.hasIp ? 'assigned' : 'unassigned'
                };
            }).filter(pm => pm !== null);

            // Calculate statistics with validation
            const totalMobiles = clientIpInfo.summary?.totalMobiles || (1 + promoteMobilesData.length);
            const assignedMobiles = clientIpInfo.summary?.mobilesWithIp || 0;
            const unassignedMobiles = clientIpInfo.summary?.mobilesWithoutIp || (totalMobiles - assignedMobiles);

            return {
                clientId,
                clientName: client.name || 'Unknown Client',
                mainMobile,
                promoteMobiles: promoteMobilesData,
                dedicatedIps: clientIpInfo.dedicatedIps || [],
                statistics: {
                    totalMobiles,
                    assignedMobiles,
                    unassignedMobiles,
                    totalDedicatedIps: (clientIpInfo.dedicatedIps || []).length
                }
            };
        } catch (error) {
            this.logger.error(`Failed to get IP summary for client ${clientId}: ${error.message}`);
            if (error instanceof BadRequestException || error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException(`Failed to get IP summary for client ${clientId}: ${error.message}`);
        }
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
        if (!mobile || mobile.trim() === '') {
            return 'unknown';
        }

        if (!clientId) {
            // Try to find clientId from IP mapping
            try {
                const mappings = await this.ipManagementService.getClientMobileMappings(clientId);
                const mapping = mappings.find(m => m.mobile === mobile);
                if (mapping) {
                    clientId = mapping.clientId;
                } else {
                    return 'unknown';
                }
            } catch (error) {
                this.logger.debug(`Could not determine clientId for mobile ${mobile}: ${error.message}`);
                return 'unknown';
            }
        }

        try {
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
        } catch (error) {
            this.logger.error(`Error determining mobile type for ${mobile}: ${error.message}`);
            return 'unknown';
        }
    }

    /**
     * Release IP from mobile and return it to available pool
     */
    async releaseIpFromMobile(mobile: string, clientId?: string): Promise<{
        mobile: string;
        releasedIp: string | null;
        status: string;
        message: string;
    }> {
        if (!mobile || mobile.trim() === '') {
            throw new BadRequestException('Mobile number is required');
        }

        this.logger.debug(`Releasing IP from mobile: ${mobile}`);

        try {
            // Check if mobile has an IP assigned
            const currentIp = await this.ipManagementService.getIpForMobile(mobile);
            if (!currentIp) {
                return {
                    mobile,
                    releasedIp: null,
                    status: 'no_ip_assigned',
                    message: `No IP assigned to mobile ${mobile}`
                };
            }

            // Release the IP
            await this.ipManagementService.releaseIpFromMobile({ mobile });

            this.logger.log(`Successfully released IP ${currentIp} from mobile ${mobile}`);

            return {
                mobile,
                releasedIp: currentIp,
                status: 'released',
                message: `Successfully released IP ${currentIp} from mobile ${mobile}`
            };
        } catch (error) {
            this.logger.error(`Failed to release IP from mobile ${mobile}: ${error.message}`);
            throw new BadRequestException(`Failed to release IP from mobile ${mobile}: ${error.message}`);
        }
    }

    /**
     * Check if a mobile has an IP assigned
     */
    async checkMobileIpStatus(mobile: string): Promise<{
        mobile: string;
        hasIp: boolean;
        ipAddress: string | null;
        mobileType?: 'main' | 'promote' | 'unknown';
        clientId?: string;
    }> {
        if (!mobile || mobile.trim() === '') {
            throw new BadRequestException('Mobile number is required');
        }

        try {
            const ipAddress = await this.ipManagementService.getIpForMobile(mobile);
            const hasIp = ipAddress !== null;

            // Try to determine mobile type and client
            let mobileType: 'main' | 'promote' | 'unknown' = 'unknown';
            let clientId: string | undefined;

            if (hasIp) {
                // Find the mapping to get clientId
                try {
                    // This requires a method to find mapping by mobile - we might need to add this
                    // For now, we'll use the existing logic
                    mobileType = await this.getMobileType(mobile);
                } catch (error) {
                    this.logger.debug(`Could not determine mobile type for ${mobile}: ${error.message}`);
                }
            }

            return {
                mobile,
                hasIp,
                ipAddress,
                mobileType,
                clientId
            };
        } catch (error) {
            this.logger.error(`Error checking IP status for mobile ${mobile}: ${error.message}`);
            throw new BadRequestException(`Failed to check IP status for mobile ${mobile}: ${error.message}`);
        }
    }
}