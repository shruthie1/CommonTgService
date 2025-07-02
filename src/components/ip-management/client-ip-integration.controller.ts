import { Controller, Get, Post, Body, Param, Query, HttpException, HttpStatus } from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiParam,
    ApiBody,
    ApiQuery
} from '@nestjs/swagger';
import { ClientIpIntegrationService } from './client-ip-integration.service';

@ApiTags('Client IP Integration')
@Controller('client-ip-integration')
export class ClientIpIntegrationController {
    constructor(private readonly clientIpIntegrationService: ClientIpIntegrationService) {}

    @Post('clients/:clientId/auto-assign-ips')
    @ApiOperation({ summary: 'Auto-assign IPs to all client mobile numbers' })
    @ApiParam({ name: 'clientId', description: 'Client ID' })
    @ApiResponse({ status: 200, description: 'IPs assigned successfully' })
    async autoAssignIpsToClient(@Param('clientId') clientId: string): Promise<any> {
        try {
            return await this.clientIpIntegrationService.autoAssignIpsToClient(clientId);
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    @Get('mobile/:mobile/ip')
    @ApiOperation({ summary: 'Get IP assigned to a mobile number with smart assignment' })
    @ApiParam({ name: 'mobile', description: 'Mobile number' })
    @ApiQuery({ name: 'clientId', description: 'Optional client ID for context', required: false })
    @ApiResponse({ status: 200, description: 'IP address retrieved or assigned' })
    async getIpForMobile(
        @Param('mobile') mobile: string,
        @Query('clientId') clientId?: string
    ): Promise<{ mobile: string; ipAddress: string | null; source: string }> {
        try {
            const ipAddress = await this.clientIpIntegrationService.getIpForMobile(mobile, clientId);
            const source = ipAddress ? 'existing_mapping' : 'not_found';
            return { mobile, ipAddress, source };
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    @Get('clients/:clientId/ip-summary')
    @ApiOperation({ summary: 'Get comprehensive IP information for a client' })
    @ApiParam({ name: 'clientId', description: 'Client ID' })
    @ApiResponse({ status: 200, description: 'Client IP summary retrieved successfully' })
    async getClientIpSummary(@Param('clientId') clientId: string): Promise<any> {
        try {
            return await this.clientIpIntegrationService.getClientIpSummary(clientId);
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    @Post('clients/:clientId/auto-assign-all-ips')
    @ApiOperation({ summary: 'Auto-assign IPs to all client mobile numbers (alternative endpoint)' })
    @ApiParam({ name: 'clientId', description: 'Client ID' })
    @ApiResponse({ status: 200, description: 'IPs auto-assigned using ClientService' })
    async autoAssignAllIpsViaClientService(@Param('clientId') clientId: string): Promise<any> {
        try {
            // Use ClientService's autoAssignIpsToClient method as an alternative
            return await this.clientIpIntegrationService.autoAssignIpsToClient(clientId);
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    @Post('clients/:clientId/assign-main-mobile-ip')
    @ApiOperation({ summary: 'Assign IP to client main mobile number' })
    @ApiParam({ name: 'clientId', description: 'Client ID' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                mobile: { type: 'string', description: 'Mobile number' },
                preferredCountry: { type: 'string', description: 'Preferred country code' }
            },
            required: ['mobile']
        }
    })
    @ApiResponse({ status: 200, description: 'IP assigned to main mobile' })
    async assignIpToMainMobile(
        @Param('clientId') clientId: string,
        @Body() body: { mobile: string; preferredCountry?: string }
    ): Promise<any> {
        try {
            return await this.clientIpIntegrationService.assignIpToMainMobile(
                clientId,
                body.mobile,
                body.preferredCountry
            );
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    @Post('clients/:clientId/assign-promote-mobiles-ips')
    @ApiOperation({ summary: 'Assign IPs to client promote mobile numbers' })
    @ApiParam({ name: 'clientId', description: 'Client ID' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                promoteMobiles: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of promote mobile numbers'
                },
                preferredCountry: { type: 'string', description: 'Preferred country code' }
            },
            required: ['promoteMobiles']
        }
    })
    @ApiResponse({ status: 200, description: 'IPs assigned to promote mobiles' })
    async assignIpsToPromoteMobiles(
        @Param('clientId') clientId: string,
        @Body() body: { promoteMobiles: string[]; preferredCountry?: string }
    ): Promise<any> {
        try {
            return await this.clientIpIntegrationService.assignIpsToPromoteMobiles(
                clientId,
                body.promoteMobiles,
                body.preferredCountry
            );
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }
}
