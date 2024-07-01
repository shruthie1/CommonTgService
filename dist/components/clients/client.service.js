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
const path = require("path");
const cloudinary_1 = require("../../cloudinary");
let settingupClient = Date.now() - 250000;
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
        if (clientMapLength < 20) {
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
    async findAllMasked() {
        const results = await this.clientModel.find({}, { session: 0, mobile: 0, password: 0 }).exec();
        return results;
    }
    async refreshMap() {
        this.clientsMap.clear();
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
        if (updateClientDto._doc) {
            delete updateClientDto._doc['_id'];
        }
        await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Updating the Existing client`);
        const updatedUser = await this.clientModel.findOneAndUpdate({ clientId }, { $set: updateClientDto }, { new: true, upsert: true }).exec();
        if (!updatedUser) {
            throw new common_1.NotFoundException(`Client with ID "${clientId}" not found`);
        }
        this.clientsMap.set(clientId, updatedUser);
        await (0, utils_1.fetchWithTimeout)(`${process.env.uptimeChecker}/refreshmap`);
        await (0, utils_1.fetchWithTimeout)(`${process.env.uptimebot}/refreshmap`);
        console.log("Refreshed Maps");
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
        console.log(`Received New Client Request for - ${clientId}`);
        if (Date.now() > (settingupClient + 300000)) {
            settingupClient = Date.now();
            const existingClient = await this.findOne(clientId);
            const existingClientMobile = existingClient.mobile;
            await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Received New Client Request for - ${clientId} - OldNumber: ${existingClient.mobile} || ${existingClient.username}`);
            console.log(setupClientQueryDto);
            await this.telegramService.disconnectAll();
            try {
                const archiveOld = (0, utils_1.toBoolean)(setupClientQueryDto.archiveOld);
                const today = (new Date(Date.now())).toISOString().split('T')[0];
                const existingClientUser = (await this.usersService.search({ mobile: existingClientMobile }))[0];
                let isArchived = false;
                if (existingClientUser) {
                    try {
                        await this.telegramService.createClient(existingClientMobile, false, true);
                        if ((0, utils_1.toBoolean)(setupClientQueryDto.formalities)) {
                            console.log("Started Formalities");
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
                        if (archiveOld) {
                            const availableDate = (new Date(Date.now() + (setupClientQueryDto.days * 24 * 60 * 60 * 1000))).toISOString().split('T')[0];
                            const bufferClientDto = {
                                mobile: existingClientMobile,
                                createdDate: today,
                                updatedDate: today,
                                availableDate,
                                session: existingClientUser.session,
                                tgId: existingClientUser.tgId,
                                channels: 100
                            };
                            const updatedBufferClient = await this.bufferClientService.createOrUpdate(existingClientMobile, bufferClientDto);
                            await this.archivedClientService.update(existingClient.mobile, existingClient);
                            isArchived = true;
                            console.log("client Archived: ", updatedBufferClient);
                            await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Client Archived`);
                        }
                        else {
                            console.log("Client Archive Skipped");
                            await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Client Archive Failed`);
                        }
                    }
                    catch (error) {
                        console.log("Cannot Archive Old Client");
                        const errorDetails = (0, utils_1.parseError)(error);
                        if ((0, utils_1.contains)(errorDetails.message.toLowerCase(), ['expired', 'unregistered', 'deactivated', "session_revoked", "user_deactivated_ban"])) {
                            console.log("Deleting User: ", existingClientUser.mobile);
                            await this.bufferClientService.remove(existingClientUser.mobile);
                            await this.archivedClientService.remove(existingClientUser.mobile);
                        }
                        else {
                            console.log('Not Deleting user');
                        }
                        isArchived = false;
                    }
                }
                const query = { availableDate: { $lte: today } };
                const newBufferClient = (await this.bufferClientService.executeQuery(query))[0];
                try {
                    if (newBufferClient) {
                        this.telegramService.setActiveClientSetup({ mobile: newBufferClient.mobile, clientId });
                        await this.telegramService.createClient(newBufferClient.mobile, false, true);
                        const username = (clientId?.match(/[a-zA-Z]+/g)).toString();
                        const userCaps = username[0].toUpperCase() + username.slice(1);
                        let baseUsername = `${userCaps}_Red` + (0, utils_1.fetchNumbersFromString)(clientId);
                        const updatedUsername = await this.telegramService.updateUsername(newBufferClient.mobile, baseUsername);
                        if (isArchived) {
                            console.log("Updated Old Client Name and Bio");
                            await this.telegramService.updateNameandBio(existingClientMobile, 'Deleted Account', `New Acc: @${updatedUsername}`);
                        }
                        await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Updated username for NewNumber:${newBufferClient.mobile} || ${updatedUsername}`);
                    }
                    else {
                        await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Buffer Clients not available`);
                        console.log("Buffer Clients not available");
                    }
                    const newClientMe = await this.telegramService.getMe(newBufferClient.mobile);
                    await this.telegramService.deleteClient(existingClientMobile);
                    const archivedClient = await this.archivedClientService.findOne(newBufferClient.mobile);
                    if (archivedClient) {
                        await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Using Old Session from Archived Clients- NewNumber:${newBufferClient.mobile}`);
                        await this.updateClientSession(archivedClient.session, newClientMe.phone, newClientMe.username, clientId);
                    }
                    else {
                        await this.generateNewSession(newBufferClient.mobile);
                    }
                }
                catch (error) {
                    console.log("Removing buffer as error");
                    const availableDate = (new Date(Date.now() + (3 * 24 * 60 * 60 * 1000))).toISOString().split('T')[0];
                    await this.bufferClientService.createOrUpdate(newBufferClient.mobile, { availableDate });
                    this.telegramService.setActiveClientSetup(undefined);
                }
            }
            catch (error) {
                (0, utils_1.parseError)(error);
                this.telegramService.setActiveClientSetup(undefined);
            }
        }
        else {
            console.log("Profile Setup Recently tried");
        }
    }
    async updateClientSession(session, mobile, username, clientId) {
        this.telegramService.setActiveClientSetup(undefined);
        console.log("Updating Client session for ", clientId, username, mobile);
        await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Final Session Details Recived`);
        const newClient = await this.update(clientId, { session: session, mobile, username, mainAccount: username });
        await this.bufferClientService.remove(mobile);
        console.log("Update finished Exitting Exiiting Tg Service");
        await (0, utils_1.fetchWithTimeout)(newClient.deployKey);
        await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Update finished`);
        await this.telegramService.disconnectAll();
        setTimeout(async () => {
            await this.updateClient(clientId);
        }, 10000);
    }
    async updateClient(clientId) {
        const client = await this.findOne(clientId);
        try {
            await cloudinary_1.CloudinaryService.getInstance(client?.dbcoll?.toLowerCase());
            const telegramClient = await this.telegramService.createClient(client.mobile, true, false);
            await (0, Helpers_1.sleep)(2000);
            const me = await telegramClient.getMe();
            if (me.username !== client.username) {
                const username = (clientId?.match(/[a-zA-Z]+/g)).toString();
                const userCaps = username[0].toUpperCase() + username.slice(1);
                let baseUsername = `${userCaps}_Red` + (0, utils_1.fetchNumbersFromString)(clientId);
                const updatedUsername = await telegramClient.updateUsername(baseUsername);
                await this.update(client.clientId, { username: updatedUsername });
            }
            await (0, Helpers_1.sleep)(2000);
            if (me.firstName !== client.name) {
                await telegramClient.updateProfile(client.name, "Genuine Paid Girl🥰, Best Services❤️");
            }
            await (0, Helpers_1.sleep)(3000);
            await telegramClient.deleteProfilePhotos();
            await (0, Helpers_1.sleep)(3000);
            await telegramClient.updatePrivacy();
            await (0, Helpers_1.sleep)(3000);
            const rootPath = process.cwd();
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp1.jpg'));
            await (0, Helpers_1.sleep)(3000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp2.jpg'));
            await (0, Helpers_1.sleep)(3000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp3.jpg'));
            await (0, Helpers_1.sleep)(2000);
            await this.telegramService.deleteClient(client.mobile);
        }
        catch (error) {
            (0, utils_1.parseError)(error);
        }
    }
    async updateClients() {
        const clients = await this.findAll();
        for (const client of clients) {
            await this.updateClient(client.clientId);
        }
    }
    async generateNewSession(phoneNumber, attempt = 1) {
        try {
            console.log("String Generation started");
            await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=String Generation started for NewNumber:${phoneNumber}`);
            await (0, Helpers_1.sleep)(1000);
            const response = await (0, utils_1.fetchWithTimeout)(`https://tgsignup.onrender.com/login?phone=${phoneNumber}&force=${true}`, { timeout: 15000 }, 1);
            if (response) {
                console.log(`Code Sent successfully`, response.data);
                await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Code Sent successfully`);
                await this.bufferClientService.update(phoneNumber, { availableDate: (new Date(Date.now() + (24 * 60 * 60 * 1000))).toISOString().split('T')[0] });
            }
            else {
                await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Failed to send Code`);
                console.log("Failed to send Code", response);
                if (attempt < 2) {
                    await (0, Helpers_1.sleep)(8000);
                    await this.generateNewSession(phoneNumber, attempt + 1);
                }
            }
        }
        catch (error) {
            console.log(error);
            if (attempt < 2) {
                await (0, Helpers_1.sleep)(8000);
                await this.generateNewSession(phoneNumber, attempt + 1);
            }
        }
    }
    async executeQuery(query, sort, limit, skip) {
        try {
            if (!query) {
                throw new common_1.BadRequestException('Query is invalid.');
            }
            const queryExec = this.clientModel.find(query);
            if (sort) {
                queryExec.sort(sort);
            }
            if (limit) {
                queryExec.limit(limit);
            }
            if (skip) {
                queryExec.skip(skip);
            }
            return await queryExec.exec();
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