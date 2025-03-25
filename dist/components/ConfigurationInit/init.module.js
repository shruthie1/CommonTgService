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
exports.initModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mongoose_1 = require("@nestjs/mongoose");
const init_service_1 = require("./init.service");
const configuration_schema_1 = require("./configuration.schema");
const init_controller_1 = require("./init.controller");
const mongoose_2 = require("mongoose");
const fetchWithTimeout_1 = require("../../utils/fetchWithTimeout");
const logbots_1 = require("../../utils/logbots");
let initModule = class initModule {
    constructor(connection) {
        this.connection = connection;
    }
    async onModuleInit() {
        console.log(`Started :: ${process.env.clientId}`);
        (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`Started :: ${process.env.clientId}`)}`);
    }
    async onModuleDestroy() {
        console.log("Init Module Destroying");
        await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`closed :: ${process.env.clientId}`)}`);
        this.closeConnection();
    }
    closeConnection() {
        console.log("Closing mongoose connection");
        this.connection.close(true);
    }
};
exports.initModule = initModule;
exports.initModule = initModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot(),
            mongoose_1.MongooseModule.forRootAsync({
                useFactory: () => ({
                    uri: process.env.mongouri,
                }),
            }),
            mongoose_1.MongooseModule.forFeature([{
                    name: 'configurationModule', collection: 'configuration', schema: configuration_schema_1.ConfigurationSchema
                }])
        ],
        providers: [init_service_1.ConfigurationService],
        controllers: [init_controller_1.ConfigurationController],
        exports: [config_1.ConfigModule, mongoose_1.MongooseModule],
    }),
    __param(0, (0, common_1.Inject)((0, mongoose_1.getConnectionToken)())),
    __metadata("design:paramtypes", [mongoose_2.Connection])
], initModule);
//# sourceMappingURL=init.module.js.map