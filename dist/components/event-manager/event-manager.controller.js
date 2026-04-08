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
exports.EventManagerController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const event_manager_service_1 = require("./event-manager.service");
const create_event_dto_1 = require("./dto/create-event.dto");
const schedule_events_dto_1 = require("./dto/schedule-events.dto");
let EventManagerController = class EventManagerController {
    constructor(eventManagerService) {
        this.eventManagerService = eventManagerService;
    }
    async getAllEvents(filter) {
        const data = await this.eventManagerService.getEvents(filter);
        return { data };
    }
    async getEventById(id) {
        const data = await this.eventManagerService.getEventById(id);
        return { data };
    }
    async createEvent(dto) {
        const data = await this.eventManagerService.create(dto);
        return { data };
    }
    async schedulePaidEvents(dto) {
        const data = await this.eventManagerService.schedulePaidEvents(dto.chatId, dto.profile, dto.type);
        return { data };
    }
    async createMultiple(events) {
        const data = await this.eventManagerService.createMultiple(events);
        return { data };
    }
    async deleteMultiple(chatId) {
        const entriesDeleted = await this.eventManagerService.deleteMultiple(chatId);
        return { status: 'Deleted Sucessfully', entriesDeleted };
    }
};
exports.EventManagerController = EventManagerController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get all events (supports query filters)' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], EventManagerController.prototype, "getAllEvents", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get event by ID' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], EventManagerController.prototype, "getEventById", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a single event' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_event_dto_1.CreateEventDto]),
    __metadata("design:returntype", Promise)
], EventManagerController.prototype, "createEvent", null);
__decorate([
    (0, common_1.Post)('schedule'),
    (0, swagger_1.ApiOperation)({ summary: 'Schedule paid events for a chatId+profile' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [schedule_events_dto_1.ScheduleEventsDto]),
    __metadata("design:returntype", Promise)
], EventManagerController.prototype, "schedulePaidEvents", null);
__decorate([
    (0, common_1.Post)('createMultiple'),
    (0, swagger_1.ApiOperation)({ summary: 'Create multiple events at once' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", Promise)
], EventManagerController.prototype, "createMultiple", null);
__decorate([
    (0, common_1.Delete)('delete'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete all events for a chatId' }),
    __param(0, (0, common_1.Query)('chatId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], EventManagerController.prototype, "deleteMultiple", null);
exports.EventManagerController = EventManagerController = __decorate([
    (0, swagger_1.ApiTags)('event-manager'),
    (0, common_1.Controller)('event-manager'),
    __metadata("design:paramtypes", [event_manager_service_1.EventManagerService])
], EventManagerController);
//# sourceMappingURL=event-manager.controller.js.map