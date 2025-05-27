"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimestampModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const timestamp_service_1 = require("./timestamp.service");
const timestamp_controller_1 = require("./timestamp.controller");
const timestamps_schema_1 = require("./timestamps.schema");
const client_module_1 = require("../clients/client.module");
const ConfigurationInit_1 = require("../ConfigurationInit");
let TimestampModule = class TimestampModule {
};
exports.TimestampModule = TimestampModule;
exports.TimestampModule = TimestampModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            ConfigurationInit_1.InitModule,
            mongoose_1.MongooseModule.forFeature([{
                    name: 'timestampModule',
                    collection: 'timestamps',
                    schema: timestamps_schema_1.TimestampSchema
                }]),
            (0, common_1.forwardRef)(() => client_module_1.ClientModule),
        ],
        providers: [timestamp_service_1.TimestampService],
        controllers: [timestamp_controller_1.TimestampController],
        exports: [timestamp_service_1.TimestampService],
    })
], TimestampModule);
//# sourceMappingURL=timestamp.module.js.map