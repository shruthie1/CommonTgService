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
exports.DailyAnalyticsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const daily_analytics_service_1 = require("./daily-analytics.service");
const METRICS = ['promote', 'reaction', 'user'];
function parseDays(days) {
    const n = Number(days);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 60) : 14;
}
function parseMetric(metric) {
    return METRICS.includes(metric) ? metric : 'promote';
}
let DailyAnalyticsController = class DailyAnalyticsController {
    constructor(service) {
        this.service = service;
    }
    async overview(days) {
        return this.service.overview(parseDays(days));
    }
    async daily(metric, days) {
        return this.service.dailyTotals(parseMetric(metric), parseDays(days));
    }
    async byClient(metric, days, namespace) {
        return this.service.byClient(parseMetric(metric), parseDays(days), namespace);
    }
    async byMobile(metric, days, clientId, namespace) {
        return this.service.byMobile(parseMetric(metric), parseDays(days), clientId, namespace);
    }
    async rows(metric, days, clientId, namespace, mobile) {
        return this.service.rows(parseMetric(metric), parseDays(days), clientId, namespace, mobile);
    }
};
exports.DailyAnalyticsController = DailyAnalyticsController;
__decorate([
    (0, common_1.Get)('overview'),
    (0, swagger_1.ApiQuery)({ name: 'days', required: false }),
    __param(0, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DailyAnalyticsController.prototype, "overview", null);
__decorate([
    (0, common_1.Get)(':metric/daily'),
    (0, swagger_1.ApiParam)({ name: 'metric', enum: METRICS }),
    (0, swagger_1.ApiQuery)({ name: 'days', required: false }),
    __param(0, (0, common_1.Param)('metric')),
    __param(1, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], DailyAnalyticsController.prototype, "daily", null);
__decorate([
    (0, common_1.Get)(':metric/by-client'),
    (0, swagger_1.ApiParam)({ name: 'metric', enum: METRICS }),
    (0, swagger_1.ApiQuery)({ name: 'days', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'namespace', required: false, description: "'promote-clients' | 'tg-aut'" }),
    __param(0, (0, common_1.Param)('metric')),
    __param(1, (0, common_1.Query)('days')),
    __param(2, (0, common_1.Query)('namespace')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], DailyAnalyticsController.prototype, "byClient", null);
__decorate([
    (0, common_1.Get)(':metric/by-mobile'),
    (0, swagger_1.ApiParam)({ name: 'metric', enum: METRICS }),
    (0, swagger_1.ApiQuery)({ name: 'days', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'clientId', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'namespace', required: false, description: "'promote-clients' | 'tg-aut'" }),
    __param(0, (0, common_1.Param)('metric')),
    __param(1, (0, common_1.Query)('days')),
    __param(2, (0, common_1.Query)('clientId')),
    __param(3, (0, common_1.Query)('namespace')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], DailyAnalyticsController.prototype, "byMobile", null);
__decorate([
    (0, common_1.Get)(':metric/rows'),
    (0, swagger_1.ApiParam)({ name: 'metric', enum: METRICS }),
    (0, swagger_1.ApiQuery)({ name: 'days', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'clientId', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'namespace', required: false, description: "'promote-clients' | 'tg-aut'" }),
    (0, swagger_1.ApiQuery)({ name: 'mobile', required: false }),
    __param(0, (0, common_1.Param)('metric')),
    __param(1, (0, common_1.Query)('days')),
    __param(2, (0, common_1.Query)('clientId')),
    __param(3, (0, common_1.Query)('namespace')),
    __param(4, (0, common_1.Query)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], DailyAnalyticsController.prototype, "rows", null);
exports.DailyAnalyticsController = DailyAnalyticsController = __decorate([
    (0, swagger_1.ApiTags)('daily-analytics'),
    (0, common_1.Controller)('daily-analytics'),
    __metadata("design:paramtypes", [daily_analytics_service_1.DailyAnalyticsService])
], DailyAnalyticsController);
//# sourceMappingURL=daily-analytics.controller.js.map