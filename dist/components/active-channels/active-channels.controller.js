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
exports.ActiveChannelsController = void 0;
const common_1 = require("@nestjs/common");
const active_channels_service_1 = require("./active-channels.service");
const create_active_channel_dto_1 = require("./dto/create-active-channel.dto");
const update_active_channel_dto_1 = require("./dto/update-active-channel.dto");
const swagger_1 = require("@nestjs/swagger");
let ActiveChannelsController = class ActiveChannelsController {
    constructor(activeChannelsService) {
        this.activeChannelsService = activeChannelsService;
    }
    async create(createActiveChannelDto) {
        return this.activeChannelsService.create(createActiveChannelDto);
    }
    async createMultiple(createChannelDtos) {
        return this.activeChannelsService.createMultiple(createChannelDtos);
    }
    search(query) {
        return this.activeChannelsService.search(query);
    }
    async findAll() {
        return this.activeChannelsService.findAll();
    }
    async findOne(channelId) {
        return this.activeChannelsService.findOne(channelId);
    }
    async update(channelId, updateActiveChannelDto) {
        return this.activeChannelsService.update(channelId, updateActiveChannelDto);
    }
    async remove(channelId) {
        return this.activeChannelsService.remove(channelId);
    }
};
exports.ActiveChannelsController = ActiveChannelsController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new active channel' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_active_channel_dto_1.CreateActiveChannelDto]),
    __metadata("design:returntype", Promise)
], ActiveChannelsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('createMultiple'),
    (0, swagger_1.ApiOperation)({ summary: 'Create multiple channels' }),
    (0, swagger_1.ApiBody)({ type: [create_active_channel_dto_1.CreateActiveChannelDto] }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", Promise)
], ActiveChannelsController.prototype, "createMultiple", null);
__decorate([
    (0, common_1.Get)('search'),
    (0, swagger_1.ApiOperation)({ summary: 'Search channels by filters' }),
    (0, swagger_1.ApiQuery)({ name: 'channelId', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'broadcast', required: false, type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'canSendMsgs', required: false, type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'participantsCount', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'restricted', required: false, type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'sendMessages', required: false, type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'title', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'username', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'wordRestriction', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'dMRestriction', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'availableMsgs', required: false, type: [String] }),
    (0, swagger_1.ApiQuery)({ name: 'reactions', required: false, type: [String] }),
    (0, swagger_1.ApiQuery)({ name: 'banned', required: false, type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'reactRestricted', required: false, type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'megagroup', required: false, type: Boolean }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ActiveChannelsController.prototype, "search", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get all active channels' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ActiveChannelsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':channelId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get an active channel by channelId' }),
    __param(0, (0, common_1.Param)('channelId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ActiveChannelsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':channelId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update an active channel by channelId' }),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_active_channel_dto_1.UpdateActiveChannelDto]),
    __metadata("design:returntype", Promise)
], ActiveChannelsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':channelId'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete an active channel by channelId' }),
    __param(0, (0, common_1.Param)('channelId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ActiveChannelsController.prototype, "remove", null);
exports.ActiveChannelsController = ActiveChannelsController = __decorate([
    (0, swagger_1.ApiTags)('Active Channels'),
    (0, common_1.Controller)('active-channels'),
    __metadata("design:paramtypes", [active_channels_service_1.ActiveChannelsService])
], ActiveChannelsController);
//# sourceMappingURL=active-channels.controller.js.map