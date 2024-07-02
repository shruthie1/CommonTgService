"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const stat_service_1 = require("./stat.service");
const stat_controller_1 = require("./stat.controller");
const stat_schema_1 = require("./stat.schema");
let StatModule = class StatModule {
};
exports.StatModule = StatModule;
exports.StatModule = StatModule = __decorate([
    (0, common_1.Module)({
        imports: [mongoose_1.MongooseModule.forFeature([{ name: "StatsModule", collection: "stats", schema: stat_schema_1.StatSchema }])],
        controllers: [stat_controller_1.StatController],
        providers: [stat_service_1.StatService],
    })
], StatModule);
//# sourceMappingURL=stat.module.js.map