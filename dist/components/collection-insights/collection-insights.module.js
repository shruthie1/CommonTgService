"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollectionInsightsModule = void 0;
const common_1 = require("@nestjs/common");
const init_module_1 = require("../ConfigurationInit/init.module");
const collection_insights_controller_1 = require("./collection-insights.controller");
const collection_insights_service_1 = require("./collection-insights.service");
let CollectionInsightsModule = class CollectionInsightsModule {
};
exports.CollectionInsightsModule = CollectionInsightsModule;
exports.CollectionInsightsModule = CollectionInsightsModule = __decorate([
    (0, common_1.Module)({
        imports: [init_module_1.InitModule],
        controllers: [collection_insights_controller_1.CollectionInsightsController],
        providers: [collection_insights_service_1.CollectionInsightsService],
        exports: [collection_insights_service_1.CollectionInsightsService],
    })
], CollectionInsightsModule);
//# sourceMappingURL=collection-insights.module.js.map