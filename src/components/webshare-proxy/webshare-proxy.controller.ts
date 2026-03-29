import { Controller, Get, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiOkResponse,
    ApiBadRequestResponse,
    ApiBody,
} from '@nestjs/swagger';
import { WebshareProxyService } from './webshare-proxy.service';
import { SyncProxiesDto, SyncResultDto } from './dto/sync-proxies.dto';
import { ReplaceProxyDto, ReplaceResultDto } from './dto/replace-proxy.dto';
import { WebshareStatusDto } from './dto/webshare-config.dto';

@ApiTags('Webshare Proxy')
@Controller('webshare-proxy')
export class WebshareProxyController {
    constructor(private readonly webshareProxyService: WebshareProxyService) {}

    @Get('status')
    @ApiOperation({
        summary: 'Get Webshare integration status',
        description: 'Returns API key validity, proxy counts in Webshare vs DB, last sync timestamp and errors'
    })
    @ApiOkResponse({ description: 'Status retrieved', type: WebshareStatusDto })
    async getStatus(): Promise<WebshareStatusDto> {
        try {
            return await this.webshareProxyService.getStatus();
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Post('sync')
    @ApiOperation({
        summary: 'Sync proxies from Webshare',
        description: 'Fetches all proxies from Webshare API and upserts them into the local IP pool. Optionally removes stale proxies no longer in Webshare.'
    })
    @ApiBody({ type: SyncProxiesDto, required: false })
    @ApiOkResponse({ description: 'Sync completed', type: SyncResultDto })
    @ApiBadRequestResponse({ description: 'Webshare not configured or sync failed' })
    async syncProxies(@Body() dto?: SyncProxiesDto): Promise<SyncResultDto> {
        try {
            const removeStale = dto?.removeStale !== false;
            return await this.webshareProxyService.syncProxies(removeStale);
        } catch (error) {
            throw new HttpException(
                `Sync failed: ${error.message}`,
                HttpStatus.BAD_REQUEST
            );
        }
    }

    @Post('refresh')
    @ApiOperation({
        summary: 'Refresh proxy list on Webshare and sync',
        description: 'Triggers Webshare to refresh their proxy list, waits briefly, then syncs the updated list to local DB'
    })
    @ApiOkResponse({ description: 'Refresh and sync completed', type: SyncResultDto })
    async refreshAndSync(): Promise<SyncResultDto> {
        try {
            return await this.webshareProxyService.refreshAndSync();
        } catch (error) {
            throw new HttpException(
                `Refresh failed: ${error.message}`,
                HttpStatus.BAD_REQUEST
            );
        }
    }

    @Post('replace')
    @ApiOperation({
        summary: 'Replace a dead Webshare proxy',
        description: 'Marks the proxy as inactive locally and requests Webshare to provide a replacement. Only works for proxies sourced from Webshare.'
    })
    @ApiBody({ type: ReplaceProxyDto })
    @ApiOkResponse({ description: 'Replacement result', type: ReplaceResultDto })
    async replaceProxy(@Body() dto: ReplaceProxyDto): Promise<ReplaceResultDto> {
        try {
            return await this.webshareProxyService.replaceProxy(
                dto.ipAddress,
                dto.port,
                dto.preferredCountry
            );
        } catch (error) {
            throw new HttpException(
                `Replace failed: ${error.message}`,
                HttpStatus.BAD_REQUEST
            );
        }
    }

    @Get('config')
    @ApiOperation({
        summary: 'Get current Webshare proxy configuration',
        description: 'Fetches the proxy configuration directly from Webshare API (username, timeout settings, authorized IPs, etc.)'
    })
    @ApiOkResponse({ description: 'Webshare config retrieved' })
    async getProxyConfig() {
        try {
            return await this.webshareProxyService.getProxyConfig();
        } catch (error) {
            throw new HttpException(
                `Failed to get config: ${error.message}`,
                HttpStatus.BAD_REQUEST
            );
        }
    }
}
