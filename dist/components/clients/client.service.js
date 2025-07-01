"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ClientService_1;
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
const path = __importStar(require("path"));
const cloudinary_1 = require("../../cloudinary");
const npoint_service_1 = require("../n-point/npoint.service");
const parseError_1 = require("../../utils/parseError");
const fetchWithTimeout_1 = require("../../utils/fetchWithTimeout");
const logbots_1 = require("../../utils/logbots");
const connection_manager_1 = require("../Telegram/utils/connection-manager");
const session_manager_1 = require("../session-manager");
let settingupClient = Date.now() - 250000;
let ClientService = ClientService_1 = class ClientService {
    constructor(clientModel, telegramService, bufferClientService, usersService, archivedClientService, sessionService, npointSerive) {
        this.clientModel = clientModel;
        this.telegramService = telegramService;
        this.bufferClientService = bufferClientService;
        this.usersService = usersService;
        this.archivedClientService = archivedClientService;
        this.sessionService = sessionService;
        this.npointSerive = npointSerive;
        this.logger = new common_1.Logger(ClientService_1.name);
        this.clientsMap = new Map();
        this.lastUpdateMap = new Map();
        setInterval(async () => {
            await this.refreshMap();
            await this.checkNpoint();
        }, 5 * 60 * 1000);
    }
    async onModuleDestroy() {
        console.log('Module is being Destroyed, Disconnecting all clients');
        await connection_manager_1.connectionManager.handleShutdown();
    }
    async checkNpoint() {
        const npointIdFull = "7c2682f37bb93ef486ba";
        const npointIdMasked = "f0d1e44d82893490bbde";
        const { data: npointMaskedClients } = await (0, fetchWithTimeout_1.fetchWithTimeout)(`https://api.npoint.io/${npointIdMasked}`);
        const existingMaskedClients = await this.findAllMaskedObject();
        if ((0, utils_1.areJsonsNotSame)(npointMaskedClients, existingMaskedClients)) {
            await this.npointSerive.updateDocument(npointIdMasked, existingMaskedClients);
            console.log("Updated Masked Clients from Npoint");
        }
        const { data: npointClients } = await (0, fetchWithTimeout_1.fetchWithTimeout)(`https://api.npoint.io/${npointIdFull}`);
        const existingClients = await this.findAllObject();
        if ((0, utils_1.areJsonsNotSame)(npointClients, existingClients)) {
            await this.npointSerive.updateDocument(npointIdFull, existingClients);
            console.log("Updated Full Clients from Npoint");
        }
    }
    async create(createClientDto) {
        const createdUser = new this.clientModel(createClientDto);
        return createdUser.save();
    }
    async findAll() {
        this.logger.debug('Retrieving all client documents');
        try {
            if (this.clientsMap.size < 20) {
                const documents = await this.clientModel.find({}, { _id: 0, updatedAt: 0 }).lean().exec();
                documents.forEach(client => {
                    this.clientsMap.set(client.clientId, client);
                });
                this.logger.debug(`Successfully retrieved ${documents.length} client documents`);
                return Array.from(this.clientsMap.values());
            }
            else {
                this.logger.debug(`Retrieved ${this.clientsMap.size} clients from cache`);
                return Array.from(this.clientsMap.values());
            }
        }
        catch (error) {
            (0, parseError_1.parseError)(error, 'Failed to retrieve all clients: ', true);
            this.logger.error(`Failed to retrieve all clients: ${error.message}`, error.stack);
            throw error;
        }
    }
    async findAllMasked() {
        const clients = await this.findAll();
        const maskedClients = clients.map(client => {
            const { session, mobile, password, promoteMobile, ...maskedClient } = client;
            return { ...maskedClient };
        });
        return maskedClients;
    }
    async findAllObject() {
        this.logger.debug('Retrieving all client documents');
        try {
            if (this.clientsMap.size < 20) {
                const documents = await this.clientModel.find({}, { _id: 0, updatedAt: 0 }).lean().exec();
                const result = documents.reduce((acc, client) => {
                    this.clientsMap.set(client.clientId, client);
                    acc[client.clientId] = client;
                    return acc;
                }, {});
                this.logger.debug(`Successfully retrieved ${documents.length} client documents`);
                console.log("Refreshed Clients");
                return result;
            }
            else {
                const result = Array.from(this.clientsMap.entries()).reduce((acc, [clientId, client]) => {
                    acc[clientId] = client;
                    return acc;
                }, {});
                this.logger.debug(`Retrieved ${this.clientsMap.size} clients from cache`);
                return result;
            }
        }
        catch (error) {
            (0, parseError_1.parseError)(error, 'Failed to retrieve all clients: ', true);
            this.logger.error(`Failed to retrieve all clients: ${error.message}`, error.stack);
            throw error;
        }
    }
    async findAllMaskedObject(query) {
        const allClients = await this.findAll();
        const clients = Object.values(allClients);
        const filteredClients = query
            ? clients.filter(client => {
                return Object.keys(query).every(key => client[key] === query[key]);
            })
            : clients;
        const results = filteredClients.reduce((acc, client) => {
            const { session, mobile, password, promoteMobile, ...maskedClient } = client;
            acc[client.clientId] = { clientId: client.clientId, ...maskedClient };
            return acc;
        }, {});
        return results;
    }
    async refreshMap() {
        console.log("Refreshed Clients");
        this.clientsMap.clear();
    }
    async findOne(clientId, throwErr = true) {
        const client = this.clientsMap.get(clientId);
        if (client) {
            return client;
        }
        else {
            const user = await this.clientModel.findOne({ clientId }, { _id: 0, updatedAt: 0 }).lean().exec();
            this.clientsMap.set(clientId, user);
            if (!user && throwErr) {
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
        const previousUser = await this.clientModel.findOne({ clientId }).lean().exec();
        await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Updating the Existing client: ${clientId}`);
        console.log("Previous Client Values:", previousUser);
        const updatedUser = await this.clientModel.findOneAndUpdate({ clientId }, { $set: updateClientDto }, { new: true, upsert: true }).lean().exec();
        if (!updatedUser) {
            throw new common_1.NotFoundException(`Client with ID "${clientId}" not found`);
        }
        await this.checkNpoint();
        this.clientsMap.set(clientId, updatedUser);
        console.log("Updated Client Values:", updatedUser);
        await (0, fetchWithTimeout_1.fetchWithTimeout)(`${process.env.uptimeChecker}/refreshmap`);
        await (0, fetchWithTimeout_1.fetchWithTimeout)(`${process.env.uptimebot}/refreshmap`);
        console.log("Refreshed Maps");
        console.log("Updated Client: ", updatedUser);
        if (previousUser &&
            (previousUser.mobile !== updatedUser.mobile || previousUser.session !== updatedUser.session)) {
            setTimeout(async () => {
                await this.sessionService.createSession({ mobile: updatedUser.mobile, password: 'Ajtdmwajt1@', maxRetries: 5 });
            }, 60000);
        }
        if (previousUser &&
            Array.isArray(updatedUser.promoteMobile) &&
            Array.isArray(previousUser.promoteMobile)) {
            const prevSet = new Set(previousUser.promoteMobile);
            const newPromoteMobiles = updatedUser.promoteMobile.filter(mobile => !prevSet.has(mobile));
            for (const mobile of newPromoteMobiles) {
                setTimeout(async () => {
                    await this.sessionService.createSession({ mobile, password: 'Ajtdmwajt1@', maxRetries: 5 });
                }, 60000);
            }
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
        console.log(`Received New Client Request for - ${clientId}`, settingupClient);
        if ((0, utils_1.toBoolean)(process.env.AUTO_CLIENT_SETUP) && Date.now() > (settingupClient + 240000)) {
            settingupClient = Date.now();
            const existingClient = await this.findOne(clientId);
            const existingClientMobile = existingClient.mobile;
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Received New Client Request for - ${clientId} - OldNumber: ${existingClient.mobile} || ${existingClient.username}`);
            console.log("setupClientQueryDto:", setupClientQueryDto);
            const today = (new Date(Date.now())).toISOString().split('T')[0];
            const query = { availableDate: { $lte: today }, channels: { $gt: 200 } };
            const newBufferClient = (await this.bufferClientService.executeQuery(query, { tgId: 1 }))[0];
            try {
                if (newBufferClient) {
                    this.telegramService.setActiveClientSetup({ ...setupClientQueryDto, clientId, existingMobile: existingClientMobile, newMobile: newBufferClient.mobile });
                    await connection_manager_1.connectionManager.getClient(newBufferClient.mobile);
                    const newSession = await this.telegramService.createNewSession(newBufferClient.mobile);
                    await this.updateClientSession(newSession);
                }
                else {
                    await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Buffer Clients not available`);
                    console.log("Buffer Clients not available");
                }
            }
            catch (error) {
                (0, parseError_1.parseError)(error);
                console.log("Removing buffer as error");
                const availableDate = (new Date(Date.now() + (3 * 24 * 60 * 60 * 1000))).toISOString().split('T')[0];
                await this.bufferClientService.createOrUpdate(newBufferClient.mobile, { availableDate });
                this.telegramService.setActiveClientSetup(undefined);
            }
            finally {
                await connection_manager_1.connectionManager.unregisterClient(newBufferClient.mobile);
            }
        }
        else {
            console.log("Profile Setup Recently tried, wait ::", settingupClient - Date.now());
        }
    }
    async updateClientSession(newSession) {
        try {
            let updatedUsername = '';
            console.log("Updating Client Session");
            const setup = this.telegramService.getActiveClientSetup();
            const { days, archiveOld, clientId, existingMobile, formalities, newMobile } = setup;
            await connection_manager_1.connectionManager.disconnectAll();
            await (0, Helpers_1.sleep)(2000);
            const client = await this.findOne(clientId);
            await connection_manager_1.connectionManager.getClient(newMobile, { handler: true, autoDisconnect: false });
            const firstName = (client.name).split(' ')[0];
            const middleName = (client.name).split(' ')[1];
            const firstNameCaps = firstName[0].toUpperCase() + firstName.slice(1);
            const middleNameCaps = middleName ? middleName[0].toUpperCase() + middleName.slice(1) : '';
            const baseUsername = `${firstNameCaps.slice(0, 4)}${middleNameCaps.slice(0, 3)}` + (0, utils_1.fetchNumbersFromString)(clientId);
            try {
                updatedUsername = await this.telegramService.updateUsername(newMobile, baseUsername);
            }
            catch (error) {
                (0, parseError_1.parseError)(error, 'Error in updating username', true);
            }
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Updated username for NewNumber:${newMobile} || ${updatedUsername}`);
            await connection_manager_1.connectionManager.unregisterClient(newMobile);
            const existingClientUser = (await this.usersService.search({ mobile: existingMobile }))[0];
            const existingClient = await this.findOne(clientId);
            await this.update(clientId, { mobile: newMobile, username: updatedUsername, session: newSession });
            await (0, fetchWithTimeout_1.fetchWithTimeout)(existingClient.deployKey, {}, 1);
            await this.bufferClientService.remove(newMobile);
            setTimeout(async () => {
                await this.updateClient(clientId, 'Delayed update after buffer removal');
            }, 15000);
            try {
                if (existingClientUser) {
                    try {
                        if ((0, utils_1.toBoolean)(formalities)) {
                            await connection_manager_1.connectionManager.getClient(existingMobile, { handler: true, autoDisconnect: false });
                            console.log("Started Formalities");
                            await this.telegramService.updateNameandBio(existingMobile, 'Deleted Account', `New Acc: @${updatedUsername}`);
                            await this.telegramService.deleteProfilePhotos(existingMobile);
                            await this.telegramService.updateUsername(existingMobile, '');
                            await this.telegramService.updatePrivacyforDeletedAccount(existingMobile);
                            console.log("Formalities finished");
                            await connection_manager_1.connectionManager.unregisterClient(existingMobile);
                            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Formalities finished`);
                        }
                        else {
                            console.log("Formalities skipped");
                        }
                        if (archiveOld) {
                            const availableDate = (new Date(Date.now() + ((days + 1) * 24 * 60 * 60 * 1000))).toISOString().split('T')[0];
                            const bufferClientDto = {
                                mobile: existingMobile,
                                availableDate,
                                session: existingClientUser.session,
                                tgId: existingClientUser.tgId,
                                channels: 170
                            };
                            const updatedBufferClient = await this.bufferClientService.createOrUpdate(existingMobile, bufferClientDto);
                            console.log("client Archived: ", updatedBufferClient);
                            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Client Archived`);
                        }
                        else {
                            console.log("Client Archive Skipped");
                            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Client Archive Skipped`);
                        }
                    }
                    catch (error) {
                        console.log("Cannot Archive Old Client");
                        const errorDetails = (0, parseError_1.parseError)(error, 'Error in Archiving Old Client', true);
                        if ((0, utils_1.contains)(errorDetails.message.toLowerCase(), ['expired', 'unregistered', 'deactivated', "session_revoked", "user_deactivated_ban"])) {
                            console.log("Deleting User: ", existingClientUser.mobile);
                            await this.bufferClientService.remove(existingClientUser.mobile);
                        }
                        else {
                            console.log('Not Deleting user');
                        }
                    }
                }
            }
            catch (error) {
                (0, parseError_1.parseError)(error, 'Error in Archiving Old Client outer', true);
                console.log("Error in Archiving Old Client");
            }
            this.telegramService.setActiveClientSetup(undefined);
            console.log("Update finished Exitting Exiiting TG Service");
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Update finished`);
            await connection_manager_1.connectionManager.disconnectAll();
        }
        catch (e) {
            (0, parseError_1.parseError)(e, 'Error in updating client session', true);
            this.telegramService.setActiveClientSetup(undefined);
        }
    }
    async updateClient(clientId, message = '') {
        console.log(`Updating Client: ${clientId} - ${message}`);
        const now = Date.now();
        const lastUpdate = this.lastUpdateMap.get(clientId) || 0;
        const cooldownPeriod = 30000;
        if (now - lastUpdate < cooldownPeriod) {
            console.log(`Skipping update for ${clientId} - cooldown period not elapsed. Try again in ${Math.ceil((cooldownPeriod - (now - lastUpdate)) / 1000)} seconds`);
            return;
        }
        const client = await this.findOne(clientId);
        try {
            this.lastUpdateMap.set(clientId, now);
            await cloudinary_1.CloudinaryService.getInstance(client?.dbcoll?.toLowerCase());
            const telegramClient = await connection_manager_1.connectionManager.getClient(client.mobile, { handler: false });
            await (0, Helpers_1.sleep)(2000);
            const me = await telegramClient.getMe();
            const rootPath = process.cwd();
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp1.jpg'));
            if (!me.username || me.username !== client.username || !me.username?.toLowerCase().startsWith(me.firstName.split(' ')[0].toLowerCase())) {
                const client = await this.findOne(clientId);
                const firstName = (client.name).split(' ')[0];
                const middleName = (client.name).split(' ')[1];
                const firstNameCaps = firstName[0].toUpperCase() + firstName.slice(1);
                const middleNameCaps = middleName ? middleName[0].toUpperCase() + middleName.slice(1) : '';
                const baseUsername = `${firstNameCaps.slice(0, 4)}${middleNameCaps.slice(0, 3)}` + (0, utils_1.fetchNumbersFromString)(clientId);
                const updatedUsername = await telegramClient.updateUsername(baseUsername);
                await this.update(client.clientId, { username: updatedUsername });
            }
            await (0, Helpers_1.sleep)(1000);
            if (me.firstName !== client.name) {
                await telegramClient.updateProfile(client.name, "Genuine Paid Girl🥰, Best Services❤️");
            }
            await (0, Helpers_1.sleep)(1000);
            await telegramClient.deleteProfilePhotos();
            await (0, Helpers_1.sleep)(1000);
            await telegramClient.updatePrivacy();
            await (0, Helpers_1.sleep)(1000);
            console.log(rootPath, "trying to update dp");
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp1.jpg'));
            await (0, Helpers_1.sleep)(1000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp2.jpg'));
            await (0, Helpers_1.sleep)(1000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp3.jpg'));
            await (0, Helpers_1.sleep)(1000);
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Updated Client: ${clientId} - ${message}`);
            await (0, fetchWithTimeout_1.fetchWithTimeout)(client.deployKey);
        }
        catch (error) {
            this.lastUpdateMap.delete(clientId);
            (0, parseError_1.parseError)(error);
        }
        finally {
            connection_manager_1.connectionManager.unregisterClient(client.mobile);
        }
    }
    async updateClients() {
        const clients = await this.findAll();
        for (const client of Object.values(clients)) {
            await this.updateClient(client.clientId, `Force Updating Client: ${client.clientId}`);
        }
    }
    async generateNewSession(phoneNumber, attempt = 1) {
        try {
            console.log("String Generation started");
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=String Generation started for NewNumber:${phoneNumber}`);
            await (0, Helpers_1.sleep)(1000);
            const response = await (0, fetchWithTimeout_1.fetchWithTimeout)(`${process.env.uptimebot}/login?phone=${phoneNumber}&force=${true}`, { timeout: 15000 }, 1);
            if (response) {
                console.log(`Code Sent successfully`, response.data);
                await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Code Sent successfully`);
                await this.bufferClientService.update(phoneNumber, { availableDate: (new Date(Date.now() + (24 * 60 * 60 * 1000))).toISOString().split('T')[0] });
            }
            else {
                await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Failed to send Code`);
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
    async addPromoteMobile(clientId, mobileNumber) {
        return this.clientModel.findOneAndUpdate({ clientId }, { $addToSet: { promoteMobile: mobileNumber } }, { new: true }).exec();
    }
    async removePromoteMobile(clientId, mobileNumber) {
        return this.clientModel.findOneAndUpdate({ clientId }, { $pull: { promoteMobile: mobileNumber } }, { new: true }).exec();
    }
};
exports.ClientService = ClientService;
exports.ClientService = ClientService = ClientService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(client_schema_1.Client.name)),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => Telegram_service_1.TelegramService))),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => buffer_client_service_1.BufferClientService))),
    __param(3, (0, common_1.Inject)((0, common_1.forwardRef)(() => users_service_1.UsersService))),
    __param(4, (0, common_1.Inject)((0, common_1.forwardRef)(() => archived_client_service_1.ArchivedClientService))),
    __param(5, (0, common_1.Inject)((0, common_1.forwardRef)(() => session_manager_1.SessionService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        Telegram_service_1.TelegramService,
        buffer_client_service_1.BufferClientService,
        users_service_1.UsersService,
        archived_client_service_1.ArchivedClientService,
        session_manager_1.SessionService,
        npoint_service_1.NpointService])
], ClientService);
//# sourceMappingURL=client.service.js.map