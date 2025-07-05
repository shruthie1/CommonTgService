import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpException, HttpStatus } from '@nestjs/common';
import { 
    ApiTags, 
    ApiOperation, 
    ApiResponse, 
    ApiParam, 
    ApiQuery, 
    ApiBody,
    ApiOkResponse,
    ApiBadRequestResponse,
    ApiNotFoundResponse,
    ApiConflictResponse
} from '@nestjs/swagger';
import { IpManagementService } from './ip-management.service';
import { CreateProxyIpDto } from './dto/create-proxy-ip.dto';
import { UpdateProxyIpDto } from './dto/update-proxy-ip.dto';
import { CreateIpMobileMappingDto } from './dto/create-ip-mobile-mapping.dto';
import { UpdateIpMobileMappingDto } from './dto/update-ip-mobile-mapping.dto';
import { SearchProxyIpDto, SearchIpMobileMappingDto } from './dto/search-ip.dto';
import { AssignIpToMobileDto, BulkAssignIpDto, ReleaseIpFromMobileDto } from './dto/assign-ip.dto';
import { ProxyIp } from './schemas/proxy-ip.schema';
import { IpMobileMapping } from './schemas/ip-mobile-mapping.schema';

@ApiTags('IP Management')
@Controller('ip-management')
export class IpManagementController {
    constructor(private readonly ipManagementService: IpManagementService) {}

    // ==================== PROXY IP MANAGEMENT ====================

    @Post('proxy-ips')
    @ApiOperation({ summary: 'Create a new proxy IP' })
    @ApiBody({ type: CreateProxyIpDto })
    @ApiOkResponse({ description: 'Proxy IP created successfully', type: ProxyIp })
    @ApiBadRequestResponse({ description: 'Invalid input data' })
    @ApiConflictResponse({ description: 'Proxy IP already exists' })
    async createProxyIp(@Body() createProxyIpDto: CreateProxyIpDto): Promise<ProxyIp> {
        try {
            return await this.ipManagementService.createProxyIp(createProxyIpDto);
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    @Post('proxy-ips/bulk')
    @ApiOperation({ summary: 'Bulk create proxy IPs' })
    @ApiBody({ type: [CreateProxyIpDto] })
    @ApiOkResponse({ description: 'Bulk creation completed' })
    async bulkCreateProxyIps(@Body() proxyIps: CreateProxyIpDto[]): Promise<{ created: number; failed: number; errors: string[] }> {
        try {
            return await this.ipManagementService.bulkCreateProxyIps(proxyIps);
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    @Get('proxy-ips')
    @ApiOperation({ summary: 'Get all proxy IPs' })
    @ApiOkResponse({ description: 'Proxy IPs retrieved successfully', type: [ProxyIp] })
    async getAllProxyIps(): Promise<ProxyIp[]> {
        try {
            return await this.ipManagementService.findAllProxyIps();
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // Search functionality temporarily disabled for simplification
    // @Get('proxy-ips/search')
    // @ApiOperation({ summary: 'Search proxy IPs with filters' })
    // @ApiQuery({ name: 'ipAddress', required: false, description: 'IP address to search for' })
    // @ApiQuery({ name: 'port', required: false, description: 'Port number to search for' })
    // @ApiQuery({ name: 'protocol', required: false, description: 'Protocol type', enum: ['http', 'https', 'socks5'] })
    // @ApiQuery({ name: 'country', required: false, description: 'Country code' })
    // @ApiQuery({ name: 'status', required: false, description: 'Status', enum: ['active', 'inactive', 'blocked', 'maintenance'] })
    // @ApiQuery({ name: 'isAssigned', required: false, description: 'Assignment status' })
    // @ApiQuery({ name: 'assignedToClient', required: false, description: 'Client ID' })
    // @ApiQuery({ name: 'provider', required: false, description: 'Provider name' })
    // @ApiOkResponse({ description: 'Search results', type: [ProxyIp] })
    // async searchProxyIps(@Query() searchDto: SearchProxyIpDto): Promise<ProxyIp[]> {
    //     try {
    //         return await this.ipManagementService.searchProxyIps(searchDto);
    //     } catch (error) {
    //         throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    //     }
    // }

    // Get specific proxy IP functionality temporarily disabled for simplification
    // @Get('proxy-ips/:ipAddress/:port')
    // @ApiOperation({ summary: 'Get a specific proxy IP' })
    // @ApiParam({ name: 'ipAddress', description: 'IP address' })
    // @ApiParam({ name: 'port', description: 'Port number' })
    // @ApiOkResponse({ description: 'Proxy IP found', type: ProxyIp })
    // @ApiNotFoundResponse({ description: 'Proxy IP not found' })
    // async getProxyIpById(@Param('ipAddress') ipAddress: string, @Param('port') port: string): Promise<ProxyIp> {
    //     try {
    //         return await this.ipManagementService.findProxyIpById(ipAddress, parseInt(port));
    //     } catch (error) {
    //         throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    //     }
    // }

    @Put('proxy-ips/:ipAddress/:port')
    @ApiOperation({ summary: 'Update a proxy IP' })
    @ApiParam({ name: 'ipAddress', description: 'IP address' })
    @ApiParam({ name: 'port', description: 'Port number' })
    @ApiBody({ type: UpdateProxyIpDto })
    @ApiOkResponse({ description: 'Proxy IP updated successfully', type: ProxyIp })
    @ApiNotFoundResponse({ description: 'Proxy IP not found' })
    async updateProxyIp(
        @Param('ipAddress') ipAddress: string,
        @Param('port') port: string,
        @Body() updateProxyIpDto: UpdateProxyIpDto
    ): Promise<ProxyIp> {
        try {
            return await this.ipManagementService.updateProxyIp(ipAddress, parseInt(port), updateProxyIpDto);
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    @Delete('proxy-ips/:ipAddress/:port')
    @ApiOperation({ summary: 'Delete a proxy IP' })
    @ApiParam({ name: 'ipAddress', description: 'IP address' })
    @ApiParam({ name: 'port', description: 'Port number' })
    @ApiOkResponse({ description: 'Proxy IP deleted successfully' })
    @ApiNotFoundResponse({ description: 'Proxy IP not found' })
    @ApiBadRequestResponse({ description: 'Cannot delete assigned IP' })
    async deleteProxyIp(@Param('ipAddress') ipAddress: string, @Param('port') port: string): Promise<{ message: string }> {
        try {
            await this.ipManagementService.deleteProxyIp(ipAddress, parseInt(port));
            return { message: 'Proxy IP deleted successfully' };
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    // ==================== IP-MOBILE MAPPING MANAGEMENT ====================

    // Get all mappings functionality temporarily disabled for simplification
    // Use getClientMappings with specific clientId instead
    // @Get('mappings')
    // @ApiOperation({ summary: 'Get all IP-mobile mappings' })
    // @ApiOkResponse({ description: 'Mappings retrieved successfully', type: [IpMobileMapping] })
    // async getAllMappings(): Promise<IpMobileMapping[]> {
    //     try {
    //         // For simplified system, return all active mappings across all clients
    //         const allMappings = await this.ipMobileMappingModel.find({ status: 'active' }).lean();
    //         return allMappings;
    //     } catch (error) {
    //         throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    //     }
    // }

    // Search functionality temporarily disabled for simplification
    // @Get('mappings/search')
    // @ApiOperation({ summary: 'Search IP-mobile mappings with filters' })
    // @ApiQuery({ name: 'mobile', required: false, description: 'Mobile number to search for' })
    // @ApiQuery({ name: 'ipAddress', required: false, description: 'IP address to search for' })
    // @ApiQuery({ name: 'clientId', required: false, description: 'Client ID to search for' })
    // @ApiQuery({ name: 'status', required: false, description: 'Status', enum: ['active', 'inactive'] })
    // @ApiOkResponse({ description: 'Search results', type: [IpMobileMapping] })
    // async searchMappings(@Query() searchDto: SearchIpMobileMappingDto): Promise<IpMobileMapping[]> {
    //     try {
    //         return await this.ipManagementService.searchMappings(searchDto);
    //     } catch (error) {
    //         throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    //     }
    // }

    // Create mapping functionality disabled for simplification - use assign endpoint instead
    // @Post('mappings')
    // @ApiOperation({ summary: 'Create a new IP-mobile mapping' })
    // @ApiBody({ type: CreateIpMobileMappingDto })
    // @ApiOkResponse({ description: 'Mapping created successfully', type: IpMobileMapping })
    // @ApiBadRequestResponse({ description: 'Invalid input data' })
    // async createMapping(@Body() createMappingDto: CreateIpMobileMappingDto): Promise<IpMobileMapping> {
    //     try {
    //         return await this.ipManagementService.createIpMobileMapping(createMappingDto);
    //     } catch (error) {
    //         throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    //     }
    // }

    @Get('mappings/mobile/:mobile/ip')
    @ApiOperation({ summary: 'Get IP address assigned to a mobile number' })
    @ApiParam({ name: 'mobile', description: 'Mobile number' })
    @ApiOkResponse({ description: 'IP address found' })
    @ApiNotFoundResponse({ description: 'No IP assigned to this mobile' })
    async getIpForMobile(@Param('mobile') mobile: string): Promise<{ mobile: string; ipAddress: string | null }> {
        try {
            const ipAddress = await this.ipManagementService.getIpForMobile(mobile);
            return { mobile, ipAddress };
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    // ==================== IP ASSIGNMENT OPERATIONS ====================

    @Post('assign')
    @ApiOperation({ summary: 'Assign an IP to a mobile number' })
    @ApiBody({ type: AssignIpToMobileDto })
    @ApiOkResponse({ description: 'IP assigned successfully', type: IpMobileMapping })
    @ApiBadRequestResponse({ description: 'Assignment failed' })
    async assignIpToMobile(@Body() assignDto: AssignIpToMobileDto): Promise<IpMobileMapping> {
        try {
            return await this.ipManagementService.assignIpToMobile(assignDto);
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    @Post('assign/bulk')
    @ApiOperation({ summary: 'Bulk assign IPs to multiple mobile numbers' })
    @ApiBody({ type: BulkAssignIpDto })
    @ApiOkResponse({ description: 'Bulk assignment completed' })
    async bulkAssignIps(@Body() bulkAssignDto: BulkAssignIpDto): Promise<{ assigned: number; failed: number; results: Array<{ mobile: string; ipAddress?: string; error?: string }> }> {
        try {
            return await this.ipManagementService.bulkAssignIpsToMobiles(bulkAssignDto);
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    @Delete('assign/mobile/:mobile')
    @ApiOperation({ summary: 'Release IP from a mobile number' })
    @ApiParam({ name: 'mobile', description: 'Mobile number' })
    @ApiBody({ type: ReleaseIpFromMobileDto })
    @ApiOkResponse({ description: 'IP released successfully' })
    @ApiNotFoundResponse({ description: 'No IP assignment found for mobile' })
    async releaseIpFromMobile(@Param('mobile') mobile: string, @Body() releaseDto: ReleaseIpFromMobileDto): Promise<{ message: string }> {
        try {
            releaseDto.mobile = mobile; // Ensure mobile from param is used
            await this.ipManagementService.releaseIpFromMobile(releaseDto);
            return { message: 'IP released successfully' };
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    // ==================== CLIENT-SPECIFIC OPERATIONS ====================

    // Get client IPs functionality temporarily disabled for simplification
    // @Get('clients/:clientId/ips')
    // @ApiOperation({ summary: 'Get all IPs assigned to a client' })
    // @ApiParam({ name: 'clientId', description: 'Client ID' })
    // @ApiOkResponse({ description: 'Client IPs retrieved successfully', type: [ProxyIp] })
    // async getClientIps(@Param('clientId') clientId: string): Promise<ProxyIp[]> {
    //     try {
    //         return await this.ipManagementService.getClientIps(clientId);
    //     } catch (error) {
    //         throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    //     }
    // }

    @Get('clients/:clientId/mappings')
    @ApiOperation({ summary: 'Get all mobile mappings for a client' })
    @ApiParam({ name: 'clientId', description: 'Client ID' })
    @ApiOkResponse({ description: 'Client mappings retrieved successfully', type: [IpMobileMapping] })
    async getClientMappings(@Param('clientId') clientId: string): Promise<IpMobileMapping[]> {
        try {
            return await this.ipManagementService.getClientMobileMappings(clientId);
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    // Dedicated IP assignment functionality temporarily disabled for simplification
    // @Post('clients/:clientId/assign-dedicated')
    // @ApiOperation({ summary: 'Assign dedicated IPs to a client' })
    // @ApiParam({ name: 'clientId', description: 'Client ID' })
    // @ApiBody({ type: [String], description: 'Array of IP addresses in format ip:port' })
    // @ApiOkResponse({ description: 'Dedicated IPs assignment completed' })
    // async assignDedicatedIpsToClient(
    //     @Param('clientId') clientId: string,
    //     @Body() ipAddresses: string[]
    // ): Promise<{ assigned: number; failed: number; errors: string[] }> {
    //     try {
    //         return await this.ipManagementService.assignDedicatedIpsToClient(clientId, ipAddresses);
    //     } catch (error) {
    //         throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    //     }
    // }

    // ==================== STATISTICS & MAINTENANCE ====================

    @Get('statistics')
    @ApiOperation({ summary: 'Get IP management statistics' })
    @ApiOkResponse({ description: 'Statistics retrieved successfully' })
    async getStatistics(): Promise<{
        total: number;
        available: number;
        assigned: number;
        inactive: number;
        mappings: {
            total: number;
            active: number;
            inactive: number;
        };
    }> {
        try {
            return await this.ipManagementService.getStats();
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('health')
    @ApiOperation({ summary: 'Get IP management health status' })
    @ApiOkResponse({ description: 'Health status retrieved successfully' })
    async getHealthStatus(): Promise<{
        status: 'healthy' | 'warning' | 'critical';
        availableIps: number;
        totalActiveIps: number;
        utilizationRate: number;
        issues: string[];
    }> {
        try {
            return await this.ipManagementService.healthCheck();
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('proxy-ips/:ipAddress/:port')
    @ApiOperation({ summary: 'Get a specific proxy IP' })
    @ApiParam({ name: 'ipAddress', description: 'IP address' })
    @ApiParam({ name: 'port', description: 'Port number' })
    @ApiOkResponse({ description: 'Proxy IP found', type: ProxyIp })
    @ApiNotFoundResponse({ description: 'Proxy IP not found' })
    async getProxyIpById(@Param('ipAddress') ipAddress: string, @Param('port') port: string): Promise<ProxyIp> {
        try {
            return await this.ipManagementService.findProxyIpById(ipAddress, parseInt(port));
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.NOT_FOUND);
        }
    }

    @Get('clients/:clientId/assigned-ips')
    @ApiOperation({ summary: 'Get all IPs assigned to a client' })
    @ApiParam({ name: 'clientId', description: 'Client ID' })
    @ApiOkResponse({ description: 'Client assigned IPs retrieved successfully', type: [ProxyIp] })
    async getClientAssignedIps(@Param('clientId') clientId: string): Promise<ProxyIp[]> {
        try {
            return await this.ipManagementService.getClientAssignedIps(clientId);
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    @Get('available-count')
    @ApiOperation({ summary: 'Get count of available IPs' })
    @ApiOkResponse({ description: 'Available IP count retrieved successfully' })
    async getAvailableIpCount(): Promise<{ count: number }> {
        try {
            const count = await this.ipManagementService.getAvailableIpCount();
            return { count };
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // Cleanup functionality temporarily disabled for simplification
    // @Post('maintenance/cleanup-expired')
    // @ApiOperation({ summary: 'Clean up expired IP mappings' })
    // @ApiOkResponse({ description: 'Cleanup completed' })
    // async cleanupExpiredMappings(): Promise<{ message: string; cleanedCount: number }> {
    //     try {
    //         const cleanedCount = await this.ipManagementService.cleanupExpiredMappings();
    //         return { message: 'Cleanup completed', cleanedCount };
    //     } catch (error) {
    //         throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    //     }
    // }
}
