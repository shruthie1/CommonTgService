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
exports.TimestampService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const client_service_1 = require("../clients/client.service");
let TimestampService = class TimestampService {
    constructor(timestampModel, clientService) {
        this.timestampModel = timestampModel;
        this.clientService = clientService;
    }
    async findOne() {
        const timestamp = await this.timestampModel.findOne({}).lean().exec();
        if (!timestamp) {
            throw new common_1.NotFoundException(`Timestamp not found`);
        }
        if (timestamp._id) {
            delete timestamp._id;
        }
        return timestamp;
    }
    async getTimeDifferences(threshold = 3 * 60 * 1000) {
        const timestamp = await this.timestampModel.findOne({}).lean().exec();
        if (!timestamp) {
            throw new common_1.NotFoundException(`Timestamp not found`);
        }
        const currentTime = Date.now();
        const differences = {};
        Object.keys(timestamp).forEach(key => {
            if (key === '_id' || typeof timestamp[key] !== 'number') {
                return;
            }
            const difference = currentTime - timestamp[key];
            if (difference > threshold) {
                differences[key] = difference;
            }
        });
        return differences;
    }
    async getClientsWithTimeDifference(threshold = 3 * 60 * 1000) {
        const differences = await this.getTimeDifferences(threshold);
        const clientIds = Object.keys(differences);
        if (clientIds.length === 0) {
            return [];
        }
        const urls = [];
        for (const clientId of clientIds) {
            const clientParams = clientId.split('_');
            try {
                const client = await this.clientService.findOne(clientParams[0], false);
                if (client) {
                    if (clientParams[1]) {
                        urls.push(client.promoteRepl);
                    }
                    else {
                        urls.push(client.repl);
                    }
                }
            }
            catch (error) {
                console.error(`Error fetching client with ID ${clientId}:`, error.message);
            }
        }
        return urls;
    }
    async update(updateTimestampDto) {
        delete updateTimestampDto['_id'];
        const updatedTimestamp = await this.timestampModel.findOneAndUpdate({}, { $set: { ...updateTimestampDto } }, { new: true, upsert: true, lean: true }).exec();
        if (!updatedTimestamp) {
            throw new common_1.NotFoundException(`Timestamp not found`);
        }
        if (updatedTimestamp._id) {
            delete updatedTimestamp._id;
        }
        return updatedTimestamp;
    }
};
exports.TimestampService = TimestampService;
exports.TimestampService = TimestampService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)('timestampModule')),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => client_service_1.ClientService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        client_service_1.ClientService])
], TimestampService);
//# sourceMappingURL=timestamp.service.js.map