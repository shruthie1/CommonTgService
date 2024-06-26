import { BufferClientService } from './../buffer-clients/buffer-client.service';
import { UsersService } from '../users/users.service';
import { contains, parseError, sleep } from "../../utils";
import TelegramManager from "./TelegramManager";
import { BadRequestException, HttpException, Inject, Injectable, forwardRef } from '@nestjs/common';
import { CloudinaryService } from '../../cloudinary';
import { Api } from 'telegram';
import { ActiveChannelsService } from '../activechannels/activechannels.service';
import * as path from 'path';
import { ChannelsService } from '../channels/channels.service';

@Injectable()
export class TelegramService {
    private static clientsMap: Map<string, TelegramManager> = new Map()
    constructor(
        @Inject(forwardRef(() => UsersService))
        private usersService: UsersService,
        private bufferClientService: BufferClientService,
        @Inject(forwardRef(() => ActiveChannelsService))
        private activeChannelsService: ActiveChannelsService,
        @Inject(forwardRef(() => ChannelsService))
        private channelsService: ChannelsService,
    ) { }


    public getActiveClientSetup() {
        return TelegramManager.getActiveClientSetup();
    }

    public setActiveClientSetup(data: { mobile: string, clientId: string } | undefined) {
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
                                console.log("SELF destroy client : ", mobile);
                                await telegramManager.disconnect();
                            } else {
                                console.log("Client Already Disconnected : ", mobile);
                            }
                            TelegramService.clientsMap.delete(mobile);
                        }, 180000)
                    } else {
                        setInterval(async () => {
                            if (!client.connected) {
                                await client.connect();
                            }
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
    
    async getChatId(mobile: string, username: string) {
        const telegramClient = TelegramService.clientsMap.get(mobile)
        return await telegramClient.getchatId(username);
    }

    async joinChannels(mobile: string, str: string) {
        const telegramClient = TelegramService.clientsMap.get(mobile);
        const channels = str.split('|');
        console.log("Started Joining- ", mobile, " - channelsLen - ", channels.length);

        const joinChannelWithDelay = async (index: number) => {
            if (index >= channels.length) {
                console.log(mobile, " - finished joining channels");
                if (telegramClient) {
                    telegramClient.disconnect();
                    console.log("Join channel stopped : ", mobile);
                }
                return;
            }

            if (!telegramClient.connected()) {
                this.deleteClient(mobile);
                return;
            }

            const channel = channels[index].trim();
            console.log(mobile, "Trying: ", channel);
            try {
                const chatEntity = <Api.Channel>await telegramClient.getEntity(channel);
                await tryJoiningChannel(telegramClient, chatEntity, channel, mobile);

                console.log(mobile, " - On waiting period");
                await this.deleteClient(mobile);
                setTimeout(async () => {
                    await this.createClient(mobile, false, false);
                    console.log(mobile, " - Will Try next now");
                    await joinChannelWithDelay(index + 1);
                }, 3 * 60 * 1000);
            } catch (error) {
                parseError(error, "Outer Err: ");
                await this.removeChannels(error, undefined, channel);
                setTimeout(async () => {
                    console.log(mobile, " - Will Try next now");
                    await joinChannelWithDelay(index + 1);
                }, 10000);
            }
        };

        const tryJoiningChannel = async (telegramClient: TelegramManager, chatEntity: Api.Channel, channel: string, mobile: string) => {
            const { title, id, broadcast, defaultBannedRights, participantsCount, megagroup, username } = chatEntity;
            try {
                await telegramClient.joinChannel(chatEntity);
                console.log(mobile, " - Joined channel Success - ", channel);
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
                        await this.activeChannelsService.update(entity.id, entity);
                        console.log("updated ActiveChannels");
                    } catch (error) {
                        console.log(parseError(error));
                        console.log("Failed to update ActiveChannels");
                    }
                } else {
                    await this.channelsService.remove(entity.id);
                    await this.activeChannelsService.remove(entity.id);
                    console.log("Removed Channel- ", channel);
                }
            } catch (error) {
                parseError(error, `${chatEntity.megagroup} - Channels ERR: `);
                await this.removeChannels(error, chatEntity.id.toString(), chatEntity.username);
            }
        };

        joinChannelWithDelay(0);
        return 'Channels joining in progress';
    }

    async removeChannels(error: any, channelId: string, username: string) {
        if (error.errorMessage == "USERNAME_INVALID" || error.errorMessage == 'USERS_TOO_MUCH' || error.toString().includes("No user has")) {
            try {
                if (channelId) {
                    await this.channelsService.remove(channelId)
                    await this.activeChannelsService.remove(channelId);
                    console.log("Removed Channel- ", channelId);
                } else {
                    const channelDetails = (await this.channelsService.search({ username: username }))[0];
                    await this.channelsService.remove(channelDetails.channelId)
                    await this.activeChannelsService.remove(channelDetails.channelId);
                    console.log("Removed Channel - ", channelDetails.channelId);
                }
            } catch (searchError) {
                console.log("Failed to search/remove channel: ", searchError);
            }
        }
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
        await telegramClient.deleteProfilePhotos();
        try {
            await CloudinaryService.getInstance(name);
            await sleep(2000);
            const rootPath = process.cwd();
            console.log("checking path",rootPath)
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp1.jpg'));
            await sleep(3000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp2.jpg'));
            await sleep(3000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp3.jpg'));
            await sleep(1000);
            await telegramClient.disconnect();
            return 'Profile pic set successfully'
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
