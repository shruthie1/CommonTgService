import { TelegramService } from './../Telegram/Telegram.service';
import { BadRequestException, Inject, Injectable, InternalServerErrorException, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Client, ClientDocument } from './schemas/client.schema';
import { CreateClientDto } from './dto/create-client.dto';
import { SetupClientQueryDto } from './dto/setup-client.dto';
import { BufferClientService } from '../buffer-clients/buffer-client.service';
import { sleep } from 'telegram/Helpers';
import { UsersService } from '../users/users.service';
import { ArchivedClientService } from '../archived-clients/archived-client.service';
import { fetchNumbersFromString, fetchWithTimeout, parseError, ppplbot, toBoolean } from '../../utils';
import { UpdateClientDto } from './dto/update-client.dto';
import { CreateBufferClientDto } from '../buffer-clients/dto/create-buffer-client.dto';
import { UpdateBufferClientDto } from '../buffer-clients/dto/update-buffer-client.dto';
import path from 'path';
let settingupClient = Date.now() - 250000;
@Injectable()
export class ClientService {
    private clientsMap: Map<string, Client> = new Map();
    constructor(@InjectModel(Client.name) private clientModel: Model<ClientDocument>,
        @Inject(forwardRef(() => TelegramService))
        private telegramService: TelegramService,
        @Inject(forwardRef(() => BufferClientService))
        private bufferClientService: BufferClientService,
        @Inject(forwardRef(() => UsersService))
        private usersService: UsersService,
        @Inject(forwardRef(() => ArchivedClientService))
        private archivedClientService: ArchivedClientService,
    ) { }

    async create(createClientDto: CreateClientDto): Promise<Client> {
        const createdUser = new this.clientModel(createClientDto);
        return createdUser.save();
    }

    async findAll(): Promise<Client[]> {
        const clientMapLength = this.clientsMap.size
        console.log(clientMapLength)
        if (clientMapLength < 3) {
            const results: Client[] = await this.clientModel.find({}).exec();
            for (const client of results) {
                this.clientsMap.set(client.clientId, client)
            }
            return results
        } else {
            return Array.from(this.clientsMap.values())
        }
    }

    async findOne(clientId: string): Promise<Client> {
        const client = this.clientsMap.get(clientId)
        if (client) {
            return client;
        } else {
            const user = await this.clientModel.findOne({ clientId }, { _id: 0 }).exec();
            this.clientsMap.set(clientId, user);
            if (!user) {
                throw new NotFoundException(`Client with ID "${clientId}" not found`);
            }
            return user;
        }
    }

    async update(clientId: string, updateClientDto: UpdateClientDto): Promise<Client> {
        delete updateClientDto['_id']
        const updatedUser = await this.clientModel.findOneAndUpdate({ clientId }, { $set: updateClientDto }, { new: true, upsert: true }).exec();
        if (!updatedUser) {
            throw new NotFoundException(`Client with ID "${clientId}" not found`);
        }
        this.clientsMap.set(clientId, updatedUser);
        await fetchWithTimeout(`${process.env.uptimeChecker}/refreshmap`);
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
        console.log(`Received New Client Request for - ${clientId}`)
        if (Date.now() > (settingupClient + 240000)) {
            settingupClient = Date.now();
            await fetchWithTimeout(`${ppplbot()}&text=Received New Client Request for - ${clientId}`);
            console.log(setupClientQueryDto);
            await this.telegramService.disconnectAll();
            try {
                const archiveOld = toBoolean(setupClientQueryDto.archiveOld);
                const existingClient = await this.findOne(clientId);
                const existingClientMobile = existingClient.mobile
                const today = (new Date(Date.now())).toISOString().split('T')[0];
                const existingClientUser = (await this.usersService.search({ mobile: existingClientMobile }))[0];
                try {
                    if (existingClientUser) {
                        await this.telegramService.createClient(existingClientMobile, false, true)
                        if (toBoolean(setupClientQueryDto.formalities)) {
                            console.log("Started Formalities")
                            await this.telegramService.updateUsername(existingClientMobile, '');
                            await sleep(2000)
                            await this.telegramService.updatePrivacyforDeletedAccount(existingClientMobile)
                            await sleep(2000)
                            await this.telegramService.deleteProfilePhotos(existingClientMobile)
                            console.log("Formalities finished")
                            await fetchWithTimeout(`${ppplbot()}&text=Formalities finished`);
                        } else {
                            console.log("Formalities skipped")
                        }
                        if (archiveOld) {
                            const availableDate = (new Date(Date.now() + (setupClientQueryDto.days * 24 * 60 * 60 * 1000))).toISOString().split('T')[0]
                            const bufferClientDto: CreateBufferClientDto | UpdateBufferClientDto = {
                                mobile: existingClientMobile,
                                createdDate: today,
                                updatedDate: today,
                                availableDate,
                                session: existingClientUser.session,
                                tgId: existingClientUser.tgId,
                                channels: 100
                            }
                            const updatedBufferClient = await this.bufferClientService.createOrUpdate(existingClientMobile, bufferClientDto);
                            await this.archivedClientService.update(existingClient.mobile, existingClient);
                            console.log("client Archived: ", updatedBufferClient)
                            await fetchWithTimeout(`${ppplbot()}&text=Client Archived`);
                        } else {
                            console.log("Client Archive Skipped")
                        }
                    }
                } catch (error) {
                    console.log("Cannot Archive Old Client");
                    parseError(error)
                }

                const query = { availableDate: { $lte: today } }
                const newBufferClient = (await this.bufferClientService.executeQuery(query))[0];
                try {
                    if (newBufferClient) {
                        this.telegramService.setActiveClientSetup({ mobile: newBufferClient.mobile, clientId })
                        await this.telegramService.createClient(newBufferClient.mobile, false, true);
                        const username = (clientId?.match(/[a-zA-Z]+/g)).toString();
                        const userCaps = username[0].toUpperCase() + username.slice(1);
                        const updatedUsername = await this.telegramService.updateUsername(newBufferClient.mobile, `${userCaps}_Redd`);
                        if (archiveOld) {
                            await this.telegramService.updateNameandBio(existingClientMobile, 'Deleted Account', `New Acc: @${updatedUsername}`);
                        }
                        console.log("client updated");
                    } else {
                        await fetchWithTimeout(`${ppplbot()}&text=Buffer Clients not available`);
                        console.log("Buffer Clients not available")
                    }
                    await this.bufferClientService.remove(newBufferClient.mobile);
                    const newClientMe = await this.telegramService.getMe(newBufferClient.mobile)
                    await this.telegramService.deleteClient(existingClientMobile);
                    const archivedClient = await this.archivedClientService.findOne(newBufferClient.mobile)
                    if (archivedClient) {
                        await this.updateClientSession(archivedClient.session, newClientMe.phone, newClientMe.username, clientId)
                    } else {
                        await this.generateNewSession(newBufferClient.mobile)
                    }
                } catch (error) {
                    console.log("Removing buffer as error")
                    const availableDate = (new Date(Date.now() + (3 * 24 * 60 * 60 * 1000))).toISOString().split('T')[0]
                    await this.bufferClientService.createOrUpdate(newBufferClient.mobile, { availableDate })
                }
            } catch (error) {
                parseError(error);
            }
        } else {
            console.log("Profile Setup Recently tried");
        }
    }

    async updateClientSession(session: string, mobile: string, userName: string, clientId: string) {
        console.log("Updating Client session");
        await fetchWithTimeout(`${ppplbot()}&text=Final Details Recived`);
        const newClient = await this.update(clientId, { session: session, mobile, userName, mainAccount: userName });
        if (fetchNumbersFromString(clientId) == '2') {
            const client2 = clientId.replace("1", "2")
            await this.update(client2, { mainAccount: userName });
        }
        console.log("Update finished");
        await fetchWithTimeout(`${ppplbot()}&text=Update finished`);
        await this.telegramService.disconnectAll();
        await fetchWithTimeout(newClient.deployKey);
        setTimeout(async () => {
            await this.updateClient(clientId);
        }, 10000);
    }

    async updateClient(clientId: string) {
        const client = await this.findOne(clientId);
        try {
            const telegramClient = await this.telegramService.createClient(client.mobile);
            // const userCaps = username[0].toUpperCase() + username.slice(1)
            // await client.updateUsername(`${userCaps}Redd`);
            await sleep(2000)
            await telegramClient.updateProfile(client.name, "Genuine Paid Girl🥰, Best Services❤️");
            await sleep(3000)
            await telegramClient.deleteProfilePhotos();
            await sleep(3000)
            await telegramClient.updatePrivacy();
            await sleep(3000)
            await telegramClient.updateProfilePic(path.join(__dirname, '../dp1.jpg'));
            await sleep(3000);
            await telegramClient.updateProfilePic(path.join(__dirname, '../dp2.jpg'));
            await sleep(3000);
            await telegramClient.updateProfilePic(path.join(__dirname, '../dp3.jpg'));
            await sleep(2000);
            await this.telegramService.deleteClient(client.mobile)
        } catch (error) {
            parseError(error)
        }
    }

    async generateNewSession(phoneNumber) {
        try {
            console.log("String Generation started");
            await fetchWithTimeout(`${ppplbot()}&text=String Generation started`);
            await sleep(1000);
            const response = await fetchWithTimeout(`https://tgsignup.onrender.com/login?phone=${phoneNumber}&force=${true}`, { timeout: 15000 }, 1);
            if (response) {
                console.log(`Code Sent successfully`, response.data);
                await fetchWithTimeout(`${ppplbot()}&text=Code Sent successfully`);
                // await fetchWithTimeout(`${ppplbot()}&text=${encodeURIComponent(`Code Sent successfully-${response}-${phoneNumber}`)}`);
            } else {
                await fetchWithTimeout(`${ppplbot()}&text=Failed to send Code`);
                console.log("Failed to send Code", response);
                await sleep(5000);
                await this.generateNewSession(phoneNumber);
            }
        } catch (error) {
            console.log(error)
        }
    }

    async executeQuery(query: any): Promise<any> {
        try {
            if (!query) {
                throw new BadRequestException('Query is invalid.');
            }
            return await this.clientModel.find(query).exec();
        } catch (error) {
            throw new InternalServerErrorException(error.message);
        }
    }
}
