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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebshareProxyController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const webshare_proxy_service_1 = require("./webshare-proxy.service");
const sync_proxies_dto_1 = require("./dto/sync-proxies.dto");
const replace_proxy_dto_1 = require("./dto/replace-proxy.dto");
const webshare_config_dto_1 = require("./dto/webshare-config.dto");
let WebshareProxyController = class WebshareProxyController {
    constructor(webshareProxyService) {
        this.webshareProxyService = webshareProxyService;
    }
    async getStatus() {
        try {
            return await this.webshareProxyService.getStatus();
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async syncProxies(dto) {
        try {
            const removeStale = dto?.removeStale !== false;
            return await this.webshareProxyService.syncProxies(removeStale);
        }
        catch (error) {
            throw new common_1.HttpException(`Sync failed: ${error.message}`, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async refreshAndSync() {
        try {
            return await this.webshareProxyService.refreshAndSync();
        }
        catch (error) {
            throw new common_1.HttpException(`Refresh failed: ${error.message}`, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async replaceProxy(dto) {
        try {
            return await this.webshareProxyService.replaceProxy(dto.ipAddress, dto.port, dto.preferredCountry);
        }
        catch (error) {
            throw new common_1.HttpException(`Replace failed: ${error.message}`, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async getProxyConfig() {
        try {
            return await this.webshareProxyService.getProxyConfig();
        }
        catch (error) {
            throw new common_1.HttpException(`Failed to get config: ${error.message}`, common_1.HttpStatus.BAD_REQUEST);
        }
    }
};
exports.WebshareProxyController = WebshareProxyController;
__decorate([
    (0, common_1.Get)('status'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get Webshare integration status',
        description: 'Returns API key validity, proxy counts in Webshare vs DB, last sync timestamp and errors'
    }),
    (0, swagger_1.ApiOkResponse)({ description: 'Status retrieved', type: webshare_config_dto_1.WebshareStatusDto }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], WebshareProxyController.prototype, "getStatus", null);
__decorate([
    (0, common_1.Post)('sync'),
    (0, swagger_1.ApiOperation)({
        summary: 'Sync proxies from Webshare',
        description: 'Fetches all proxies from Webshare API and upserts them into the local IP pool. Optionally removes stale proxies no longer in Webshare.'
    }),
    (0, swagger_1.ApiBody)({ type: sync_proxies_dto_1.SyncProxiesDto, required: false }),
    (0, swagger_1.ApiOkResponse)({ description: 'Sync completed', type: sync_proxies_dto_1.SyncResultDto }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'Webshare not configured or sync failed' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [sync_proxies_dto_1.SyncProxiesDto]),
    __metadata("design:returntype", Promise)
], WebshareProxyController.prototype, "syncProxies", null);
__decorate([
    (0, common_1.Post)('refresh'),
    (0, swagger_1.ApiOperation)({
        summary: 'Refresh proxy list on Webshare and sync',
        description: 'Triggers Webshare to refresh their proxy list, waits briefly, then syncs the updated list to local DB'
    }),
    (0, swagger_1.ApiOkResponse)({ description: 'Refresh and sync completed', type: sync_proxies_dto_1.SyncResultDto }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], WebshareProxyController.prototype, "refreshAndSync", null);
__decorate([
    (0, common_1.Post)('replace'),
    (0, swagger_1.ApiOperation)({
        summary: 'Replace a dead Webshare proxy',
        description: 'Marks the proxy as inactive locally and requests Webshare to provide a replacement. Only works for proxies sourced from Webshare.'
    }),
    (0, swagger_1.ApiBody)({ type: replace_proxy_dto_1.ReplaceProxyDto }),
    (0, swagger_1.ApiOkResponse)({ description: 'Replacement result', type: replace_proxy_dto_1.ReplaceResultDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [replace_proxy_dto_1.ReplaceProxyDto]),
    __metadata("design:returntype", Promise)
], WebshareProxyController.prototype, "replaceProxy", null);
__decorate([
    (0, common_1.Get)('config'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get current Webshare proxy configuration',
        description: 'Fetches the proxy configuration directly from Webshare API (username, timeout settings, authorized IPs, etc.)'
    }),
    (0, swagger_1.ApiOkResponse)({ description: 'Webshare config retrieved' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], WebshareProxyController.prototype, "getProxyConfig", null);
exports.WebshareProxyController = WebshareProxyController = __decorate([
    (0, swagger_1.ApiTags)('Webshare Proxy'),
    (0, common_1.Controller)('webshare-proxy'),
    __metadata("design:paramtypes", [webshare_proxy_service_1.WebshareProxyService])
], WebshareProxyController);
//# sourceMappingURL=webshare-proxy.controller.js.map