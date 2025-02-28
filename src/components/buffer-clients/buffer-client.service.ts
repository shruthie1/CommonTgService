import { ChannelsService } from './../channels/channels.service';
import { Channel } from './../channels/schemas/channel.schema';
import { BadRequestException, ConflictException, HttpException, Inject, Injectable, InternalServerErrorException, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateBufferClientDto } from './dto/create-buffer-client.dto';
import { BufferClient, BufferClientDocument } from './schemas/buffer-client.schema';
import { TelegramService } from '../Telegram/Telegram.service';
import { sleep } from 'telegram/Helpers';
import { UsersService } from '../users/users.service';
import { ActiveChannelsService } from '../active-channels/active-channels.service';
import { ClientService } from '../clients/client.service';
import { UpdateBufferClientDto } from './dto/update-buffer-client.dto';
import { PromoteClientService } from '../promote-clients/promote-client.service';
import { parseError } from '../../utils/parseError';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { notifbot } from '../../utils/logbots';
@Injectable()
export class BufferClientService {
    private joinChannelMap: Map<string, Channel[]> = new Map();
    private joinChannelIntervalId: NodeJS.Timeout;
    constructor(@InjectModel('bufferClientModule') private bufferClientModel: Model<BufferClientDocument>,
        @Inject(forwardRef(() => TelegramService))
        private telegramService: TelegramService,
        @Inject(forwardRef(() => UsersService))
        private usersService: UsersService,
        @Inject(forwardRef(() => ActiveChannelsService))
        private activeChannelsService: ActiveChannelsService,
        @Inject(forwardRef(() => ClientService))
        private clientService: ClientService,
        @Inject(forwardRef(() => ActiveChannelsService))
        private channelsService: ChannelsService,
        @Inject(forwardRef(() => PromoteClientService))
        private promoteClientService: PromoteClientService,
    ) {}

    async create(bufferClient: CreateBufferClientDto): Promise<BufferClient> {
        const newUser = new this.bufferClientModel(bufferClient);
        return newUser.save();
    }

    async findAll(): Promise<BufferClient[]> {
        return this.bufferClientModel.find().exec();
    }

    async findOne(mobile: string, throwErr: boolean = true): Promise<BufferClient> {
        const user = (await this.bufferClientModel.findOne({ mobile }).exec())?.toJSON();
        if (!user && throwErr) {
            throw new NotFoundException(`BufferClient with mobile ${mobile} not found`);
        }
        return user;
    }


    async update(mobile: string, updateClientDto: UpdateBufferClientDto): Promise<BufferClient> {
        const updatedUser = await this.bufferClientModel.findOneAndUpdate(
            { mobile },
            { $set: updateClientDto },
            { new: true, upsert: true, returnDocument: 'after' }
        ).exec();

        if (!updatedUser) {
            throw new NotFoundException(`User with mobile ${mobile} not found`);
        }

        return updatedUser;
    }

    async createOrUpdate(mobile: string, createOrUpdateUserDto: CreateBufferClientDto | UpdateBufferClientDto): Promise<BufferClient> {
        const existingUser = (await this.bufferClientModel.findOne({ mobile }).exec())?.toJSON();
        if (existingUser) {
            console.log("Updating")
            return this.update(existingUser.mobile, createOrUpdateUserDto as UpdateBufferClientDto);
        } else {
            console.log("creating")
            return this.create(createOrUpdateUserDto as CreateBufferClientDto);
        }
    }

    async remove(mobile: string): Promise<void> {
        await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`Deleting Buffer Client : ${mobile}`)}`);
        const result = await this.bufferClientModel.deleteOne({ mobile }).exec();
        if (result.deletedCount === 0) {
            throw new NotFoundException(`BufferClient with mobile ${mobile} not found`);
        }
    }
    async search(filter: any): Promise<BufferClient[]> {
        console.log(filter)
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') }
        }
        console.log(filter)
        return this.bufferClientModel.find(filter).exec();
    }

    async executeQuery(query: any, sort?: any, limit?: number, skip?: number): Promise<BufferClient[]> {
        try {

            if (!query) {
                throw new BadRequestException('Query is invalid.');
            }
            const queryExec = this.bufferClientModel.find(query);
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

    removeFromBufferMap(key: string) {
        this.joinChannelMap.delete(key)
    }
    clearBufferMap() {
        console.log("BufferMap cleared")
        this.joinChannelMap.clear()
    }

    async joinchannelForBufferClients(skipExisting: boolean = true): Promise<string> {
        if (!this.telegramService.getActiveClientSetup()) {
            console.log("Joining Channel Started")
            await this.telegramService.disconnectAll();
            this.clearJoinChannelInterval();
            await sleep(2000);
            const existingkeys = skipExisting ? [] : Array.from(this.joinChannelMap.keys())
            // const today = (new Date(Date.now())).toISOString().split('T')[0];
            const clients = await this.bufferClientModel.find({ channels: { "$lt": 350 }, mobile: { $nin: existingkeys } }).sort({ channels: 1 }).limit(4);
            if (clients.length > 0) {
                for (const document of clients) {
                    try {
                        const client = await this.telegramService.createClient(document.mobile, false, false);
                        console.log("Started Joining for : ", document.mobile)
                        const channels = await client.channelInfo(true);
                        console.log("Existing Channels Length : ", channels.ids.length);
                        await this.update(document.mobile, { channels: channels.ids.length });
                        let result = [];
                        if (channels.canSendFalseCount < 50) {
                            if (channels.ids.length < 220) {
                                result = await this.channelsService.getActiveChannels(150, 0, channels.ids);
                            } else {
                                result = await this.activeChannelsService.getActiveChannels(150, 0, channels.ids);
                            }
                            this.joinChannelMap.set(document.mobile, result);
                            await this.telegramService.deleteClient(document.mobile);
                            this.joinChannelQueue();
                        } else {
                            await client.leaveChannels(channels.canSendFalseChats)
                        }
                        // console.log("DbChannelsLen: ", result.length);
                        // let resp = '';
                        // this.telegramService.joinChannels(document.mobile, result);
                    } catch (error) {
                        if (error.message === "SESSION_REVOKED" ||
                            error.message === "AUTH_KEY_UNREGISTERED" ||
                            error.message === "USER_DEACTIVATED" ||
                            error.message === "USER_DEACTIVATED_BAN") {
                            console.log("Session Revoked or Auth Key Unregistered. Removing Client");
                            await this.remove(document.mobile);
                            await this.telegramService.deleteClient(document.mobile);
                        }
                        parseError(error)
                    }
                }
            }
            console.log("Joining Channel Triggered Succesfully for ", clients.length);
            return `Initiated Joining channels ${clients.length}`
        } else {
            console.log("ignored active check buffer channels as active client setup exists")
        }
    }

    async joinChannelQueue() {
        const existingkeys = Array.from(this.joinChannelMap.keys())
        if (existingkeys.length > 0) {
            this.joinChannelIntervalId = setInterval(async () => {
                const keys = Array.from(this.joinChannelMap.keys());
                if (keys.length > 0) {
                    console.log("In JOIN CHANNEL interval: ", new Date().toISOString());
                    for (const mobile of keys) {
                        const channels = this.joinChannelMap.get(mobile);
                        if (channels && channels.length > 0) {
                            const channel = channels.shift();
                            console.log(mobile, " Pending Channels :", channels.length)
                            this.joinChannelMap.set(mobile, channels);
                            try {
                                await this.telegramService.createClient(mobile, false, false);
                                console.log(mobile, " Trying to join :", channel.username);
                                await this.telegramService.tryJoiningChannel(mobile, channel);
                            } catch (error) {
                                await this.telegramService.deleteClient(mobile);
                                const errorDetails = parseError(error, `${mobile} @${channel.username} Outer Err ERR: `, false);
                                if (error.errorMessage == 'CHANNELS_TOO_MUCH' || errorDetails.error == 'FloodWaitError') {
                                    this.removeFromBufferMap(mobile)
                                    const channels = await this.telegramService.getChannelInfo(mobile, true);
                                    // await this.update(mobile, { channels: channels.ids.length });
                                }
                                if (errorDetails.message === "SESSION_REVOKED" ||
                                    errorDetails.message === "AUTH_KEY_UNREGISTERED" ||
                                    errorDetails.message === "USER_DEACTIVATED" ||
                                    errorDetails.message === "USER_DEACTIVATED_BAN") {
                                    console.log("Session Revoked or Auth Key Unregistered. Removing Client");
                                    await this.remove(mobile);
                                }
                            }
                            await this.telegramService.deleteClient(mobile);
                        } else {
                            this.joinChannelMap.delete(mobile);
                        }
                    }
                } else {
                    this.clearJoinChannelInterval()
                }
            }, 4 * 60 * 1000);
        }
    }

    clearJoinChannelInterval() {
        if (this.joinChannelIntervalId) {
            clearInterval(this.joinChannelIntervalId);
            this.joinChannelIntervalId = null;
            setTimeout(() => {
                this.joinchannelForBufferClients(false)
            }, 30000);
        }
    }

    async setAsBufferClient(
        mobile: string,
        availableDate: string = (new Date(Date.now() - (24 * 60 * 60 * 1000))).toISOString().split('T')[0]
    ) {
        const user = (await this.usersService.search({ mobile }))[0];
        if (!user) {
            throw new BadRequestException('user not found');
        }
        const isExist = await this.findOne(mobile, false)
        if (isExist) {
            throw new ConflictException('BufferClient already exist');
        }
        const clients = await this.clientService.findAll();
        const clientMobiles = clients.map(client => client?.mobile);
        const clientPromoteMobiles = clients.flatMap(client => client?.promoteMobile);
        if (!clientPromoteMobiles.includes(mobile) && !clientMobiles.includes(mobile)) {
            try {
                const telegramClient = await this.telegramService.createClient(mobile, false)
                await telegramClient.set2fa();
                await sleep(15000)
                await telegramClient.updateUsername('');
                await sleep(3000)
                await telegramClient.updatePrivacyforDeletedAccount();
                await sleep(3000)
                await telegramClient.updateProfile("Deleted Account", "Deleted Account");
                // await sleep(3000)
                // await telegramClient.deleteProfilePhotos();
                // const channels = await this.telegramService.getChannelInfo(mobile, true)
                // const bufferClient = {
                //     tgId: user.tgId,
                //     session: user.session,
                //     mobile: user.mobile,
                //     availableDate,
                //     channels: channels.ids.length,
                // }
                // await this.bufferClientModel.findOneAndUpdate({ tgId: user.tgId }, { $set: bufferClient }, { new: true, upsert: true }).exec();
            } catch (error) {
                const errorDetails = parseError(error)
                throw new HttpException(errorDetails.message, errorDetails.status)
            }
            await this.telegramService.deleteClient(mobile)
            return "Client set as buffer successfully";
        } else {
            throw new BadRequestException("Number is a Active Client")
        }
    }

    async checkBufferClients() {
        if (!this.telegramService.getActiveClientSetup()) {
            await this.telegramService.disconnectAll()
            await sleep(2000);
            const bufferclients = await this.findAll();
            let goodIds: string[] = [];
            const badIds: string[] = [];
            if (bufferclients.length < 70) {
                for (let i = 0; i < 70 - bufferclients.length; i++) {
                    badIds.push(i.toString())
                }
            }
            const clients = await this.clientService.findAll();
            const promoteclients = await this.promoteClientService.findAll();
            const clientIds = [...clients.map(client => client.mobile), ...clients.flatMap(client => { return (client.promoteMobile) })]
            const promoteclientIds = promoteclients.map(client => client.mobile);
            const today = (new Date(Date.now())).toISOString().split('T')[0];
            for (const document of bufferclients) {
                if (!clientIds.includes(document.mobile) && !promoteclientIds.includes(document.mobile)) {
                    try {
                        const cli = await this.telegramService.createClient(document.mobile, true, false);
                        const me = await cli.getMe();
                        if (me.username) {
                            await this.telegramService.updateUsername(document.mobile, '');
                            await sleep(2000)
                        }
                        if (me.firstName !== "Deleted Account") {
                            await this.telegramService.updateNameandBio(document.mobile, 'Deleted Account', '');
                            // await this.telegramService.updatePrivacyforDeletedAccount(document.mobile);
                            await sleep(2000)
                        }
                        await this.telegramService.deleteProfilePhotos(document.mobile);
                        const hasPassword = await cli.hasPassword();
                        if (!hasPassword) {
                            console.log("Client does not have password");
                            badIds.push(document.mobile);
                            // await this.remove(document.mobile);
                        } else {
                            // const channelinfo = await this.telegramService.getChannelInfo(document.mobile, true);
                            // await this.bufferClientModel.findOneAndUpdate({ mobile: document.mobile }, { channels: channelinfo.ids.length })
                            console.log(document.mobile, " :  ALL Good");
                            goodIds.push(document.mobile)
                        }
                        await this.telegramService.deleteClient(document.mobile)
                        await sleep(2000);
                    } catch (error) {
                        parseError(error);
                        badIds.push(document.mobile);
                        this.remove(document.mobile)
                        await this.telegramService.deleteClient(document.mobile)
                    }
                } else {
                    console.log("Number is a Active Client");
                    goodIds.push(document.mobile)
                    this.remove(document.mobile)
                }
            }
            goodIds = [...goodIds, ...clientIds, ...promoteclientIds]
            console.log("GoodIds: ", goodIds.length, "BadIds : ", badIds.length);
            this.addNewUserstoBufferClients(badIds, goodIds);
        } else {
            console.log("ignored active check buffer channels as active client setup exists")
        }
    }

    async addNewUserstoBufferClients(badIds: string[], goodIds: string[]) {
        const sixMonthsAgo = (new Date(Date.now() - 3 * 30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        const documents = await this.usersService.executeQuery({ "mobile": { $nin: goodIds }, expired: false, twoFA: false, lastActive: { $lt: sixMonthsAgo }, totalChats: { $gt: 250 } }, { tgId: 1 }, badIds.length + 3);
        console.log("New buffer documents to be added: ", documents.length)
        while (badIds.length > 0 && documents.length > 0) {
            const document = documents.shift();
            try {
                try {
                    const client = await this.telegramService.createClient(document.mobile, false);
                    const hasPassword = await client.hasPassword();
                    console.log("hasPassword: ", hasPassword);
                    if (!hasPassword) {
                        await client.removeOtherAuths();
                        await client.set2fa();
                        console.log("waiting for setting 2FA");
                        await sleep(30000);
                        await client.updateUsername('');
                        await sleep(3000)
                        await client.updatePrivacyforDeletedAccount();
                        await sleep(3000)
                        await client.updateProfile("Deleted Account", "Deleted Account");
                        await sleep(3000)
                        await client.deleteProfilePhotos();
                        await sleep(2000);
                        await this.telegramService.removeOtherAuths(document.mobile);
                        const channels = await client.channelInfo(true)
                        console.log("Inserting Document");
                        const bufferClient = {
                            tgId: document.tgId,
                            session: document.session,
                            mobile: document.mobile,
                            availableDate: (new Date(Date.now() - (24 * 60 * 60 * 1000))).toISOString().split('T')[0],
                            channels: channels.ids.length,
                        }
                        await this.create(bufferClient);
                        await this.usersService.update(document.tgId, { twoFA: true })
                        console.log("=============Created BufferClient=============")
                        await this.telegramService.deleteClient(document.mobile)
                        badIds.pop();
                    } else {
                        console.log("Failed to Update as BufferClient has Password");
                        await this.usersService.update(document.tgId, { twoFA: true })
                        await this.telegramService.deleteClient(document.mobile)
                    }
                } catch (error) {
                    parseError(error)
                    await this.telegramService.deleteClient(document.mobile)
                }
            } catch (error) {
                parseError(error)
                console.error("An error occurred:", error);
            }
            await this.telegramService.deleteClient(document.mobile)
        }
        setTimeout(() => {
            this.joinchannelForBufferClients()
        }, 2 * 60 * 1000);
    }
}
