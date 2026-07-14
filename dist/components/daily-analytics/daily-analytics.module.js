"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DailyAnalyticsModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const daily_analytics_service_1 = require("./daily-analytics.service");
const daily_analytics_controller_1 = require("./daily-analytics.controller");
const daily_analytics_schema_1 = require("./schemas/daily-analytics.schema");
let DailyAnalyticsModule = class DailyAnalyticsModule {
};
exports.DailyAnalyticsModule = DailyAnalyticsModule;
exports.DailyAnalyticsModule = DailyAnalyticsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([
                { name: daily_analytics_schema_1.PromoteStatDaily.name, schema: daily_analytics_schema_1.PromoteStatDailySchema },
                { name: daily_analytics_schema_1.ReactionStatDaily.name, schema: daily_analytics_schema_1.ReactionStatDailySchema },
                { name: daily_analytics_schema_1.UserStatDaily.name, schema: daily_analytics_schema_1.UserStatDailySchema },
            ]),
        ],
        controllers: [daily_analytics_controller_1.DailyAnalyticsController],
        providers: [daily_analytics_service_1.DailyAnalyticsService],
        exports: [daily_analytics_service_1.DailyAnalyticsService],
    })
], DailyAnalyticsModule);
//# sourceMappingURL=daily-analytics.module.js.map