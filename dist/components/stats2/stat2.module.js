"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Stat2Module = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const stat2_service_1 = require("./stat2.service");
const stat2_controller_1 = require("./stat2.controller");
const stat2_schema_1 = require("./stat2.schema");
let Stat2Module = class Stat2Module {
};
exports.Stat2Module = Stat2Module;
exports.Stat2Module = Stat2Module = __decorate([
    (0, common_1.Module)({
        imports: [mongoose_1.MongooseModule.forFeature([{ name: "Stats2Module", collection: "stats2", schema: stat2_schema_1.StatSchema }])],
        controllers: [stat2_controller_1.Stat2Controller],
        providers: [stat2_service_1.Stat2Service],
    })
], Stat2Module);
//# sourceMappingURL=stat2.module.js.map