import { BufferClientService } from './../buffer-clients/buffer-client.service';
import { UsersService } from '../users/users.service';
import { contains, parseError, sleep } from "../../utils";
import TelegramManager from "./TelegramManager";
import { BadRequestException, HttpException, Inject, Injectable, forwardRef } from '@nestjs/common';
import { CloudinaryService } from '../../cloudinary';
import { Api } from 'telegram';
import { ActiveChannelsService } from '../activechannels/activechannels.service';

@Injectable()
export class TelegramService {
    private static clientsMap: Map<string, TelegramManager> = new Map()
    constructor(
        @Inject(forwardRef(() => UsersService))
        private usersService: UsersService,
        private bufferClientService: BufferClientService,
        @Inject(forwardRef(() => ActiveChannelsService))
        private activeChannelsService: ActiveChannelsService,
    ) { }


    public getActiveClientSetup() {
        return TelegramManager.getActiveClientSetup();
    }

    public setActiveClientSetup(data: { mobile: string, clientId: string }) {
        TelegramManager.setActiveClientSetup(data);
    }

    public getClient(number: string) {
        return TelegramService.clientsMap.get(number);
    }

    public hasClient(number: string) {
        return TelegramService.clientsMap.has(number);
    }

    async deleteClient(number: string) {
        const cli = this.getClient(number);
        await cli?.disconnect();
        console.log("Disconnected : ", number)
        return TelegramService.clientsMap.delete(number);
    }

    async disconnectAll() {
        const data = TelegramService.clientsMap.entries();
        console.log("Disconnecting All Clients");
        for (const [phoneNumber, client] of data) {
            try {
                await client?.disconnect();
                TelegramService.clientsMap.delete(phoneNumber);
                console.log(`Client disconnected: ${phoneNumber}`);
            } catch (error) {
                console.log(parseError(error));
                console.log(`Failed to Disconnect : ${phoneNumber}`);
            }
        }
    }

    async createClient(mobile: string, autoDisconnect = true, handler = true): Promise<TelegramManager> {
        const user = (await this.usersService.search({ mobile }))[0];
        if (!user) {
            throw new BadRequestException('user not found');
        }
        if (!TelegramService.clientsMap.has(mobile)) {
            const telegramManager = new TelegramManager(user.session, user.mobile);
            try {
                const client = await telegramManager.createClient(handler);
                if (client) {
                    TelegramService.clientsMap.set(mobile, telegramManager);
                    if (autoDisconnect) {
                        setTimeout(async () => {
                            if (client.connected || TelegramService.clientsMap.get(mobile)) {
                                console.log("SELF destroy client");
                                await telegramManager.disconnect();
                            } else {
                                console.log("Client Already Disconnected");
                            }
                            TelegramService.clientsMap.delete(mobile);
                        }, 180000)
                    } else {
                        setInterval(async () => {
                            await client.connect();
                        }, 20000);
                    }
                    return telegramManager;
                } else {
                    throw new BadRequestException('Client Expired');
                }
            } catch (error) {
                console.log("Parsing Error");
                const errorDetails = parseError(error);
                if (contains(errorDetails.message.toLowerCase(), ['expired', 'unregistered', 'deactivated'])) {
                    console.log("Deleting User: ", user.mobile);
                    await this.usersService.delete(user.tgId);
                } else {
                    console.log('Not Deleting user');
                }
                throw new BadRequestException(errorDetails.message)
            }
        } else {
            return TelegramService.clientsMap.get(mobile)
        }
    }

    async getMessages(mobile: string, username: string, limit: number = 8) {
        const telegramClient = TelegramService.clientsMap.get(mobile)
        return telegramClient.getMessages(username, limit);
    }
    //@apiresponse({ status: 400, description: 'Bad request' })
    async getChatId(mobile: string, username: string) {
        const telegramClient = TelegramService.clientsMap.get(mobile)
        return await telegramClient.getchatId(username);
    }

    async joinChannels(mobile: string, str: string) {
        const telegramClient = TelegramService.clientsMap.get(mobile)
        const channels = str.split('|');
        console.log(mobile, " - channelsLen - ", channels.length);
        for (let i = 0; i < channels.length; i++) {
            const channel = channels[i].trim();
            console.log(mobile, "Trying: ", channel);
            try {
                const chatEntity =  <Api.Channel>await telegramClient.getEntity(channel);
                const joinResult = await telegramClient.joinChannel(chatEntity);
                console.log(mobile, " - Joined channel Success - ", channel);
                try {
                    const { title, id, broadcast, defaultBannedRights, participantsCount, megagroup, username } = chatEntity;
                    const entity = {
                        title,
                        id: id.toString(),
                        username,
                        megagroup,
                        participantsCount,
                        broadcast
                    };
                    if (!chatEntity.broadcast && !defaultBannedRights?.sendMessages) {
                        entity['canSendMsgs'] = true;
                        try {
                            await this.activeChannelsService.update(entity.id.toString(), entity)
                            console.log("updated ActiveChannels");
                        } catch (error) {
                            console.log(parseError(error));
                            console.log("Failed to update ActiveChannels");
                        }
                    } else {
                        await this.activeChannelsService.remove(entity.id.toString());
                        // await db.removeOnefromActiveChannel({ username: channel.startsWith("@") ? channel : `@${channel}` });
                        // await db.removeOnefromChannel({ username: channel.startsWith("@") ? channel : `@${channel}` });
                        console.log("Removed Channel- ", channel);
                    }
                } catch (error) {
                    console.log(mobile, " - Failed - ", error);
                }
            } catch (error) {
                console.log("Channels ERR: ", error);
                if (error.toString().includes("No user has") || error.toString().includes("USERNAME_INVALID")) {
                    const activeChannel = await this.activeChannelsService.search({ username: channel.replace('@', '') })
                    await this.activeChannelsService.remove(activeChannel[0]?.channelId);
                    // await db.removeOnefromChannel({ username: channel.startsWith("@") ? channel : `@${channel}` });
                    console.log("Removed Channel- ", channel);
                }
            }
            console.log(mobile, " - On waiting period");
            await new Promise(resolve => setTimeout(resolve, 3 * 60 * 1000));
            console.log(mobile, " - Will Try next");
        }
        console.log(mobile, " - finished joining channels");
        if (telegramClient) {
            await telegramClient.disconnect();
            // await deleteClient(this.phoneNumber);
        }
        return 'Channels joined successfully';
    }
    
    async removeOtherAuths(mobile: string) {
        const telegramClient = TelegramService.clientsMap.get(mobile)
        await telegramClient.removeOtherAuths();
        return 'Authorizations removed successfully';
    }

    //@apiresponse({ status: 400, description: 'Bad request' })
    async getSelfMsgsInfo(mobile: string) {
        const telegramClient = TelegramService.clientsMap.get(mobile)
        return await telegramClient.getSelfMSgsInfo();
    }

    async getChannelInfo(mobile: string, sendIds: boolean = false) {
        const telegramClient = TelegramService.clientsMap.get(mobile)
        return await telegramClient.channelInfo(sendIds);
    }

    async getAuths(mobile: string) {
        const telegramClient = TelegramService.clientsMap.get(mobile)
        return await telegramClient.getAuths();
    }

    async getMe(mobile: string) {
        const telegramClient = TelegramService.clientsMap.get(mobile)
        return await telegramClient.getMe();
    }

    async set2Fa(mobile: string) {
        const telegramClient = TelegramService.clientsMap.get(mobile)
        try {
            await telegramClient.set2fa();
            await telegramClient.disconnect();
            return '2Fa set successfully'
        } catch (error) {
            const errorDetails = parseError(error)
            throw new HttpException(errorDetails.message, parseInt(errorDetails.status))
        }
    }

    async updatePrivacyforDeletedAccount(mobile: string) {
        const telegramClient = TelegramService.clientsMap.get(mobile);
        await telegramClient.updatePrivacyforDeletedAccount()
    }

    async deleteProfilePhotos(mobile: string) {
        const telegramClient = TelegramService.clientsMap.get(mobile);
        await telegramClient.deleteProfilePhotos()
    }

    async setProfilePic(
        mobile: string, name: string,
    ) {
        const telegramClient = TelegramService.clientsMap.get(mobile)
        try {
            await CloudinaryService.getInstance(name);
            await sleep(2000);
            await telegramClient.updateProfilePic('./dp1.jpg');
            await sleep(1000);
            await telegramClient.updateProfilePic('./dp2.jpg');
            await sleep(1000);
            await telegramClient.updateProfilePic('./dp3.jpg');
            await sleep(1000);
            await telegramClient.disconnect();
            return '2Fa set successfully'
        } catch (error) {
            const errorDetails = parseError(error)
            throw new HttpException(errorDetails.message, parseInt(errorDetails.status))
        }
    }

    async updatePrivacy(
        mobile: string,
    ) {
        const telegramClient = TelegramService.clientsMap.get(mobile)
        try {
            await telegramClient.updatePrivacy()
            return "Privacy updated successfully";
        } catch (error) {
            const errorDetails = parseError(error)
            throw new HttpException(errorDetails.message, parseInt(errorDetails.status))
        }
    }

    async updateUsername(
        mobile: string, username: string,
    ) {
        const telegramClient = TelegramService.clientsMap.get(mobile)
        try {
            return await telegramClient.updateUsername(username)
        } catch (error) {
            console.log("Some Error: ", parseError(error), error);
            throw new Error("Failed to update username");
        }
    }

    async updateNameandBio(
        mobile: string,
        firstName: string,
        about: string,
    ) {
        const telegramClient = TelegramService.clientsMap.get(mobile)
        try {
            await telegramClient.updateProfile(firstName, about)
            return "Username updated successfully";
        } catch (error) {
            console.log("Some Error: ", parseError(error), error);
            throw new Error("Failed to update username");
        }
    }
}