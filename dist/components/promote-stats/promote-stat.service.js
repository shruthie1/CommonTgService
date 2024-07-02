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
exports.PromoteStatService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const promote_stat_schema_1 = require("./schemas/promote-stat.schema");
const client_service_1 = require("../clients/client.service");
let PromoteStatService = class PromoteStatService {
    constructor(promoteStatModel, clientService) {
        this.promoteStatModel = promoteStatModel;
        this.clientService = clientService;
    }
    async create(createPromoteStatDto) {
        const createdPromoteStat = new this.promoteStatModel(createPromoteStatDto);
        return createdPromoteStat.save();
    }
    async findAll() {
        const promoteStat = await this.promoteStatModel.find().exec();
        return promoteStat;
    }
    async findByClient(client) {
        const promoteStat = await this.promoteStatModel.findOne({ client }).exec();
        if (!promoteStat) {
            throw new common_1.NotFoundException(`PromoteStat not found for client ${client}`);
        }
        return promoteStat;
    }
    async update(client, updatePromoteStatDto) {
        const promoteStat = await this.promoteStatModel.findOneAndUpdate({ client }, updatePromoteStatDto, { new: true }).exec();
        if (!promoteStat) {
            throw new common_1.NotFoundException(`PromoteStat not found for client ${client}`);
        }
        return promoteStat;
    }
    async deleteOne(client) {
        const result = await this.promoteStatModel.deleteOne({ client }).exec();
        if (result.deletedCount === 0) {
            throw new common_1.NotFoundException(`PromoteStat not found for client ${client}`);
        }
    }
    async deleteAll() {
        await this.promoteStatModel.deleteMany({}).exec();
    }
    async reinitPromoteStats() {
        const users = await this.clientService.findAll();
        for (const user of users) {
            await this.promoteStatModel.updateOne({ client: user.clientId }, {
                $set: {
                    data: Object.fromEntries((await this.promoteStatModel.findOne({ client: user.clientId })).channels?.map(channel => [channel, 0])),
                    totalCount: 0,
                    uniqueChannels: 0,
                    releaseDay: Date.now(),
                    lastupdatedTimeStamp: Date.now()
                }
            });
        }
    }
};
exports.PromoteStatService = PromoteStatService;
exports.PromoteStatService = PromoteStatService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(promote_stat_schema_1.PromoteStat.name)),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => client_service_1.ClientService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        client_service_1.ClientService])
], PromoteStatService);
//# sourceMappingURL=promote-stat.service.js.map