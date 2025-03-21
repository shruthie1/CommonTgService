import { TelegramService } from './../Telegram/Telegram.service';
import { BadRequestException, Inject, Injectable, InternalServerErrorException, NotFoundException, forwardRef, Query } from '@nestjs/common';
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
import axios from 'axios';
import { parseError } from '../../utils/parseError';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { notifbot } from '../../utils/logbots';
import { connectionManager } from '../Telegram/utils/connection-manager';

let settingupClient = Date.now() - 250000;
@Injectable()
export class ClientService {
    private clientsMap: Map<string, Client> = new Map();
    private lastUpdateMap: Map<string, number> = new Map(); // Track last update times
    constructor(@InjectModel(Client.name) private clientModel: Model<ClientDocument>,
        @Inject(forwardRef(() => TelegramService))
        private telegramService: TelegramService,
        @Inject(forwardRef(() => BufferClientService))
        private bufferClientService: BufferClientService,
        @Inject(forwardRef(() => UsersService))
        private usersService: UsersService,
        @Inject(forwardRef(() => ArchivedClientService))
        private archivedClientService: ArchivedClientService,
        private npointSerive: NpointService
    ) {
        setInterval(async () => {
            await this.refreshMap();
        }, 5 * 60 * 1000);
    }

    async checkNpoint() {
        const clients = (await axios.get('https://api.npoint.io/7c2682f37bb93ef486ba')).data;
        for (const client in clients) {
            const existingClient = await this.findOne(client, false);
            if (areJsonsNotSame(existingClient, clients[client])) {
                await this.findAll();
                const clientData = mapToJson(this.clientsMap)
                await this.npointSerive.updateDocument("7c2682f37bb93ef486ba", clientData)
                const maskedCls = {};
                for (const client in clientData) {
                    const { session, mobile, password, promoteMobile, ...maskedClient } = clientData[client];
                    maskedCls[client] = maskedClient
                }
                await this.npointSerive.updateDocument("f0d1e44d82893490bbde", maskedCls)
                break;
            }
        }
    }

    async create(createClientDto: CreateClientDto): Promise<Client> {
        const createdUser = new this.clientModel(createClientDto);
        return createdUser.save();
    }

    async findAll(): Promise<Client[]> {
        const clientMapLength = this.clientsMap.size
        if (clientMapLength < 20) {
            const results: Client[] = await this.clientModel.find({}, { _id: 0, updatedAt: 0 }).lean()
            for (const client of results) {
                this.clientsMap.set(client.clientId, client)
            }
            console.log("Refreshed Clients")
            return results
        } else {
            return Array.from(this.clientsMap.values())
        }
    }

    async findAllMasked(query?: SearchClientDto) {
        const allClients = await this.findAll()
        const filteredClients = query
            ? allClients.filter(client => {
                return Object.keys(query).every(key => client[key] === query[key]);
            })
            : allClients;
        const results = filteredClients.map(client => {
            const { session, mobile, password, promoteMobile, ...maskedClient } = client;
            return maskedClient;
        });
        return results;
    }

    async refreshMap() {
        console.log("Refreshed Clients")
        this.clientsMap.clear();
    }

    async findOne(clientId: string, throwErr: boolean = true): Promise<Client> {
        const client = this.clientsMap.get(clientId)
        if (client) {
            return client;
        } else {
            const user = await this.clientModel.findOne({ clientId }, { _id: 0, updatedAt: 0 }).lean().exec();
            this.clientsMap.set(clientId, user);
            if (!user && throwErr) {
                throw new NotFoundException(`Client with ID "${clientId}" not found`);
            }
            return user;
        }
    }

    async update(clientId: string, updateClientDto: UpdateClientDto): Promise<Client> {
        delete updateClientDto['_id']
        if ((<any>updateClientDto)._doc) {
            delete (<any>updateClientDto)._doc['_id']
        }
        await fetchWithTimeout(`${notifbot()}&text=Updating the Existing client: ${clientId}`);
        const updatedUser = await this.clientModel.findOneAndUpdate({ clientId }, { $set: updateClientDto }, { new: true, upsert: true }).exec();
        if (!updatedUser) {
            throw new NotFoundException(`Client with ID "${clientId}" not found`);
        }
        this.clientsMap.set(clientId, updatedUser);
        await fetchWithTimeout(`${process.env.uptimeChecker}/refreshmap`);
        await fetchWithTimeout(`${process.env.uptimebot}/refreshmap`);
        console.log("Refreshed Maps")
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
        console.log(filter)
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') }
        }
        console.log(filter)
        return this.clientModel.find(filter).exec();
    }

    async setupClient(clientId: string, setupClientQueryDto: SetupClientQueryDto) {
        console.log(`Received New Client Request for - ${clientId}`, settingupClient)
        if (toBoolean(process.env.AUTO_CLIENT_SETUP) && Date.now() > (settingupClient + 240000)) {
            settingupClient = Date.now();
            const existingClient = await this.findOne(clientId);
            const existingClientMobile = existingClient.mobile
            await fetchWithTimeout(`${notifbot()}&text=Received New Client Request for - ${clientId} - OldNumber: ${existingClient.mobile} || ${existingClient.username}`);
            console.log(setupClientQueryDto);
            await connectionManager.disconnectAll();
            const today = (new Date(Date.now())).toISOString().split('T')[0];
            const query = { availableDate: { $lte: today }, channels: { $gt: 200 } }
            const newBufferClient = (await this.bufferClientService.executeQuery(query, { tgId: 1 }))[0];
            try {
                if (newBufferClient) {
                    this.telegramService.setActiveClientSetup({ ...setupClientQueryDto, clientId, existingMobile: existingClientMobile, newMobile: newBufferClient.mobile })
                    await connectionManager.getClient(newBufferClient.mobile);
                    const newSession = await this.telegramService.createNewSession(newBufferClient.mobile);
                    await this.updateClientSession(newSession)
                } else {
                    await fetchWithTimeout(`${notifbot()}&text=Buffer Clients not available`);
                    console.log("Buffer Clients not available")
                }

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
            const baseUsername = `${firstNameCaps}_${middleNameCaps.slice(0, 3)}` + fetchNumbersFromString(clientId);
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
                await this.updateClient(clientId);
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
                            await this.archivedClientService.remove(existingClientUser.mobile);
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

    async updateClient(clientId: string) {
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
            if (!me.username || me.username !== client.username || !me.username?.toLowerCase().startsWith(me.firstName.split(' ')[0].toLowerCase())) {
                const client = await this.findOne(clientId);
                const firstName = (client.name).split(' ')[0];
                const middleName = (client.name).split(' ')[1];
                const firstNameCaps = firstName[0].toUpperCase() + firstName.slice(1);
                const middleNameCaps = middleName ? middleName[0].toUpperCase() + middleName.slice(1) : '';
                const baseUsername = `${firstNameCaps}_${middleNameCaps.slice(0, 3)}` + fetchNumbersFromString(clientId);
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
            const rootPath = process.cwd();
            console.log(rootPath, "trying to update dp");
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp1.jpg'));
            await sleep(1000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp2.jpg'));
            await sleep(1000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp3.jpg'));
            await sleep(1000);
        } catch (error) {
            this.lastUpdateMap.delete(clientId);
            parseError(error)
        } finally {
            connectionManager.unregisterClient(client.mobile);
        }
    }

    async updateClients() {
        const clients = await this.findAll();
        for (const client of clients) {
            await this.updateClient(client.clientId)
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

    async addPromoteMobile(clientId: string, mobileNumber: string): Promise<Client> {
        return this.clientModel.findOneAndUpdate(
            { clientId }, // Filter by clientId
            { $addToSet: { promoteMobile: mobileNumber } }, // Add only if it doesn't already exist
            { new: true } // Return the updated document
        ).exec();
    }

    async removePromoteMobile(clientId: string, mobileNumber: string): Promise<Client> {
        return this.clientModel.findOneAndUpdate(
            { clientId }, // Filter by clientId
            { $pull: { promoteMobile: mobileNumber } }, // Remove the specified number
            { new: true } // Return the updated document
        ).exec();
    }
}
