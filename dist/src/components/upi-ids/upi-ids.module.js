"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpiIdModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const upi_ids_service_1 = require("./upi-ids.service");
const upi_ids_controller_1 = require("./upi-ids.controller");
const upi_ids_schema_1 = require("./upi-ids.schema");
const npoint_module_1 = require("../n-point/npoint.module");
let UpiIdModule = class UpiIdModule {
};
exports.UpiIdModule = UpiIdModule;
exports.UpiIdModule = UpiIdModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            UpiIdModule,
            npoint_module_1.NpointModule,
            mongoose_1.MongooseModule.forFeature([{ name: 'UpiIdModule', collection: 'upi-ids', schema: upi_ids_schema_1.UpiIdSchema }]),
        ],
        providers: [upi_ids_service_1.UpiIdService],
        controllers: [upi_ids_controller_1.UpiIdController],
        exports: [upi_ids_service_1.UpiIdService],
    })
], UpiIdModule);
//# sourceMappingURL=upi-ids.module.js.map