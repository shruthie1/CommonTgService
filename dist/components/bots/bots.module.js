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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotsModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const bots_controller_1 = require("./bots.controller");
const bots_service_1 = require("./bots.service");
const bot_schema_1 = require("./schemas/bot.schema");
const bot_service_instance_1 = require("../../utils/bot.service.instance");
let BotsModule = class BotsModule {
    constructor(botsService) {
        this.botsService = botsService;
    }
    onModuleInit() {
        (0, bot_service_instance_1.setBotsServiceInstance)(this.botsService);
    }
};
exports.BotsModule = BotsModule;
exports.BotsModule = BotsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([{ name: bot_schema_1.Bot.name, schema: bot_schema_1.BotSchema }])
        ],
        controllers: [bots_controller_1.BotsController],
        providers: [bots_service_1.BotsService],
        exports: [bots_service_1.BotsService]
    }),
    __metadata("design:paramtypes", [bots_service_1.BotsService])
], BotsModule);
//# sourceMappingURL=bots.module.js.map