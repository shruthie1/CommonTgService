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
exports.ArchivedClientService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let ArchivedClientService = class ArchivedClientService {
    constructor(archivedclientModel) {
        this.archivedclientModel = archivedclientModel;
    }
    async create(createClientDto) {
        const createdUser = new this.archivedclientModel(createClientDto);
        return createdUser.save();
    }
    async findAll() {
        const results = await this.archivedclientModel.find().exec();
        return results;
    }
    async findOne(mobile) {
        const user = await this.archivedclientModel.findOne({ mobile }).exec();
        return user;
    }
    async update(mobile, updateClientDto) {
        delete updateClientDto["_id"];
        console.log({ ...updateClientDto });
        const updatedUser = await this.archivedclientModel.findOneAndUpdate({ mobile }, { $set: updateClientDto }, { new: true, upsert: true }).exec();
        return updatedUser;
    }
    async remove(mobile) {
        const deletedUser = await this.archivedclientModel.findOneAndDelete({ mobile }).exec();
        if (!deletedUser) {
            throw new common_1.NotFoundException(`Client with ID "${mobile}" not found`);
        }
        return deletedUser;
    }
    async search(filter) {
        console.log(filter);
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') };
        }
        console.log(filter);
        return this.archivedclientModel.find(filter).exec();
    }
    async executeQuery(query) {
        try {
            if (!query) {
                throw new common_1.BadRequestException('Query is invalid.');
            }
            return await this.archivedclientModel.find(query).exec();
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(error.message);
        }
    }
};
exports.ArchivedClientService = ArchivedClientService;
exports.ArchivedClientService = ArchivedClientService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)('ArchivedArchivedClientsModule')),
    __metadata("design:paramtypes", [mongoose_2.Model])
], ArchivedClientService);
//# sourceMappingURL=archived-client.service.js.map