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
const Telegram_service_1 = require("../Telegram/Telegram.service");
const Helpers_1 = require("telegram/Helpers");
const client_service_1 = require("../clients/client.service");
let ArchivedClientService = class ArchivedClientService {
    constructor(archivedclientModel, telegramService, clientService) {
        this.archivedclientModel = archivedclientModel;
        this.telegramService = telegramService;
        this.clientService = clientService;
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
        const user = (await this.archivedclientModel.findOne({ mobile }).exec())?.toJSON();
        return user;
    }
    async fetchOne(mobile) {
        const user = (await this.archivedclientModel.findOne({ mobile }).exec())?.toJSON();
        if (user) {
            return user;
        }
        else {
            await this.telegramService.createClient(mobile);
            const newSession = await this.telegramService.createNewSession(mobile);
            await this.telegramService.deleteClient(mobile);
            return await this.create({
                "channelLink": "default",
                "clientId": "default",
                "dbcoll": "default",
                "deployKey": "default",
                "link": "default",
                "mainAccount": "default",
                "name": "default",
                "password": "Ajtdmwajt1@",
                "repl": "default",
                "session": newSession,
                "username": "default",
                "mobile": mobile,
                product: "default"
            });
        }
    }
    async update(mobile, updateClientDto) {
        delete updateClientDto["_id"];
        if (updateClientDto._doc) {
            delete updateClientDto._doc['_id'];
        }
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
    async checkArchivedClients() {
        await this.telegramService.disconnectAll();
        await (0, Helpers_1.sleep)(2000);
        const archivedClients = await this.findAll();
        const clients = await this.clientService.findAll();
        const clientIds = clients.map(client => client.mobile);
        archivedClients.map(async (document) => {
            if (!clientIds.includes(document.mobile)) {
                try {
                    await this.telegramService.createClient(document.mobile, true, false);
                    await this.telegramService.updateUsername(document.mobile, '');
                    await this.telegramService.updateNameandBio(document.mobile, 'Deleted Account');
                    await this.telegramService.deleteClient(document.mobile);
                    await (0, Helpers_1.sleep)(2000);
                }
                catch (error) {
                    console.log(document.mobile, " :  false");
                    this.remove(document.mobile);
                    await this.telegramService.deleteClient(document.mobile);
                }
            }
            else {
                console.log("Number is a Active Client");
            }
        });
        return "Triggered ArchiveClients check";
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
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => Telegram_service_1.TelegramService))),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => client_service_1.ClientService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        Telegram_service_1.TelegramService,
        client_service_1.ClientService])
], ArchivedClientService);
//# sourceMappingURL=archived-client.service.js.map