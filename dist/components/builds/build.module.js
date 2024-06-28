"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BuildModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const build_service_1 = require("./build.service");
const build_controller_1 = require("./build.controller");
const builds_schema_1 = require("./builds.schema");
let BuildModule = class BuildModule {
};
exports.BuildModule = BuildModule;
exports.BuildModule = BuildModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            BuildModule,
            mongoose_1.MongooseModule.forFeature([{ name: 'buildModule', collection: 'builds', schema: builds_schema_1.BuildSchema }]),
        ],
        providers: [build_service_1.BuildService],
        controllers: [build_controller_1.BuildController],
        exports: [BuildModule],
    })
], BuildModule);
//# sourceMappingURL=build.module.js.map