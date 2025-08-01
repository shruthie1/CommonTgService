"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamicDataModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const dynamic_data_controller_1 = require("./dynamic-data.controller");
const dynamic_data_service_1 = require("./dynamic-data.service");
const dynamic_data_schema_1 = require("./dynamic-data.schema");
const n_point_1 = require("../n-point");
let DynamicDataModule = class DynamicDataModule {
};
exports.DynamicDataModule = DynamicDataModule;
exports.DynamicDataModule = DynamicDataModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([
                { name: dynamic_data_schema_1.DynamicData.name, schema: dynamic_data_schema_1.DynamicDataSchema },
            ]),
            n_point_1.NpointModule,
        ],
        controllers: [dynamic_data_controller_1.DynamicDataController],
        providers: [dynamic_data_service_1.DynamicDataService],
        exports: [dynamic_data_service_1.DynamicDataService],
    })
], DynamicDataModule);
//# sourceMappingURL=dynamic-data.module.js.map