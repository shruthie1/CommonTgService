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
import { GetNextIpDto } from './dto/get-next-ip.dto';
import { ProxyIp } from './schemas/proxy-ip.schema';

@ApiTags('IP Management')
@Controller('ip-management')
export class IpManagementController {
    constructor(private readonly ipManagementService: IpManagementService) { }

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

    @Get('proxy-ips/next')
    @ApiOperation({
        summary: 'Get next available proxy IP (round-robin)',
        description: 'Serves the next active proxy IP using global round-robin. Optionally filter by clientId (falls back to full pool if no client IPs found), countryCode, or protocol.'
    })
    @ApiQuery({ name: 'clientId', required: false, description: 'Client ID to prefer IPs assigned to this client' })
    @ApiQuery({ name: 'countryCode', required: false, description: 'ISO country code filter' })
    @ApiQuery({ name: 'protocol', required: false, description: 'Protocol filter', enum: ['http', 'https', 'socks5'] })
    @ApiOkResponse({ description: 'Next proxy IP served', type: ProxyIp })
    @ApiNotFoundResponse({ description: 'No active proxy IPs available' })
    async getNextIp(@Query() filters: GetNextIpDto): Promise<ProxyIp> {
        try {
            return await this.ipManagementService.getNextIp(filters);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new HttpException(error.message, HttpStatus.NOT_FOUND);
        }
    }

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

    @Get('health')
    @ApiOperation({ summary: 'Get IP management health status' })
    @ApiOkResponse({ description: 'Health status retrieved successfully' })
    async getHealthStatus() {
        try {
            return await this.ipManagementService.healthCheck();
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('stats')
    @ApiOperation({ summary: 'Get IP pool statistics including source breakdown' })
    @ApiOkResponse({ description: 'Stats retrieved successfully' })
    async getStats() {
        try {
            return await this.ipManagementService.getStats();
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
}
