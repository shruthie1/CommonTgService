"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var WebshareProxyService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebshareProxyService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const ip_management_service_1 = require("../ip-management/ip-management.service");
const utils_1 = require("../../utils");
const redisClient_1 = require("../../utils/redisClient");
const REDIS_LAST_SYNC_KEY = 'webshare:last-sync';
const REDIS_LAST_SYNC_ERROR_KEY = 'webshare:last-sync-error';
const SOURCE_NAME = 'webshare';
let WebshareProxyService = WebshareProxyService_1 = class WebshareProxyService {
    constructor(ipManagementService) {
        this.ipManagementService = ipManagementService;
        this.logger = new utils_1.Logger(WebshareProxyService_1.name);
        this.configured = false;
    }
    onModuleInit() {
        const apiKey = process.env.WEBSHARE_API_KEY;
        const baseUrl = process.env.WEBSHARE_API_URL || 'https://proxy.webshare.io/api/v2';
        const timeout = parseInt(process.env.WEBSHARE_API_TIMEOUT || '10000', 10);
        if (!apiKey) {
            this.logger.warn('WEBSHARE_API_KEY not set — Webshare proxy module is disabled');
            return;
        }
        this.client = axios_1.default.create({
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
    isConfigured() {
        return this.configured;
    }
    async fetchAllProxies() {
        this.ensureConfigured();
        const allProxies = [];
        let page = 1;
        const pageSize = 100;
        this.logger.log('Fetching all proxies from Webshare...');
        while (true) {
            try {
                const response = await this.client.get('/proxy/list/', { params: { page, page_size: pageSize, mode: 'direct' } });
                const { results, next, count } = response.data;
                allProxies.push(...results);
                this.logger.debug(`Fetched page ${page}: ${results.length} proxies (total so far: ${allProxies.length}/${count})`);
                if (!next || allProxies.length >= count) {
                    break;
                }
                page++;
            }
            catch (error) {
                this.logger.error(`Failed to fetch page ${page}: ${error.message}`);
                if (allProxies.length > 0) {
                    this.logger.warn(`Partial fetch: returning ${allProxies.length} proxies fetched before error`);
                    break;
                }
                throw error;
            }
        }
        this.logger.log(`Fetched ${allProxies.length} proxies from Webshare`);
        return allProxies;
    }
    async syncProxies(removeStale = true) {
        this.ensureConfigured();
        const startTime = Date.now();
        try {
            this.logger.log(`Starting Webshare proxy sync (removeStale=${removeStale})`);
            const webshareProxies = await this.fetchAllProxies();
            const dtos = webshareProxies
                .filter(p => p.proxy_address && p.valid)
                .map(p => this.webshareToDto(p));
            this.logger.log(`Converting ${dtos.length} valid proxies (filtered from ${webshareProxies.length} total)`);
            const result = await this.ipManagementService.syncFromExternal(SOURCE_NAME, dtos, removeStale);
            const syncResult = {
                totalFetched: webshareProxies.length,
                created: result.created,
                updated: result.updated,
                removed: result.removed,
                errors: result.errors,
                durationMs: Date.now() - startTime,
            };
            try {
                await redisClient_1.RedisClient.set(REDIS_LAST_SYNC_KEY, new Date().toISOString());
                await redisClient_1.RedisClient.del(REDIS_LAST_SYNC_ERROR_KEY);
            }
            catch { }
            this.logger.log(`Webshare sync complete in ${syncResult.durationMs}ms: ` +
                `fetched=${syncResult.totalFetched}, created=${syncResult.created}, ` +
                `updated=${syncResult.updated}, removed=${syncResult.removed}, errors=${syncResult.errors.length}`);
            return syncResult;
        }
        catch (error) {
            const durationMs = Date.now() - startTime;
            this.logger.error(`Webshare sync failed after ${durationMs}ms: ${error.message}`);
            try {
                await redisClient_1.RedisClient.set(REDIS_LAST_SYNC_ERROR_KEY, error.message);
            }
            catch { }
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
    async replaceProxy(ipAddress, port, preferredCountry) {
        this.ensureConfigured();
        try {
            const proxy = await this.ipManagementService.findProxyIpById(ipAddress, port);
            if (proxy.source !== SOURCE_NAME) {
                return {
                    success: false,
                    message: `Proxy ${ipAddress}:${port} is not from Webshare (source: ${proxy.source || 'manual'})`,
                };
            }
            await this.ipManagementService.markInactive(ipAddress, port);
            const body = {
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
        }
        catch (error) {
            this.logger.error(`Failed to replace proxy ${ipAddress}:${port}: ${error.message}`);
            return {
                success: false,
                message: `Replacement failed: ${error.message}`,
            };
        }
    }
    async refreshAndSync() {
        this.ensureConfigured();
        try {
            this.logger.log('Requesting Webshare proxy list refresh...');
            await this.client.post('/proxy/refresh/');
            this.logger.log('Webshare refresh triggered, waiting 5s for propagation...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            return await this.syncProxies(true);
        }
        catch (error) {
            this.logger.error(`Refresh and sync failed: ${error.message}`);
            throw error;
        }
    }
    async getStatus() {
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
            const response = await this.client.get('/proxy/list/', { params: { page: 1, page_size: 1, mode: 'direct' } });
            apiKeyValid = true;
            totalProxiesInWebshare = response.data.count;
        }
        catch (error) {
            this.logger.warn(`Webshare API check failed: ${error.message}`);
        }
        const totalProxiesInDb = await this.ipManagementService.countBySource(SOURCE_NAME);
        let lastSyncAt = null;
        let lastSyncError = null;
        try {
            lastSyncAt = await redisClient_1.RedisClient.get(REDIS_LAST_SYNC_KEY);
            lastSyncError = await redisClient_1.RedisClient.get(REDIS_LAST_SYNC_ERROR_KEY);
        }
        catch { }
        return {
            configured: true,
            apiKeyValid,
            totalProxiesInWebshare,
            totalProxiesInDb,
            lastSyncAt,
            lastSyncError,
        };
    }
    async getProxyConfig() {
        this.ensureConfigured();
        try {
            const response = await this.client.get('/proxy/config/');
            return response.data;
        }
        catch (error) {
            this.logger.error(`Failed to fetch proxy config: ${error.message}`);
            throw error;
        }
    }
    ensureConfigured() {
        if (!this.configured) {
            throw new common_1.BadRequestException('Webshare proxy module is not configured. Set WEBSHARE_API_KEY environment variable.');
        }
    }
    webshareToDto(proxy) {
        return {
            ipAddress: proxy.proxy_address,
            port: proxy.port,
            protocol: 'socks5',
            username: proxy.username,
            password: proxy.password,
            status: proxy.valid ? 'active' : 'inactive',
            source: SOURCE_NAME,
            webshareId: proxy.id,
            countryCode: proxy.country_code,
            cityName: proxy.city_name,
        };
    }
};
exports.WebshareProxyService = WebshareProxyService;
exports.WebshareProxyService = WebshareProxyService = WebshareProxyService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [ip_management_service_1.IpManagementService])
], WebshareProxyService);
//# sourceMappingURL=webshare-proxy.service.js.map