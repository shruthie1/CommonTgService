import { Injectable, OnModuleInit, BadRequestException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { IpManagementService } from '../ip-management/ip-management.service';
import { CreateProxyIpDto } from '../ip-management/dto/create-proxy-ip.dto';
import {
    WebshareProxy,
    WebsharePaginatedResponse,
    WebshareSyncResult,
} from './interfaces/webshare-types';
import { Logger } from '../../utils';
import { RedisClient } from '../../utils/redisClient';

const REDIS_LAST_SYNC_KEY = 'webshare:last-sync';
const REDIS_LAST_SYNC_ERROR_KEY = 'webshare:last-sync-error';
const SOURCE_NAME = 'webshare';

@Injectable()
export class WebshareProxyService implements OnModuleInit {
    private readonly logger = new Logger(WebshareProxyService.name);
    private client: AxiosInstance;
    private configured = false;

    constructor(
        private readonly ipManagementService: IpManagementService,
    ) {}

    onModuleInit() {
        const apiKey = process.env.WEBSHARE_API_KEY;
        const baseUrl = process.env.WEBSHARE_API_URL || 'https://proxy.webshare.io/api/v2';
        const timeout = parseInt(process.env.WEBSHARE_API_TIMEOUT || '10000', 10);

        if (!apiKey) {
            this.logger.warn('WEBSHARE_API_KEY not set — Webshare proxy module is disabled');
            return;
        }

        this.client = axios.create({
            baseURL: baseUrl,
            timeout,
            headers: {
                'Authorization': `Token ${apiKey}`,
                'Content-Type': 'application/json',
            },
        });

        this.configured = true;
        this.logger.log(`Webshare proxy module initialized (baseUrl=${baseUrl})`);
    }

    isConfigured(): boolean {
        return this.configured;
    }

    // ==================== FETCH PROXIES ====================

    async fetchAllProxies(): Promise<WebshareProxy[]> {
        const { proxies } = await this.fetchAllProxiesWithStatus();
        return proxies;
    }

    /**
     * Fetches all proxy pages. Returns `complete: false` if pagination was cut short by an
     * error after at least one page succeeded — callers must NOT prune the pool against an
     * incomplete result, or valid proxies on the un-fetched pages get wrongly deleted.
     */
    async fetchAllProxiesWithStatus(): Promise<{ proxies: WebshareProxy[]; complete: boolean }> {
        this.ensureConfigured();
        const allProxies: WebshareProxy[] = [];
        let page = 1;
        const pageSize = 100;
        let complete = true;

        this.logger.log('Fetching all proxies from Webshare...');

        while (true) {
            try {
                const response = await this.client.get<WebsharePaginatedResponse<WebshareProxy>>(
                    '/proxy/list/',
                    { params: { page, page_size: pageSize, mode: 'direct' } }
                );

                const { results, next, count } = response.data;
                allProxies.push(...results);

                this.logger.debug(`Fetched page ${page}: ${results.length} proxies (total so far: ${allProxies.length}/${count})`);

                // Terminate on: no next link, reached the reported count, OR an empty page
                // (a buggy/flaky API returning `next` with no results would otherwise loop forever).
                if (!next || allProxies.length >= count || results.length === 0) {
                    break;
                }

                page++;
            } catch (error) {
                this.logger.error(`Failed to fetch page ${page}: ${error.message}`);
                if (allProxies.length > 0) {
                    this.logger.warn(`Partial fetch: returning ${allProxies.length} proxies fetched before error (INCOMPLETE)`);
                    complete = false;
                    break;
                }
                throw error;
            }
        }

        this.logger.log(`Fetched ${allProxies.length} proxies from Webshare (complete=${complete})`);
        return { proxies: allProxies, complete };
    }

    // ==================== SYNC ====================

    async syncProxies(removeStale: boolean = true): Promise<WebshareSyncResult> {
        this.ensureConfigured();
        const startTime = Date.now();

        try {
            this.logger.log(`Starting Webshare proxy sync (removeStale=${removeStale})`);

            const { proxies: webshareProxies, complete } = await this.fetchAllProxiesWithStatus();

            const dtos: CreateProxyIpDto[] = webshareProxies
                .filter(p => p.proxy_address && p.valid)
                .map(p => this.webshareToDto(p));

            // Only prune stale rows when the fetch was COMPLETE. Pruning against a partial fetch
            // would delete valid proxies that live on the pages we failed to retrieve.
            const effectiveRemoveStale = removeStale && complete;
            if (removeStale && !complete) {
                this.logger.warn('Webshare fetch was incomplete; skipping stale-removal to avoid deleting valid proxies');
            }

            this.logger.log(`Converting ${dtos.length} valid proxies (filtered from ${webshareProxies.length} total)`);

            const result = await this.ipManagementService.syncFromExternal(SOURCE_NAME, dtos, effectiveRemoveStale);

            const syncResult: WebshareSyncResult = {
                totalFetched: webshareProxies.length,
                created: result.created,
                updated: result.updated,
                removed: result.removed,
                errors: result.errors,
                durationMs: Date.now() - startTime,
            };

            try {
                await RedisClient.set(REDIS_LAST_SYNC_KEY, new Date().toISOString());
                await RedisClient.del(REDIS_LAST_SYNC_ERROR_KEY);
            } catch { }

            this.logger.log(
                `Webshare sync complete in ${syncResult.durationMs}ms: ` +
                `fetched=${syncResult.totalFetched}, created=${syncResult.created}, ` +
                `updated=${syncResult.updated}, removed=${syncResult.removed}, errors=${syncResult.errors.length}`
            );

            return syncResult;
        } catch (error) {
            const durationMs = Date.now() - startTime;
            this.logger.error(`Webshare sync failed after ${durationMs}ms: ${error.message}`);

            try {
                await RedisClient.set(REDIS_LAST_SYNC_ERROR_KEY, error.message);
            } catch { }

            return {
                totalFetched: 0,
                created: 0,
                updated: 0,
                removed: 0,
                errors: [error.message],
                durationMs,
            };
        }
    }

    // ==================== REPLACE ====================

    async replaceProxy(
        ipAddress: string,
        port: number,
        preferredCountry?: string
    ): Promise<{ success: boolean; message: string; replacementId?: string }> {
        this.ensureConfigured();

        let markedInactive = false;
        try {
            const proxy = await this.ipManagementService.findProxyIpById(ipAddress, port);

            if (proxy.source !== SOURCE_NAME) {
                return {
                    success: false,
                    message: `Proxy ${ipAddress}:${port} is not from Webshare (source: ${proxy.source || 'manual'})`,
                };
            }

            await this.ipManagementService.markInactive(ipAddress, port);
            markedInactive = true;

            const body: Record<string, string> = {
                proxy_address: ipAddress,
            };
            if (preferredCountry) {
                body.country_code = preferredCountry;
            }

            const response = await this.client.post('/proxy/replacement/', body);

            this.logger.log(`Replacement requested for ${ipAddress}:${port} — Webshare response: ${response.status}`);

            return {
                success: true,
                message: `Replacement initiated for ${ipAddress}:${port}`,
                replacementId: response.data?.id,
            };
        } catch (error) {
            this.logger.error(`Failed to replace proxy ${ipAddress}:${port}: ${error.message}`);
            // Roll back the markInactive so a failed Webshare request doesn't strand a still-valid
            // proxy as inactive forever (it would silently leave rotation, shrinking the pool).
            if (markedInactive) {
                try {
                    await this.ipManagementService.markActive(ipAddress, port);
                } catch (rollbackErr) {
                    this.logger.error(`Failed to roll back proxy ${ipAddress}:${port} to active: ${rollbackErr.message}`);
                }
            }
            return {
                success: false,
                message: `Replacement failed: ${error.message}`,
            };
        }
    }

    // ==================== REFRESH ====================

    async refreshAndSync(): Promise<WebshareSyncResult> {
        this.ensureConfigured();

        try {
            this.logger.log('Requesting Webshare proxy list refresh...');
            await this.client.post('/proxy/refresh/');
            this.logger.log('Webshare refresh triggered, waiting 5s for propagation...');

            await new Promise(resolve => setTimeout(resolve, 5000));

            return await this.syncProxies(true);
        } catch (error) {
            this.logger.error(`Refresh and sync failed: ${error.message}`);
            throw error;
        }
    }

    // ==================== STATUS ====================

    async getStatus(): Promise<{
        configured: boolean;
        apiKeyValid: boolean;
        totalProxiesInWebshare: number;
        totalProxiesInDb: number;
        lastSyncAt: string | null;
        lastSyncError: string | null;
    }> {
        if (!this.configured) {
            return {
                configured: false,
                apiKeyValid: false,
                totalProxiesInWebshare: 0,
                totalProxiesInDb: 0,
                lastSyncAt: null,
                lastSyncError: 'WEBSHARE_API_KEY not configured',
            };
        }

        let apiKeyValid = false;
        let totalProxiesInWebshare = 0;

        try {
            const response = await this.client.get<WebsharePaginatedResponse<WebshareProxy>>(
                '/proxy/list/',
                { params: { page: 1, page_size: 1, mode: 'direct' } }
            );
            apiKeyValid = true;
            totalProxiesInWebshare = response.data.count;
        } catch (error) {
            this.logger.warn(`Webshare API check failed: ${error.message}`);
        }

        const totalProxiesInDb = await this.ipManagementService.countBySource(SOURCE_NAME);
        let lastSyncAt: string | null = null;
        let lastSyncError: string | null = null;

        try {
            lastSyncAt = await RedisClient.get(REDIS_LAST_SYNC_KEY);
            lastSyncError = await RedisClient.get(REDIS_LAST_SYNC_ERROR_KEY);
        } catch { }

        return {
            configured: true,
            apiKeyValid,
            totalProxiesInWebshare,
            totalProxiesInDb,
            lastSyncAt,
            lastSyncError,
        };
    }

    // ==================== PROXY CONFIG ====================

    async getProxyConfig(): Promise<any> {
        this.ensureConfigured();

        try {
            const response = await this.client.get('/proxy/config/');
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to fetch proxy config: ${error.message}`);
            throw error;
        }
    }

    // ==================== HELPERS ====================

    private ensureConfigured(): void {
        if (!this.configured) {
            throw new BadRequestException('Webshare proxy module is not configured. Set WEBSHARE_API_KEY environment variable.');
        }
    }

    private webshareToDto(proxy: WebshareProxy): CreateProxyIpDto {
        return {
            ipAddress: proxy.proxy_address,
            port: proxy.port,
            protocol: 'socks5',
            username: proxy.username,
            password: proxy.password,
            /* istanbul ignore next -- syncProxies filters to valid proxies before mapping, so 'inactive' is unreachable here; kept for direct-call safety */
            status: proxy.valid ? 'active' : 'inactive',
            source: SOURCE_NAME,
            webshareId: proxy.id,
            countryCode: proxy.country_code,
            cityName: proxy.city_name,
        };
    }
}
