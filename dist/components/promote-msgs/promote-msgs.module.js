"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromoteMsgModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const promote_msgs_service_1 = require("./promote-msgs.service");
const promote_msgs_controller_1 = require("./promote-msgs.controller");
const promote_msgs_schema_1 = require("./promote-msgs.schema");
let PromoteMsgModule = class PromoteMsgModule {
};
exports.PromoteMsgModule = PromoteMsgModule;
exports.PromoteMsgModule = PromoteMsgModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            PromoteMsgModule,
            mongoose_1.MongooseModule.forFeature([{ name: 'promotemsgModule', collection: 'promoteMsgs', schema: promote_msgs_schema_1.PromoteMsgSchema }]),
        ],
        providers: [promote_msgs_service_1.PromoteMsgsService],
        controllers: [promote_msgs_controller_1.PromoteMsgsController],
        exports: [promote_msgs_service_1.PromoteMsgsService],
    })
], PromoteMsgModule);
//# sourceMappingURL=promote-msgs.module.js.map