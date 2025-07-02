import { TelegramService } from './../Telegram/Telegram.service';
import { BadRequestException, Inject, Injectable, InternalServerErrorException, Logger, NotFoundException, forwardRef, Query, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Client, ClientDocument } from './schemas/client.schema';
import { CreateClientDto } from './dto/create-client.dto';
import { SetupClientQueryDto } from './dto/setup-client.dto';
import { BufferClientService } from '../buffer-clients/buffer-client.service';
import { sleep } from 'telegram/Helpers';
import { UsersService } from '../users/users.service';
import { ArchivedClientService } from '../archived-clients/archived-client.service';
import { areJsonsNotSame, contains, fetchNumbersFromString, mapToJson, toBoolean } from '../../utils';
import { UpdateClientDto } from './dto/update-client.dto';
import { CreateBufferClientDto } from '../buffer-clients/dto/create-buffer-client.dto';
import { UpdateBufferClientDto } from '../buffer-clients/dto/update-buffer-client.dto';
import * as path from 'path';
import { CloudinaryService } from '../../cloudinary';
import { SearchClientDto } from './dto/search-client.dto';
import { NpointService } from '../n-point/npoint.service';
import { parseError } from '../../utils/parseError';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { notifbot } from '../../utils/logbots';
import { connectionManager } from '../Telegram/utils/connection-manager';
import { SessionService } from '../session-manager';
import { IpManagementService } from '../ip-management/ip-management.service';
import { PromoteClient, PromoteClientDocument } from '../promote-clients/schemas/promote-client.schema';

/**
 * Enhanced Client Service with IP Management Integration
 * 
 * This service now includes automated IP assignment for mobile numbers.
 * Each client's mobile and promote mobile numbers are automatically assigned
 * dedicated proxy IPs from the client's IP pool or global IP collection.
 */

let settingupClient = Date.now() - 250000;
@Injectable()
export class ClientService implements OnModuleDestroy {
    private readonly logger = new Logger(ClientService.name);
    private clientsMap: Map<string, Client> = new Map();
    private lastUpdateMap: Map<string, number> = new Map(); // Track last update times
    constructor(@InjectModel(Client.name) private clientModel: Model<ClientDocument>,
        @InjectModel(PromoteClient.name) private promoteClientModel: Model<PromoteClientDocument>,
        @Inject(forwardRef(() => TelegramService))
        private telegramService: TelegramService,
        @Inject(forwardRef(() => BufferClientService))
        private bufferClientService: BufferClientService,
        @Inject(forwardRef(() => UsersService))
        private usersService: UsersService,
        @Inject(forwardRef(() => ArchivedClientService))
        private archivedClientService: ArchivedClientService,
        @Inject(forwardRef(() => SessionService))
        private sessionService: SessionService,
        @Inject(forwardRef(() => IpManagementService))
        private ipManagementService: IpManagementService,
        private npointSerive: NpointService
    ) {
        setInterval(async () => {
            await this.refreshMap();
            await this.checkNpoint();
        }, 5 * 60 * 1000);
    }

    async onModuleDestroy() {
        console.log('Module is being Destroyed, Disconnecting all clients');
        await connectionManager.handleShutdown();
    }

    async checkNpoint() {
        const npointIdFull = "7c2682f37bb93ef486ba";
        const npointIdMasked = "f0d1e44d82893490bbde";
        const { data: npointMaskedClients } = await fetchWithTimeout(`https://api.npoint.io/${npointIdMasked}`);
        const existingMaskedClients = await this.findAllMaskedObject();
        if (areJsonsNotSame(npointMaskedClients, existingMaskedClients)) {
            await this.npointSerive.updateDocument(npointIdMasked, existingMaskedClients);
            console.log("Updated Masked Clients from Npoint");
        }
        const { data: npointClients } = await fetchWithTimeout(`https://api.npoint.io/${npointIdFull}`);
        const existingClients = await this.findAllObject();
        if (areJsonsNotSame(npointClients, existingClients)) {
            await this.npointSerive.updateDocument(npointIdFull, existingClients);
            console.log("Updated Full Clients from Npoint");
        }
    }

    async create(createClientDto: CreateClientDto): Promise<Client> {
        const createdUser = new this.clientModel(createClientDto);
        return createdUser.save();
    }

    async findAll(): Promise<Client[]> {
        this.logger.debug('Retrieving all client documents');
        try {
            if (this.clientsMap.size < 20) {
                const documents = await this.clientModel.find({}, { _id: 0, updatedAt: 0 }).lean().exec();
                documents.forEach(client => {
                    this.clientsMap.set(client.clientId, client);
                });
                this.logger.debug(`Successfully retrieved ${documents.length} client documents`);
                return Array.from(this.clientsMap.values());
            } else {
                this.logger.debug(`Retrieved ${this.clientsMap.size} clients from cache`);
                return Array.from(this.clientsMap.values());
            }
        } catch (error) {
            parseError(error, 'Failed to retrieve all clients: ', true);
            this.logger.error(`Failed to retrieve all clients: ${error.message}`, error.stack);
            throw error;
        }
    }

    async findAllMasked(): Promise<Partial<Client>[]> {
        const clients = await this.findAll();
        const maskedClients = clients.map(client => {
            const { session, mobile, password, ...maskedClient } = client;
            return { ...maskedClient };
        });
        return maskedClients;
    }

    async findAllObject(): Promise<Record<string, Client>> {
        this.logger.debug('Retrieving all client documents');
        try {
            if (this.clientsMap.size < 20) {
                const documents = await this.clientModel.find({}, { _id: 0, updatedAt: 0 }).lean().exec();
                const result = documents.reduce((acc, client) => {
                    this.clientsMap.set(client.clientId, client);
                    acc[client.clientId] = client;
                    return acc;
                }, {} as Record<string, Client>);

                this.logger.debug(`Successfully retrieved ${documents.length} client documents`);
                console.log("Refreshed Clients");
                return result;
            } else {
                const result = Array.from(this.clientsMap.entries()).reduce((acc, [clientId, client]) => {
                    acc[clientId] = client;
                    return acc;
                }, {} as Record<string, Client>);
                this.logger.debug(`Retrieved ${this.clientsMap.size} clients from cache`);
                return result;
            }
        } catch (error) {
            parseError(error, 'Failed to retrieve all clients: ', true);
            this.logger.error(`Failed to retrieve all clients: ${error.message}`, error.stack);
            throw error;
        }
    }

    async findAllMaskedObject(query?: SearchClientDto) {
        let filteredClients: Client[];

        if (query) {
            // Use the enhanced search functionality for consistent filtering
            const searchResult = await this.enhancedSearch(query);
            filteredClients = searchResult.clients;
        } else {
            const allClients = await this.findAll();
            filteredClients = Array.isArray(allClients) ? allClients : Object.values(allClients);
        }

        const results = filteredClients.reduce((acc, client) => {
            const { session, mobile, password, ...maskedClient } = client;
            acc[client.clientId] = { clientId: client.clientId, ...maskedClient };
            return acc;
        }, {});

        return results;
    }

    async refreshMap() {
        console.log("Refreshed Clients")
        // Mark the cache as invalidated to prevent race conditions
        const tempMap = new Map<string, Client>();
        this.clientsMap = tempMap;
    }

    async findOne(clientId: string, throwErr: boolean = true): Promise<Client> {
        const client = this.clientsMap.get(clientId)
        if (client) {
            return client;
        } else {
            const user = await this.clientModel.findOne({ clientId }, { _id: 0, updatedAt: 0 }).lean().exec();

            if (!user && throwErr) {
                throw new NotFoundException(`Client with ID "${clientId}" not found`);
            }

            // Only cache if user exists
            if (user) {
                this.clientsMap.set(clientId, user);
            }

            return user;
        }
    }

    async update(clientId: string, updateClientDto: UpdateClientDto): Promise<Client> {
        delete updateClientDto['_id']
        if ((<any>updateClientDto)._doc) {
            delete (<any>updateClientDto)._doc['_id']
        }

        const previousUser = await this.clientModel.findOne({ clientId }).lean().exec();
        await fetchWithTimeout(`${notifbot()}&text=Updating the Existing client: ${clientId}`);
        console.log("Previous Client Values:", previousUser);
        const updatedUser = await this.clientModel.findOneAndUpdate(
            { clientId },
            { $set: updateClientDto },
            { new: true, upsert: true }
        ).lean().exec();

        if (!updatedUser) {
            throw new NotFoundException(`Client with ID "${clientId}" not found`);
        }
        await this.checkNpoint();
        this.clientsMap.set(clientId, updatedUser);
        console.log("Updated Client Values:", updatedUser);
        await fetchWithTimeout(`${process.env.uptimeChecker}/refreshmap`);
        await fetchWithTimeout(`${process.env.uptimebot}/refreshmap`);
        console.log("Refreshed Maps")
        console.log("Updated Client: ", updatedUser);
        // Only trigger session creation if mobile or session has changed
        if (
            previousUser &&
            (previousUser.mobile !== updatedUser.mobile || previousUser.session !== updatedUser.session)
        ) {
            setTimeout(async () => {
                await this.sessionService.createSession({ mobile: updatedUser.mobile, password: 'Ajtdmwajt1@', maxRetries: 5 });
            }, 60000);
        }

        // Session creation for new promote mobiles is now handled by addPromoteMobile method
        return updatedUser;
    }

    async remove(clientId: string): Promise<Client> {
        const deletedUser = await this.clientModel.findOneAndDelete({ clientId }).exec();
        if (!deletedUser) {
            throw new NotFoundException(`Client with ID "${clientId}" not found`);
        }
        return deletedUser;
    }

    async search(filter: any): Promise<Client[]> {
        console.log('Original filter:', filter);

        // Handle special case: searching by promote mobile relationship
        if (filter.hasPromoteMobiles !== undefined) {
            const hasPromoteMobiles = filter.hasPromoteMobiles.toLowerCase() === 'true';
            delete filter.hasPromoteMobiles;

            if (hasPromoteMobiles) {
                // Find clients that have promote mobiles assigned
                const clientsWithPromoteMobiles = await this.promoteClientModel
                    .find({ clientId: { $exists: true } })
                    .distinct('clientId')
                    .lean();

                filter.clientId = { $in: clientsWithPromoteMobiles };
            } else {
                // Find clients that don't have promote mobiles assigned
                const clientsWithPromoteMobiles = await this.promoteClientModel
                    .find({ clientId: { $exists: true } })
                    .distinct('clientId')
                    .lean();

                filter.clientId = { $nin: clientsWithPromoteMobiles };
            }
        }

        // Handle text search fields with regex escaping
        if (filter.firstName) {
            const escapedFirstName = filter.firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filter.firstName = { $regex: new RegExp(escapedFirstName, 'i') };
        }

        // Handle case-insensitive name search with regex escaping
        if (filter.name) {
            const escapedName = filter.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filter.name = { $regex: new RegExp(escapedName, 'i') };
        }

        console.log('Final filter:', filter);
        return this.clientModel.find(filter).exec();
    }

    /**
     * Search for clients by promote mobile numbers
     * This replaces the old promoteMobile array search functionality
     */
    async searchClientsByPromoteMobile(mobileNumbers: string[]): Promise<Client[]> {
        // Find promote clients with these mobile numbers
        const promoteClients = await this.promoteClientModel
            .find({
                mobile: { $in: mobileNumbers },
                clientId: { $exists: true }
            })
            .lean();

        // Get unique client IDs
        const clientIds = [...new Set(promoteClients.map(pc => pc.clientId))];

        // Return the clients
        return this.clientModel.find({ clientId: { $in: clientIds } }).exec();
    }

    /**
     * Enhanced search with promote mobile support
     * Supports both direct client field search and promote mobile relationship search
     */
    async enhancedSearch(filter: any): Promise<{
        clients: Client[];
        searchType: 'direct' | 'promoteMobile' | 'mixed';
        promoteMobileMatches?: Array<{ clientId: string; mobile: string }>;
    }> {
        let searchType: 'direct' | 'promoteMobile' | 'mixed' = 'direct';
        let promoteMobileMatches: Array<{ clientId: string; mobile: string }> = [];

        // Check if we're searching by promote mobile
        if (filter.promoteMobileNumber) {
            searchType = 'promoteMobile';
            const mobileNumber = filter.promoteMobileNumber;
            delete filter.promoteMobileNumber;

            const promoteClients = await this.promoteClientModel
                .find({
                    mobile: { $regex: new RegExp(mobileNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
                    clientId: { $exists: true }
                })
                .lean();

            promoteMobileMatches = promoteClients.map(pc => ({
                clientId: pc.clientId,
                mobile: pc.mobile
            }));

            const clientIds = promoteClients.map(pc => pc.clientId);
            filter.clientId = { $in: clientIds };
        }

        // Apply regular search logic
        const clients = await this.search(filter);

        return {
            clients,
            searchType,
            promoteMobileMatches: promoteMobileMatches.length > 0 ? promoteMobileMatches : undefined
        };
    }

    async setupClient(clientId: string, setupClientQueryDto: SetupClientQueryDto) {
        console.log(`Received New Client Request for - ${clientId}`, settingupClient)
        if (toBoolean(process.env.AUTO_CLIENT_SETUP) && Date.now() > (settingupClient + 240000)) {
            settingupClient = Date.now();
            const existingClient = await this.findOne(clientId);
            const existingClientMobile = existingClient.mobile
            console.log("setupClientQueryDto:", setupClientQueryDto);
            const today = (new Date(Date.now())).toISOString().split('T')[0];
            const query = { availableDate: { $lte: today }, channels: { $gt: 200 } }
            const newBufferClient = (await this.bufferClientService.executeQuery(query, { tgId: 1 }))[0];
            if (newBufferClient) {
                try {
                    await fetchWithTimeout(`${notifbot()}&text=Received New Client Request for - ${clientId} - OldNumber: ${existingClient.mobile} || ${existingClient.username}`);
                    this.telegramService.setActiveClientSetup({ ...setupClientQueryDto, clientId, existingMobile: existingClientMobile, newMobile: newBufferClient.mobile })
                    await connectionManager.getClient(newBufferClient.mobile);
                    const newSession = await this.telegramService.createNewSession(newBufferClient.mobile);
                    await this.updateClientSession(newSession)
                    // const archivedClient = await this.archivedClientService.findOne(newBufferClient.mobile)
                    // if (archivedClient) {
                    //     await fetchWithTimeout(`${notifbot()}&text=Using Old Session from Archived Clients- NewNumber:${newBufferClient.mobile}`);
                    //     await this.updateClientSession(archivedClient.session)
                    // } else {
                    //     await connectionManager.getClientnewBufferClient.mobile, false, true);
                    //     await this.generateNewSession(newBufferClient.mobile)
                    // }
                } catch (error) {
                    parseError(error);
                    console.log("Removing buffer as error")
                    const availableDate = (new Date(Date.now() + (3 * 24 * 60 * 60 * 1000))).toISOString().split('T')[0]
                    await this.bufferClientService.createOrUpdate(newBufferClient.mobile, { availableDate });
                    this.telegramService.setActiveClientSetup(undefined)
                } finally {
                    await connectionManager.unregisterClient(newBufferClient.mobile)
                }
            } else {
                await fetchWithTimeout(`${notifbot()}&text=Buffer Clients not available. Requested by ${clientId}`);
                console.log("Buffer Clients not available")
            }
        } else {
            console.log("Profile Setup Recently tried, wait ::", settingupClient - Date.now());
        }
    }

    async updateClientSession(newSession: string) {
        try {
            let updatedUsername = '';
            console.log("Updating Client Session");
            const setup = this.telegramService.getActiveClientSetup();
            const { days, archiveOld, clientId, existingMobile, formalities, newMobile } = setup;
            await connectionManager.disconnectAll();
            await sleep(2000)
            const client = await this.findOne(clientId);
            await connectionManager.getClient(newMobile, { handler: true, autoDisconnect: false });
            const firstName = (client.name).split(' ')[0];
            const middleName = (client.name).split(' ')[1];
            const firstNameCaps = firstName[0].toUpperCase() + firstName.slice(1);
            const middleNameCaps = middleName ? middleName[0].toUpperCase() + middleName.slice(1) : '';
            const baseUsername = `${firstNameCaps.slice(0, 4)}${middleNameCaps.slice(0, 3)}` + fetchNumbersFromString(clientId);
            try {
                updatedUsername = await this.telegramService.updateUsername(newMobile, baseUsername);
            } catch (error) {
                parseError(error, 'Error in updating username', true);
            }
            await fetchWithTimeout(`${notifbot()}&text=Updated username for NewNumber:${newMobile} || ${updatedUsername}`);
            await connectionManager.unregisterClient(newMobile);
            const existingClientUser = (await this.usersService.search({ mobile: existingMobile }))[0];
            const existingClient = await this.findOne(clientId);
            await this.update(clientId, { mobile: newMobile, username: updatedUsername, session: newSession });
            await fetchWithTimeout(existingClient.deployKey, {}, 1);
            await this.bufferClientService.remove(newMobile);
            setTimeout(async () => {
                await this.updateClient(clientId, 'Delayed update after buffer removal');
            }, 15000);

            try {
                if (existingClientUser) {
                    try {
                        if (toBoolean(formalities)) {
                            await connectionManager.getClient(existingMobile, { handler: true, autoDisconnect: false });
                            console.log("Started Formalities");
                            await this.telegramService.updateNameandBio(existingMobile, 'Deleted Account', `New Acc: @${updatedUsername}`);
                            await this.telegramService.deleteProfilePhotos(existingMobile)
                            await this.telegramService.updateUsername(existingMobile, '');
                            await this.telegramService.updatePrivacyforDeletedAccount(existingMobile);
                            console.log("Formalities finished");
                            await connectionManager.unregisterClient(existingMobile);
                            await fetchWithTimeout(`${notifbot()}&text=Formalities finished`);
                        } else {
                            console.log("Formalities skipped")
                        }
                        if (archiveOld) {
                            const availableDate = (new Date(Date.now() + ((days + 1) * 24 * 60 * 60 * 1000))).toISOString().split('T')[0];
                            const bufferClientDto: CreateBufferClientDto | UpdateBufferClientDto = {
                                mobile: existingMobile,
                                availableDate,
                                session: existingClientUser.session,
                                tgId: existingClientUser.tgId,
                                channels: 170
                            }
                            const updatedBufferClient = await this.bufferClientService.createOrUpdate(existingMobile, bufferClientDto);
                            // await this.archivedClientService.update(existingMobile, existingClient);
                            console.log("client Archived: ", updatedBufferClient);
                            await fetchWithTimeout(`${notifbot()}&text=Client Archived`);
                        } else {
                            console.log("Client Archive Skipped")
                            await fetchWithTimeout(`${notifbot()}&text=Client Archive Skipped`);
                        }
                    } catch (error) {
                        console.log("Cannot Archive Old Client");
                        const errorDetails = parseError(error, 'Error in Archiving Old Client', true);
                        if (contains(errorDetails.message.toLowerCase(), ['expired', 'unregistered', 'deactivated', "session_revoked", "user_deactivated_ban"])) {
                            console.log("Deleting User: ", existingClientUser.mobile);
                            await this.bufferClientService.remove(existingClientUser.mobile);
                        } else {
                            console.log('Not Deleting user');
                        }
                    }
                }
            } catch (error) {
                parseError(error, 'Error in Archiving Old Client outer', true);
                console.log("Error in Archiving Old Client");
            }
            this.telegramService.setActiveClientSetup(undefined);
            console.log("Update finished Exitting Exiiting TG Service");
            await fetchWithTimeout(`${notifbot()}&text=Update finished`);
            await connectionManager.disconnectAll();
        } catch (e) {
            parseError(e, 'Error in updating client session', true);
            this.telegramService.setActiveClientSetup(undefined)
        }
    }

    async updateClient(clientId: string, message: string = '') {
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
            await CloudinaryService.getInstance(client?.dbcoll?.toLowerCase());
            const telegramClient = await connectionManager.getClient(client.mobile, { handler: false });
            await sleep(2000)
            const me = await telegramClient.getMe();
            const rootPath = process.cwd();
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp1.jpg'));
            if (!me.username || me.username !== client.username || !me.username?.toLowerCase().startsWith(me.firstName.split(' ')[0].toLowerCase())) {
                const client = await this.findOne(clientId);
                const firstName = (client.name).split(' ')[0];
                const middleName = (client.name).split(' ')[1];
                const firstNameCaps = firstName[0].toUpperCase() + firstName.slice(1);
                const middleNameCaps = middleName ? middleName[0].toUpperCase() + middleName.slice(1) : '';
                const baseUsername = `${firstNameCaps.slice(0, 4)}${middleNameCaps.slice(0, 3)}` + fetchNumbersFromString(clientId);
                const updatedUsername = await telegramClient.updateUsername(baseUsername);
                await this.update(client.clientId, { username: updatedUsername })
            }
            await sleep(1000)
            if (me.firstName !== client.name) {
                await telegramClient.updateProfile(client.name, "Genuine Paid Girl🥰, Best Services❤️");
            }
            await sleep(1000)
            await telegramClient.deleteProfilePhotos();
            await sleep(1000)
            await telegramClient.updatePrivacy();
            await sleep(1000)
            console.log(rootPath, "trying to update dp");
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp1.jpg'));
            await sleep(1000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp2.jpg'));
            await sleep(1000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp3.jpg'));
            await sleep(1000);
            await fetchWithTimeout(`${notifbot()}&text=Updated Client: ${clientId} - ${message}`);
            await fetchWithTimeout(client.deployKey);
        } catch (error) {
            this.lastUpdateMap.delete(clientId);
            parseError(error)
        } finally {
            connectionManager.unregisterClient(client.mobile);
        }
    }

    async updateClients() {
        const clients = await this.findAll();
        for (const client of Object.values(clients)) {
            await this.updateClient(client.clientId, `Force Updating Client: ${client.clientId}`);
        }
    }

    async generateNewSession(phoneNumber: string, attempt: number = 1) {
        try {
            console.log("String Generation started");
            await fetchWithTimeout(`${notifbot()}&text=String Generation started for NewNumber:${phoneNumber}`);
            await sleep(1000);
            const response = await fetchWithTimeout(`${process.env.uptimebot}/login?phone=${phoneNumber}&force=${true}`, { timeout: 15000 }, 1);
            if (response) {
                console.log(`Code Sent successfully`, response.data);
                await fetchWithTimeout(`${notifbot()}&text=Code Sent successfully`);
                await this.bufferClientService.update(phoneNumber, { availableDate: (new Date(Date.now() + (24 * 60 * 60 * 1000))).toISOString().split('T')[0] })
            } else {
                await fetchWithTimeout(`${notifbot()}&text=Failed to send Code`);
                console.log("Failed to send Code", response);
                if (attempt < 2) {
                    await sleep(8000);
                    await this.generateNewSession(phoneNumber, attempt + 1);
                }
            }
        } catch (error) {
            console.log(error);
            if (attempt < 2) {
                await sleep(8000);
                await this.generateNewSession(phoneNumber, attempt + 1);
            }
        }
    }

    async executeQuery(query: any, sort?: any, limit?: number, skip?: number): Promise<Client[]> {
        try {
            if (!query) {
                throw new BadRequestException('Query is invalid.');
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
        } catch (error) {
            throw new InternalServerErrorException(error.message);
        }
    }

    // ==================== PROMOTE MOBILE MANAGEMENT ====================

    /**
     * Get all promote mobiles for a client from PromoteClient collection
     */
    async getPromoteMobiles(clientId: string): Promise<string[]> {
        if (!clientId) {
            throw new BadRequestException('ClientId is required');
        }
        const promoteClients = await this.promoteClientModel.find({ clientId }).lean();
        return promoteClients.map(pc => pc.mobile).filter(mobile => mobile); // Filter out null/undefined mobiles
    }

    /**
     * Get all promote mobiles for all clients (utility for other services)
     */
    async getAllPromoteMobiles(): Promise<string[]> {
        const allPromoteClients = await this.promoteClientModel.find({ clientId: { $exists: true } }).lean();
        return allPromoteClients.map(pc => pc.mobile);
    }

    /**
     * Check if a mobile is a promote mobile for any client
     */
    async isPromoteMobile(mobile: string): Promise<{ isPromote: boolean; clientId?: string }> {
        const promoteClient = await this.promoteClientModel.findOne({ mobile }).lean();
        return {
            isPromote: !!promoteClient && !!promoteClient.clientId, // Only true if assigned to a client
            clientId: promoteClient?.clientId
        };
    }

    async addPromoteMobile(clientId: string, mobileNumber: string): Promise<Client> {
        // Verify client exists
        const client = await this.clientModel.findOne({ clientId }).lean();
        if (!client) {
            throw new NotFoundException(`Client ${clientId} not found`);
        }

        // Check if mobile is already a promote mobile for this or another client
        const existingPromoteClient = await this.promoteClientModel.findOne({ mobile: mobileNumber }).lean();
        if (existingPromoteClient) {
            if (existingPromoteClient.clientId === clientId) {
                throw new BadRequestException(`Mobile ${mobileNumber} is already a promote mobile for client ${clientId}`);
            } else if (existingPromoteClient.clientId) {
                throw new BadRequestException(`Mobile ${mobileNumber} is already assigned to client ${existingPromoteClient.clientId}`);
            } else {
                // Mobile exists but not assigned to any client, assign it to this client
                await this.promoteClientModel.updateOne(
                    { mobile: mobileNumber },
                    { $set: { clientId } }
                );
            }
        } else {
            throw new NotFoundException(`Mobile ${mobileNumber} not found in PromoteClient collection. Please add it first.`);
        }

        return client;
    }

    async removePromoteMobile(clientId: string, mobileNumber: string): Promise<Client> {
        // Verify client exists
        const client = await this.clientModel.findOne({ clientId }).lean();
        if (!client) {
            throw new NotFoundException(`Client ${clientId} not found`);
        }

        // Remove clientId from the PromoteClient document (making it unassigned)
        const result = await this.promoteClientModel.updateOne(
            { mobile: mobileNumber, clientId },
            { $unset: { clientId: 1 } }
        );

        if (result.matchedCount === 0) {
            throw new NotFoundException(`Mobile ${mobileNumber} is not a promote mobile for client ${clientId}`);
        }

        return client;
    }

    /**
     * Get IP address for a mobile number
     * This method uses the simplified IP management system (no mobileType needed)
     * @param mobile Mobile number to get IP for
     * @param clientId Optional client ID for context
     * @returns IP address string or null if none found/assigned
     */
    async getIpForMobile(mobile: string, clientId?: string): Promise<string | null> {
        if (!mobile) {
            throw new BadRequestException('Mobile number is required');
        }
        
        this.logger.debug(`Getting IP for mobile: ${mobile}${clientId ? ` (client: ${clientId})` : ''}`);

        try {
            // Use the simplified IP management service to get IP for mobile
            const ipAddress = await this.ipManagementService.getIpForMobile(mobile);

            if (ipAddress) {
                this.logger.debug(`Found IP for mobile ${mobile}: ${ipAddress}`);
                return ipAddress;
            }

            this.logger.debug(`No IP found for mobile ${mobile}`);
            return null;

        } catch (error) {
            this.logger.error(`Failed to get IP for mobile ${mobile}: ${error.message}`, error.stack);
            return null;
        }
    }

    /**
     * Check if a mobile number has an assigned IP
     * @param mobile Mobile number to check
     * @returns boolean indicating if IP is assigned
     */
    async hasMobileAssignedIp(mobile: string): Promise<boolean> {
        const ip = await this.getIpForMobile(mobile);
        return ip !== null;
    }

    /**
     * Get all mobile numbers (main + promote) for a client that need IP assignment
     * @param clientId Client ID
     * @returns Array of mobile numbers without IP assignments
     */
    async getMobilesNeedingIpAssignment(clientId: string): Promise<{
        mainMobile?: string;
        promoteMobiles: string[];
    }> {
        this.logger.debug(`Getting mobiles needing IP assignment for client: ${clientId}`);

        const client = await this.findOne(clientId);
        const result = {
            mainMobile: undefined as string | undefined,
            promoteMobiles: [] as string[]
        };

        // Check main mobile
        if (client.mobile && !(await this.hasMobileAssignedIp(client.mobile))) {
            result.mainMobile = client.mobile;
        }

        // Get promote mobiles from PromoteClient collection and check for IP assignment
        const promoteMobiles = await this.getPromoteMobiles(clientId);
        for (const mobile of promoteMobiles) {
            if (!(await this.hasMobileAssignedIp(mobile))) {
                result.promoteMobiles.push(mobile);
            }
        }

        this.logger.debug(`Mobiles needing IP assignment for client ${clientId}:`, result);
        return result;
    }

    /**
     * Auto-assign IPs to all mobile numbers for a client
     * Uses the simplified IP management system (no mobileType field needed)
     * @param clientId Client ID
     * @returns Assignment result summary
     */
    async autoAssignIpsToClient(clientId: string): Promise<{
        clientId: string;
        mainMobile: { mobile: string; ipAddress: string | null; status: string };
        promoteMobiles: Array<{ mobile: string; ipAddress: string | null; status: string }>;
        summary: {
            totalMobiles: number;
            assigned: number;
            failed: number;
            errors: string[];
        };
    }> {
        this.logger.debug(`Auto-assigning IPs to all mobiles for client: ${clientId}`);

        const client = await this.findOne(clientId);
        const errors: string[] = [];
        let assigned = 0;
        let failed = 0;

        // Handle main mobile - no mobileType needed in simplified system
        let mainMobileResult: { mobile: string; ipAddress: string | null; status: string };
        try {
            const mainMapping = await this.ipManagementService.assignIpToMobile({
                mobile: client.mobile,
                clientId: client.clientId
                // Note: No mobileType field - simplified!
            });
            mainMobileResult = {
                mobile: client.mobile,
                ipAddress: mainMapping.ipAddress,
                status: 'assigned'
            };
            assigned++;
        } catch (error) {
            mainMobileResult = {
                mobile: client.mobile,
                ipAddress: null,
                status: 'failed'
            };
            errors.push(`Main mobile ${client.mobile}: ${error.message}`);
            failed++;
        }

        // Handle promote mobiles - no mobileType needed in simplified system
        const promoteMobileResults: Array<{ mobile: string; ipAddress: string | null; status: string }> = [];

        // Get promote mobiles from PromoteClient collection
        const promoteMobiles = await this.getPromoteMobiles(clientId);
        for (const promoteMobile of promoteMobiles) {
            try {
                const promoteMapping = await this.ipManagementService.assignIpToMobile({
                    mobile: promoteMobile,
                    clientId: client.clientId
                    // Note: No mobileType field - simplified!
                });
                promoteMobileResults.push({
                    mobile: promoteMobile,
                    ipAddress: promoteMapping.ipAddress,
                    status: 'assigned'
                });
                assigned++;
            } catch (error) {
                promoteMobileResults.push({
                    mobile: promoteMobile,
                    ipAddress: null,
                    status: 'failed'
                });
                errors.push(`Promote mobile ${promoteMobile}: ${error.message}`);
                failed++;
            }
        }

        const totalMobiles = 1 + promoteMobiles.length;

        this.logger.log(`Auto-assignment completed for ${clientId}: ${assigned}/${totalMobiles} assigned`);

        return {
            clientId,
            mainMobile: mainMobileResult,
            promoteMobiles: promoteMobileResults,
            summary: {
                totalMobiles,
                assigned,
                failed,
                errors
            }
        };
    }

    /**
     * Get client IP information summary
     * Shows which mobiles have IPs and which don't
     * @param clientId Client ID
     * @returns Comprehensive IP summary for the client
     */
    async getClientIpInfo(clientId: string): Promise<{
        clientId: string;
        clientName: string;
        mainMobile: {
            mobile: string;
            ipAddress: string | null;
            hasIp: boolean;
        };
        promoteMobiles: Array<{
            mobile: string;
            ipAddress: string | null;
            hasIp: boolean;
        }>;
        dedicatedIps: string[];
        summary: {
            totalMobiles: number;
            mobilesWithIp: number;
            mobilesWithoutIp: number;
        };
    }> {
        this.logger.debug(`Getting IP info for client: ${clientId}`);

        const client = await this.findOne(clientId);

        // Get IP for main mobile
        const mainMobileIp = await this.getIpForMobile(client.mobile, clientId);
        const mainMobile = {
            mobile: client.mobile,
            ipAddress: mainMobileIp,
            hasIp: mainMobileIp !== null
        };

        // Get IPs for promote mobiles
        const promoteMobiles = [];
        let mobilesWithIp = mainMobile.hasIp ? 1 : 0;

        // Get promote mobiles from PromoteClient collection
        const clientPromoteMobiles = await this.getPromoteMobiles(clientId);
        for (const mobile of clientPromoteMobiles) {
            const ip = await this.getIpForMobile(mobile, clientId);
            const hasIp = ip !== null;

            promoteMobiles.push({
                mobile,
                ipAddress: ip,
                hasIp
            });

            if (hasIp) mobilesWithIp++;
        }

        const totalMobiles = 1 + clientPromoteMobiles.length;
        const mobilesWithoutIp = totalMobiles - mobilesWithIp;

        return {
            clientId,
            clientName: client.name,
            mainMobile,
            promoteMobiles,
            dedicatedIps: client.dedicatedIps || [],
            summary: {
                totalMobiles,
                mobilesWithIp,
                mobilesWithoutIp
            }
        };
    }

    /**
     * Release IP from a mobile number
     * @param mobile Mobile number to release IP from
     * @returns Success status
     */
    async releaseIpFromMobile(mobile: string): Promise<{ success: boolean; message: string }> {
        this.logger.debug(`Releasing IP from mobile: ${mobile}`);

        try {
            await this.ipManagementService.releaseIpFromMobile({ mobile });

            this.logger.log(`Successfully released IP from mobile: ${mobile}`);
            return {
                success: true,
                message: `IP released from mobile ${mobile}`
            };
        } catch (error) {
            this.logger.error(`Failed to release IP from mobile ${mobile}: ${error.message}`, error.stack);
            return {
                success: false,
                message: `Failed to release IP: ${error.message}`
            };
        }
    }

    // ==================== DATA MIGRATION METHODS ====================

    /**
     * Migrate existing promoteMobile arrays to PromoteClient.clientId references
     * This method safely migrates data from the old array-based structure to the new reference-based structure
     */
    async migratePromoteMobilesToClientId(): Promise<{
        success: boolean;
        message: string;
        results: {
            totalClients: number;
            clientsWithPromoteMobiles: number;
            mobilesProcessed: number;
            mobilesUpdated: number;
            mobilesCreated: number;
            errors: Array<{ clientId: string; mobile: string; error: string }>;
            backupCollection: string;
        };
    }> {
        this.logger.log('🚀 Starting promote mobile migration...');

        const results = {
            totalClients: 0,
            clientsWithPromoteMobiles: 0,
            mobilesProcessed: 0,
            mobilesUpdated: 0,
            mobilesCreated: 0,
            errors: [] as Array<{ clientId: string; mobile: string; error: string }>,
            backupCollection: ''
        };

        try {
            // Create backup of current clients data
            const backupCollectionName = `clients_backup_${Date.now()}`;
            results.backupCollection = backupCollectionName;

            // Get all clients with promoteMobile arrays (using any to handle legacy data)
            const allClients = await this.clientModel.find().lean() as any[];
            results.totalClients = allClients.length;

            // Filter clients that have promoteMobile arrays
            const clientsWithPromoteMobiles = allClients.filter((client: any) =>
                client.promoteMobile &&
                Array.isArray(client.promoteMobile) &&
                client.promoteMobile.length > 0
            );
            results.clientsWithPromoteMobiles = clientsWithPromoteMobiles.length;

            this.logger.log(`📊 Found ${clientsWithPromoteMobiles.length} clients with promote mobiles out of ${allClients.length} total clients`);

            if (clientsWithPromoteMobiles.length === 0) {
                return {
                    success: true,
                    message: 'No clients with promoteMobile arrays found. Migration not needed.',
                    results
                };
            }

            // Create backup (only clients with promoteMobile data)
            await this.clientModel.db.collection(backupCollectionName).insertMany(clientsWithPromoteMobiles);
            this.logger.log(`💾 Backup created: ${backupCollectionName}`);

            // Process each client's promote mobiles
            for (const client of clientsWithPromoteMobiles) {
                this.logger.debug(`📱 Processing client: ${client.clientId} (${client.name})`);
                this.logger.debug(`   Promote mobiles: ${(client.promoteMobile as string[]).join(', ')}`);

                for (const mobile of (client.promoteMobile as string[])) {
                    try {
                        results.mobilesProcessed++;

                        // Check if PromoteClient document exists for this mobile
                        const existingPromoteClient = await this.promoteClientModel.findOne({ mobile }).lean();

                        if (existingPromoteClient) {
                            // Update existing document to add/update clientId
                            if (existingPromoteClient.clientId !== client.clientId) {
                                await this.promoteClientModel.updateOne(
                                    { mobile },
                                    { $set: { clientId: client.clientId } }
                                );
                                results.mobilesUpdated++;
                                this.logger.debug(`   ✅ Updated ${mobile} with clientId: ${client.clientId}`);
                            } else {
                                this.logger.debug(`   ⚠️  ${mobile} already has correct clientId: ${client.clientId}`);
                            }
                        } else {
                            // Create new PromoteClient document
                            // We need some default values since the promote client doesn't exist
                            const newPromoteClient = {
                                mobile,
                                clientId: client.clientId,
                                tgId: `migrated_${mobile}`, // Placeholder - will need to be updated manually
                                lastActive: new Date().toISOString().split('T')[0],
                                availableDate: new Date().toISOString().split('T')[0],
                                channels: 0 // Default value
                            };

                            await this.promoteClientModel.create(newPromoteClient);
                            results.mobilesCreated++;
                            this.logger.debug(`   🆕 Created PromoteClient for ${mobile} with clientId: ${client.clientId}`);
                            this.logger.debug(`   ⚠️  Note: Created with placeholder data - please update tgId, lastActive, and channels manually`);
                        }

                    } catch (mobileError) {
                        const errorMsg = `Error processing mobile ${mobile}: ${mobileError.message}`;
                        this.logger.error(`   ❌ ${errorMsg}`);
                        results.errors.push({
                            clientId: client.clientId,
                            mobile,
                            error: errorMsg
                        });
                    }
                }
            }

            // Log summary
            this.logger.log('\n📊 Migration Summary:');
            this.logger.log(`   ✅ Mobiles processed: ${results.mobilesProcessed}`);
            this.logger.log(`   🔄 Existing mobiles updated: ${results.mobilesUpdated}`);
            this.logger.log(`   🆕 New PromoteClient documents created: ${results.mobilesCreated}`);
            this.logger.log(`   ❌ Errors encountered: ${results.errors.length}`);
            this.logger.log(`   💾 Backup collection: ${results.backupCollection}`);

            if (results.errors.length > 0) {
                this.logger.warn('⚠️  Some errors occurred during migration:');
                results.errors.forEach(error => {
                    this.logger.warn(`   - Client ${error.clientId}, Mobile ${error.mobile}: ${error.error}`);
                });
            }

            // CRITICAL: Remove old promoteMobile field from clients after successful migration
            this.logger.log('🧹 Cleaning up old promoteMobile fields...');
            const cleanupResult = await this.clientModel.updateMany(
                { promoteMobile: { $exists: true } },
                { $unset: { promoteMobile: '' } }
            );

            this.logger.log(`   ✅ Removed promoteMobile field from ${cleanupResult.modifiedCount} clients`);

            const successMessage = `Migration completed successfully! ` +
                `Processed ${results.mobilesProcessed} promote mobiles from ${results.clientsWithPromoteMobiles} clients. ` +
                `Updated ${results.mobilesUpdated} existing and created ${results.mobilesCreated} new PromoteClient documents. ` +
                `Cleaned up promoteMobile field from ${cleanupResult.modifiedCount} clients.`;

            this.logger.log(`🎉 ${successMessage}`);

            return {
                success: true,
                message: successMessage,
                results
            };

        } catch (error) {
            const errorMessage = `Migration failed: ${error.message}`;
            this.logger.error(`💥 ${errorMessage}`, error.stack);

            return {
                success: false,
                message: errorMessage,
                results
            };
        }
    }

    /**
     * Verify the migration by checking data consistency
     */
    async verifyPromoteMobileMigration(): Promise<{
        success: boolean;
        message: string;
        verification: {
            totalClientsWithPromoteMobile: number;
            totalPromoteClientsWithClientId: number;
            totalPromoteClientsWithoutClientId: number;
            consistencyIssues: Array<{
                issue: string;
                clientId?: string;
                mobile?: string;
                details: string;
            }>;
        };
    }> {
        this.logger.log('🔍 Verifying promote mobile migration...');

        try {
            const verification = {
                totalClientsWithPromoteMobile: 0,
                totalPromoteClientsWithClientId: 0,
                totalPromoteClientsWithoutClientId: 0,
                consistencyIssues: [] as Array<{
                    issue: string;
                    clientId?: string;
                    mobile?: string;
                    details: string;
                }>
            };

            // Count clients that still have promoteMobile arrays
            const clientsWithPromoteMobile = await this.clientModel.countDocuments({
                promoteMobile: { $exists: true, $type: 'array', $not: { $size: 0 } }
            });
            verification.totalClientsWithPromoteMobile = clientsWithPromoteMobile;

            // Count PromoteClient documents with and without clientId
            const promoteClientsWithClientId = await this.promoteClientModel.countDocuments({
                clientId: { $exists: true }
            });
            verification.totalPromoteClientsWithClientId = promoteClientsWithClientId;

            const promoteClientsWithoutClientId = await this.promoteClientModel.countDocuments({
                clientId: { $exists: false }
            });
            verification.totalPromoteClientsWithoutClientId = promoteClientsWithoutClientId;

            // Check for consistency issues
            if (clientsWithPromoteMobile > 0) {
                verification.consistencyIssues.push({
                    issue: 'clients_still_have_promote_mobile_arrays',
                    details: `${clientsWithPromoteMobile} clients still have promoteMobile arrays. Migration may not be complete.`
                });
            }

            if (promoteClientsWithoutClientId > 0) {
                verification.consistencyIssues.push({
                    issue: 'promote_clients_without_client_id',
                    details: `${promoteClientsWithoutClientId} PromoteClient documents don't have clientId assigned. These may be unassigned promote clients.`
                });
            }

            // Check for orphaned references (PromoteClients with clientId that don't exist)
            const promoteClientsWithClientIds = await this.promoteClientModel.find({
                clientId: { $exists: true }
            }).lean();

            const allClientIds = new Set((await this.clientModel.find().lean()).map(c => c.clientId));

            for (const promoteClient of promoteClientsWithClientIds) {
                if (!allClientIds.has(promoteClient.clientId)) {
                    verification.consistencyIssues.push({
                        issue: 'orphaned_promote_client',
                        mobile: promoteClient.mobile,
                        clientId: promoteClient.clientId,
                        details: `PromoteClient ${promoteClient.mobile} references non-existent client ${promoteClient.clientId}`
                    });
                }
            }

            let message: string;
            let success: boolean;

            if (verification.consistencyIssues.length === 0) {
                message = `✅ Migration verification passed! All ${promoteClientsWithClientId} PromoteClient documents have valid clientId assignments.`;
                success = true;
            } else {
                message = `⚠️  Migration verification found ${verification.consistencyIssues.length} consistency issues that may need attention.`;
                success = false;
            }

            this.logger.log(message);

            if (verification.consistencyIssues.length > 0) {
                this.logger.warn('Consistency issues found:');
                verification.consistencyIssues.forEach(issue => {
                    this.logger.warn(`  - ${issue.issue}: ${issue.details}`);
                });
            }

            return {
                success,
                message,
                verification
            };

        } catch (error) {
            const errorMessage = `Verification failed: ${error.message}`;
            this.logger.error(errorMessage, error.stack);

            return {
                success: false,
                message: errorMessage,
                verification: {
                    totalClientsWithPromoteMobile: 0,
                    totalPromoteClientsWithClientId: 0,
                    totalPromoteClientsWithoutClientId: 0,
                    consistencyIssues: [{
                        issue: 'verification_error',
                        details: error.message
                    }]
                }
            };
        }
    }

    /**
     * Rollback migration using backup (emergency use only)
     */
    async rollbackPromoteMobileMigration(backupCollectionName: string): Promise<{
        success: boolean;
        message: string;
        restored: number;
    }> {
        this.logger.warn(`🔄 Rolling back migration using backup: ${backupCollectionName}`);

        try {
            // Get backup data
            const backupData = await this.clientModel.db.collection(backupCollectionName).find().toArray();

            if (backupData.length === 0) {
                throw new Error(`Backup collection ${backupCollectionName} is empty or doesn't exist`);
            }

            let restored = 0;

            // Restore promoteMobile arrays for each client
            for (const backupClient of backupData) {
                await this.clientModel.updateOne(
                    { clientId: backupClient.clientId },
                    { $set: { promoteMobile: backupClient.promoteMobile } }
                );

                // Remove clientId from PromoteClient documents for this client
                if (backupClient.promoteMobile && Array.isArray(backupClient.promoteMobile)) {
                    for (const mobile of backupClient.promoteMobile) {
                        await this.promoteClientModel.updateOne(
                            { mobile },
                            { $unset: { clientId: 1 } }
                        );
                    }
                }

                restored++;
            }

            const message = `✅ Rollback completed! Restored ${restored} clients to original state.`;
            this.logger.log(message);

            return {
                success: true,
                message,
                restored
            };

        } catch (error) {
            const errorMessage = `❌ Rollback failed: ${error.message}`;
            this.logger.error(errorMessage, error.stack);

            return {
                success: false,
                message: errorMessage,
                restored: 0
            };
        }
    }

    /**
     * Check the status of promote mobile migration
     */
    async checkPromoteMobileMigrationStatus(): Promise<{
        isLegacyData: boolean;
        legacyClientsCount: number;
        modernClientsCount: number;
        totalPromoteClients: number;
        recommendations: string[];
    }> {
        this.logger.log('🔍 Checking promote mobile migration status...');

        try {
            // Check for clients with legacy promoteMobile arrays
            const allClients = await this.clientModel.find().lean() as any[];
            const legacyClients = allClients.filter((client: any) =>
                client.promoteMobile &&
                Array.isArray(client.promoteMobile) &&
                client.promoteMobile.length > 0
            );

            // Count promote clients with clientId (modern approach)
            const modernPromoteClients = await this.promoteClientModel.countDocuments({
                clientId: { $exists: true, $ne: null }
            });

            // Total promote clients
            const totalPromoteClients = await this.promoteClientModel.countDocuments();

            const isLegacyData = legacyClients.length > 0;
            const recommendations: string[] = [];

            if (isLegacyData) {
                recommendations.push(`🔄 Migration needed: ${legacyClients.length} clients still use legacy array storage`);
                recommendations.push('📦 Run migratePromoteMobilesToClientId() to migrate data');
                recommendations.push('✅ Run verifyPromoteMobileMigration() after migration to verify');
            } else {
                recommendations.push('✅ All clients are using modern reference-based storage');
                if (modernPromoteClients === 0) {
                    recommendations.push('ℹ️ No promote mobile relationships found');
                } else {
                    recommendations.push(`📊 ${modernPromoteClients} promote mobile relationships are properly configured`);
                }
            }

            const status = {
                isLegacyData,
                legacyClientsCount: legacyClients.length,
                modernClientsCount: modernPromoteClients,
                totalPromoteClients,
                recommendations
            };

            this.logger.log(`📋 Migration Status: ${JSON.stringify(status, null, 2)}`);
            return status;

        } catch (error) {
            this.logger.error('❌ Error checking migration status:', error.stack);
            throw error;
        }
    }
}
