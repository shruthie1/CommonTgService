"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventManagerModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const event_manager_controller_1 = require("./event-manager.controller");
const event_manager_service_1 = require("./event-manager.service");
const event_schema_1 = require("./schemas/event.schema");
const client_module_1 = require("../clients/client.module");
let EventManagerModule = class EventManagerModule {
};
exports.EventManagerModule = EventManagerModule;
exports.EventManagerModule = EventManagerModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([{ name: event_schema_1.Event.name, schema: event_schema_1.EventSchema }]),
            (0, common_1.forwardRef)(() => client_module_1.ClientModule),
        ],
        controllers: [event_manager_controller_1.EventManagerController],
        providers: [event_manager_service_1.EventManagerService],
        exports: [event_manager_service_1.EventManagerService],
    })
], EventManagerModule);
//# sourceMappingURL=event-manager.module.js.map