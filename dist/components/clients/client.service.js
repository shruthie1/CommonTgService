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
exports.ClientService = void 0;
const Telegram_service_1 = require("./../Telegram/Telegram.service");
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const client_schema_1 = require("./schemas/client.schema");
const buffer_client_service_1 = require("../buffer-clients/buffer-client.service");
const Helpers_1 = require("telegram/Helpers");
const users_service_1 = require("../users/users.service");
const archived_client_service_1 = require("../archived-clients/archived-client.service");
const utils_1 = require("../../utils");
let ClientService = class ClientService {
    constructor(clientModel, telegramService, bufferClientService, usersService, archivedClientService) {
        this.clientModel = clientModel;
        this.telegramService = telegramService;
        this.bufferClientService = bufferClientService;
        this.usersService = usersService;
        this.archivedClientService = archivedClientService;
        this.clientsMap = new Map();
    }
    async create(createClientDto) {
        const createdUser = new this.clientModel(createClientDto);
        return createdUser.save();
    }
    async findAll() {
        const clientMapLength = this.clientsMap.size;
        console.log(clientMapLength);
        if (clientMapLength < 3) {
            const results = await this.clientModel.find({}).exec();
            for (const client of results) {
                this.clientsMap.set(client.clientId, client);
            }
            return results;
        }
        else {
            return Array.from(this.clientsMap.values());
        }
    }
    async findOne(clientId) {
        const client = this.clientsMap.get(clientId);
        if (client) {
            return client;
        }
        else {
            const user = await this.clientModel.findOne({ clientId }, { _id: 0 }).exec();
            this.clientsMap.set(clientId, user);
            if (!user) {
                throw new common_1.NotFoundException(`Client with ID "${clientId}" not found`);
            }
            return user;
        }
    }
    async update(clientId, updateClientDto) {
        delete updateClientDto['_id'];
        const updatedUser = await this.clientModel.findOneAndUpdate({ clientId }, { $set: updateClientDto }, { new: true, upsert: true }).exec();
        this.clientsMap.set(clientId, updatedUser);
        if (!updatedUser) {
            throw new common_1.NotFoundException(`Client with ID "${clientId}" not found`);
        }
        return updatedUser;
    }
    async remove(clientId) {
        const deletedUser = await this.clientModel.findOneAndDelete({ clientId }).exec();
        if (!deletedUser) {
            throw new common_1.NotFoundException(`Client with ID "${clientId}" not found`);
        }
        return deletedUser;
    }
    async search(filter) {
        console.log(filter);
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') };
        }
        console.log(filter);
        return this.clientModel.find(filter).exec();
    }
    async setupClient(clientId, setupClientQueryDto) {
        await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Received New Client Request for - ${clientId}`);
        console.log(setupClientQueryDto);
        await this.telegramService.disconnectAll();
        try {
            const existingClient = await this.findOne(clientId);
            const existingClientMobile = existingClient.mobile;
            const existingClientUser = (await this.usersService.search({ mobile: existingClientMobile }))[0];
            await this.telegramService.createClient(existingClientMobile, false, true);
            if (setupClientQueryDto.formalities) {
                await this.telegramService.updateUsername(existingClientMobile, '');
                await (0, Helpers_1.sleep)(2000);
                await this.telegramService.updatePrivacyforDeletedAccount(existingClientMobile);
                await (0, Helpers_1.sleep)(2000);
                await this.telegramService.deleteProfilePhotos(existingClientMobile);
                console.log("Formalities finished");
                await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Formalities finished`);
            }
            else {
                console.log("Formalities skipped");
            }
            const today = (new Date(Date.now())).toISOString().split('T')[0];
            if (setupClientQueryDto.archiveOld) {
                const availableDate = (new Date(Date.now() + (setupClientQueryDto.days * 24 * 60 * 60 * 1000))).toISOString().split('T')[0];
                const updatedBufferClient = await this.bufferClientService.update(existingClientMobile, {
                    mobile: existingClientMobile,
                    createdDate: today,
                    availableDate,
                    session: existingClientUser.session,
                    tgId: existingClientUser.tgId,
                });
                console.log("client Archived: ", updatedBufferClient);
                await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Client Archived`);
            }
            else {
                console.log("Client Archive Skipped");
            }
            const query = { availableDate: { $lte: today } };
            const newBufferClient = (await this.bufferClientService.executeQuery(query))[0];
            if (newBufferClient) {
                this.telegramService.setActiveClientSetup({ mobile: newBufferClient.mobile, clientId });
                await this.telegramService.createClient(newBufferClient.mobile, false, true);
                const username = (clientId?.match(/[a-zA-Z]+/g)).toString();
                const userCaps = username[0].toUpperCase() + username.slice(1);
                const updatedUsername = await this.telegramService.updateUsername(newBufferClient.mobile, `${userCaps}_Redd`);
                await this.telegramService.updateNameandBio(existingClientMobile, 'Deleted Account', `New Acc: @${updatedUsername}`);
                console.log("client updated");
            }
            else {
                await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Buffer Clients not available`);
                console.log("Buffer Clients not available");
            }
            const newClientMe = await this.telegramService.getMe(existingClientMobile);
            await this.telegramService.deleteClient(existingClientMobile);
            const archivedClient = await this.archivedClientService.findOne(newBufferClient.mobile);
            if (archivedClient) {
                await this.updateClient(archivedClient.session, newClientMe.phone, newClientMe.username, clientId);
            }
            else {
                await this.generateNewSession(newBufferClient.mobile);
            }
            await this.bufferClientService.remove(newBufferClient.mobile);
            await this.archivedClientService.update(existingClient.mobile, existingClient);
        }
        catch (error) {
            (0, utils_1.parseError)(error);
        }
    }
    async updateClient(session, mobile, userName, clientId) {
        console.log("Updating Client session");
        await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Final Details Recived`);
        const newClient = await this.update(clientId, { session: session, mobile, userName, mainAccount: userName });
        if ((0, utils_1.fetchNumbersFromString)(clientId) == '2') {
            const client2 = clientId.replace("1", "2");
            await this.update(client2, { mainAccount: userName });
        }
        console.log("Update finished");
        await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Update finished`);
        await this.telegramService.disconnectAll();
        await (0, utils_1.fetchWithTimeout)(newClient.deployKey);
        setTimeout(async () => {
            await (0, utils_1.fetchWithTimeout)(`${process.env.uptimeChecker}/forward/updateclient/${clientId}`);
        }, 10000);
        await (0, utils_1.fetchWithTimeout)(`${process.env.uptimeChecker}/refreshmap`);
    }
    async generateNewSession(phoneNumber) {
        try {
            console.log("String Generation started");
            await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=String Generation started`);
            await (0, Helpers_1.sleep)(1000);
            const response = await (0, utils_1.fetchWithTimeout)(`https://tgsignup.onrender.com/login?phone=${phoneNumber}&force=${true}`, { timeout: 15000 }, 1);
            if (response) {
                console.log(`Code Sent successfully`, response.data);
                await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Code Sent successfully`);
            }
            else {
                await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Failed to send Code`);
                console.log("Failed to send Code", response);
                await (0, Helpers_1.sleep)(5000);
                await this.generateNewSession(phoneNumber);
            }
        }
        catch (error) {
            console.log(error);
        }
    }
    async executeQuery(query) {
        try {
            if (!query) {
                throw new common_1.BadRequestException('Query is invalid.');
            }
            return await this.clientModel.find(query).exec();
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(error.message);
        }
    }
};
exports.ClientService = ClientService;
exports.ClientService = ClientService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(client_schema_1.Client.name)),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => Telegram_service_1.TelegramService))),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => buffer_client_service_1.BufferClientService))),
    __param(3, (0, common_1.Inject)((0, common_1.forwardRef)(() => users_service_1.UsersService))),
    __param(4, (0, common_1.Inject)((0, common_1.forwardRef)(() => archived_client_service_1.ArchivedClientService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        Telegram_service_1.TelegramService,
        buffer_client_service_1.BufferClientService,
        users_service_1.UsersService,
        archived_client_service_1.ArchivedClientService])
], ClientService);
//# sourceMappingURL=client.service.js.map