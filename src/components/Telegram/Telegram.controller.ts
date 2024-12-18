import { Controller, Get, Post, Body, Param, Query, BadRequestException, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam, ApiBody } from '@nestjs/swagger';
import { TelegramService } from './Telegram.service';
import * as fs from 'fs';
@Controller('telegram')
@ApiTags('Telegram')
export class TelegramController {
    constructor(
        private readonly telegramService: TelegramService
    ) {}

    async connectToTelegram(mobile: string) {
        return await this.telegramService.createClient(mobile);
    }

    @Get('connect/:mobile')
    @ApiOperation({ summary: 'Create and connect a new Telegram client' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    //@apiresponse({ status: 201, description: 'Client connected successfully' })
    //@apiresponse({ status: 400, description: 'Bad request' })
    async connectClient(@Param('mobile') mobile: string): Promise<string> {
        await this.connectToTelegram(mobile);
        return 'Client connected successfully';
    }

    @Get('disconnect/:mobile')
    @ApiOperation({ summary: 'Create and connect a new Telegram client' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    //@apiresponse({ status: 201, description: 'Client connected successfully' })
    //@apiresponse({ status: 400, description: 'Bad request' })
    async disconnect(@Param('mobile') mobile: string): Promise<boolean> {
        return await this.telegramService.deleteClient(mobile);
    }

    @Get('disconnectAll')
    @ApiOperation({ summary: 'Create and connect a new Telegram client' })
    //@apiresponse({ status: 201, description: 'Client connected successfully' })
    //@apiresponse({ status: 400, description: 'Bad request' })
    async disconnectAll(): Promise<string> {
        await this.telegramService.disconnectAll();
        return 'Clients disconnected successfully';
    }

    @Get('messages/:mobile')
    @ApiOperation({ summary: 'Get messages from Telegram' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'username', description: 'Username to fetch messages from', required: true })
    @ApiQuery({ name: 'limit', description: 'Limit the number of messages', required: false })
    //@apiresponse({ status: 200, description: 'Messages fetched successfully' })
    //@apiresponse({ status: 400, description: 'Bad request' })
    async getMessages(@Param('mobile') mobile: string, @Query('username') username: string, @Query('limit') limit: number = 8) {
        await this.connectToTelegram(mobile);
        return this.telegramService.getMessages(mobile, username, limit);
    }

    @Get('messagesNew/:mobile')
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', description: 'Username to fetch messages from', required: true })
    @ApiQuery({ name: 'limit', description: 'Limit the number of messages', required: false })
    @ApiQuery({ name: 'offset', description: 'offset the number of messages', required: false })
    async getMessagesNew(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string,
        @Query('offset') offset: number,
        @Query('limit') limit: number = 20
    ) {
        await this.telegramService.createClient(mobile, false, false);
        const messages = await this.telegramService.getMessagesNew(mobile, chatId, offset, limit);
        return messages;
    }

    @Get('chatid/:mobile')
    @ApiOperation({ summary: 'Get chat ID for a username' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'username', description: 'Username to fetch chat ID for', required: true })
    //@apiresponse({ status: 200, description: 'Chat ID fetched successfully' })
    //@apiresponse({ status: 400, description: 'Bad request' })
    async getChatId(@Param('mobile') mobile: string, @Query('username') username: string) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getChatId(mobile, username);
    }

    @Get('sendInlineMessage/:mobile')
    @ApiOperation({ summary: 'Get chat ID for a username' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', description: 'chat ID of user', required: true })
    @ApiQuery({ name: 'message', description: 'message ID of user', required: true })
    @ApiQuery({ name: 'url', description: 'url ID of user', required: true })
    async sendInlineMessage(@Param('mobile') mobile: string,
        @Query('chatId') chatId: string,
        @Query('message') message: string,
        @Query('url') url: string,) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.sendInlineMessage(mobile, chatId, message, url);
    }

    @Get('lastActiveTime/:mobile')
    @ApiOperation({ summary: 'Get Last Active time of a user' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async lastActiveTime(@Param('mobile') mobile: string) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getLastActiveTime(mobile);
    }

    @Post('joinchannels/:mobile')
    @ApiOperation({ summary: 'Join channels' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ description: 'Channels string', schema: { type: 'object', properties: { channels: { type: 'string' } } } })
    //@apiresponse({ status: 200, description: 'Channels joined successfully' })
    //@apiresponse({ status: 400, description: 'Bad request' })
    async joinChannels(@Param('mobile') mobile: string, @Body('channels') channels: string) {
        await this.connectToTelegram(mobile);
        // this.telegramService.joinChannels(mobile, channels);
        return 'Joining Channels';
    }

    @Get('removeauths/:mobile')
    @ApiOperation({ summary: 'Remove other authorizations' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    //@apiresponse({ status: 200, description: 'Authorizations removed successfully' })
    //@apiresponse({ status: 400, description: 'Bad request' })
    async removeOtherAuths(@Param('mobile') mobile: string) {
        await this.connectToTelegram(mobile);
        await this.telegramService.removeOtherAuths(mobile);
        return 'Authorizations removed successfully';
    }

    @Get('selfmsgsinfo/:mobile')
    @ApiOperation({ summary: 'Get self messages info' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    //@apiresponse({ status: 200, description: 'Self messages info fetched successfully' })
    //@apiresponse({ status: 400, description: 'Bad request' })
    async getSelfMsgsInfo(@Param('mobile') mobile: string) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getSelfMsgsInfo(mobile);
    }

    @Get('getCallLog/:mobile')
    @ApiOperation({ summary: 'Get CallLog  info' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    //@apiresponse({ status: 200, description: 'Self messages info fetched successfully' })
    //@apiresponse({ status: 400, description: 'Bad request' })
    async getCallLog(@Param('mobile') mobile: string) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getCallLog(mobile);
    }

    @Get('getMe/:mobile')
    @ApiOperation({ summary: 'Get me  info' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    //@apiresponse({ status: 200, description: 'Self messages info fetched successfully' })
    //@apiresponse({ status: 400, description: 'Bad request' })
    async getMe(@Param('mobile') mobile: string) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getMe(mobile);
    }

    @Get('getMedia/:mobile')
    @ApiOperation({ summary: 'Get me  info' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    //@apiresponse({ status: 200, description: 'Self messages info fetched successfully' })
    //@apiresponse({ status: 400, description: 'Bad request' })
    async getMedia(@Param('mobile') mobile: string) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getmedia(mobile);
    }

    @Get('channelinfo/:mobile')
    @ApiOperation({ summary: 'Get channel info' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'sendIds', description: 'Whether to send IDs or not', required: false })
    //@apiresponse({ status: 200, description: 'Channel info fetched successfully' })
    //@apiresponse({ status: 400, description: 'Bad request' })
    async getChannelInfo(@Param('mobile') mobile: string, @Query('sendIds') sendIds: boolean = false) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getChannelInfo(mobile, sendIds);
    }

    @Get('leaveChannels/:mobile')
    @ApiOperation({ summary: 'Get channel info' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    //@apiresponse({ status: 200, description: 'Channel info fetched successfully' })
    //@apiresponse({ status: 400, description: 'Bad request' })
    async leaveChannels(@Param('mobile') mobile: string) {
        await this.connectToTelegram(mobile);
        this.telegramService.leaveChannels(mobile);
        return "Started Leaving Channels"
    }

    @Get('auths/:mobile')
    @ApiOperation({ summary: 'Get authorizations' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    //@apiresponse({ status: 200, description: 'Authorizations fetched successfully' })
    //@apiresponse({ status: 400, description: 'Bad request' })
    async getAuths(@Param('mobile') mobile: string) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getAuths(mobile);
    }

    @Get('set2Fa/:mobile')
    @ApiOperation({ summary: 'Set 2Fa' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    //@apiresponse({ status: 200, description: '2Fa set successfully' })
    //@apiresponse({ status: 400, description: 'Bad request' })
    async set2Fa(@Param('mobile') mobile: string) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.set2Fa(mobile);
    }

    @Get('setprofilepic/:mobile/:name')
    @ApiOperation({ summary: 'Set Profile Picture' })
    @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
    @ApiParam({ name: 'name', description: 'Profile name', type: String })
    async setProfilePic(
        @Param('mobile') mobile: string,
        @Param('name') name: string,
    ) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.setProfilePic(mobile, name)
    }

    @Get('updatePrivacy/:mobile')
    @ApiOperation({ summary: 'Update Privacy Settings' })
    @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
    async updatePrivacy(
        @Param('mobile') mobile: string,
    ) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.updatePrivacy(mobile)
    }

    @Get('UpdateUsername/:mobile')
    @ApiOperation({ summary: 'Update Username' })
    @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
    @ApiQuery({ name: 'username', description: 'New username', type: String })
    async updateUsername(
        @Param('mobile') mobile: string,
        @Query('username') username: string,
    ) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.updateUsername(mobile, username)
    }

    @Get('newSession/:mobile')
    @ApiOperation({ summary: 'Create new session' })
    @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
    async newSession(
        @Param('mobile') mobile: string,
    ) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.createNewSession(mobile)
    }

    @Get('updateNameandBio/:mobile')
    @ApiOperation({ summary: 'Update Name' })
    @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
    @ApiQuery({ name: 'firstName', description: 'First Name', type: String })
    @ApiQuery({ name: 'about', description: 'About', type: String })
    async updateName(
        @Param('mobile') mobile: string,
        @Query('firstName') firstName: string,
        @Query('about') about: string,
    ) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.updateNameandBio(mobile, firstName, about)
    }

    @Get('metadata')
    async getMediaMetadata(@Query('mobile') mobile: string, @Query('chatId') chatId: string, @Query('offset') offset: number, @Query('limit') limit: number) {
        await this.telegramService.createClient(mobile, false, false);
        return this.telegramService.getMediaMetadata(mobile, chatId, offset, limit);
    }

    @Get('download')
    async downloadMediaFile(
        @Query('mobile') mobile: string,
        @Query('messageId') messageId: number,
        @Query('chatId') chatId: string,
        @Res() res: any
    ) {
        await this.connectToTelegram(mobile);
        await this.telegramService.downloadMediaFile(mobile, messageId, chatId, res);
    }

    @Get('downloadProfilePic')
    async downloadProfilePic(
        @Query('mobile') mobile: string,
        @Query('index') index: number,
        @Res() res: any
    ) {
        await this.connectToTelegram(mobile);
        try {
            const filePath = await this.telegramService.downloadProfilePic(mobile,index);
            if (!filePath) {
                return res.status(404).send('Profile photo not found.');
            }
    
            res.download(filePath, 'profile_pic.jpg', (err) => {
                if (err) {
                    console.error('Error sending the file:', err);
                    res.status(500).send('Error downloading the file.');
                }
    
                fs.unlink(filePath, (err) => {
                    if (err) {
                        console.error('Error deleting the file:', err);
                    }
                });
            });
        } catch (error) {
            console.error('Error in endpoint:', error);
            res.status(500).send('An error occurred.');
        }
    }


    @Get('forward/:mobile/:chatId/:messageId')
    @ApiOperation({ summary: 'Create new session' })
    @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
    @ApiParam({ name: 'chatId', description: 'chatId of user', type: String })
    @ApiParam({ name: 'messageId', description: 'messageId of message', type: String })
    async forrward(
        @Param('mobile') mobile: string,
        @Param('chatId') chatId: string,
        @Param('messageId') messageId: number,
    ) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.forwardMessage(mobile, chatId, messageId)
    }

    @Get('deleteChat/:mobile/:chatId')
    @ApiOperation({ summary: 'Create new session' })
    @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
    @ApiParam({ name: 'chatId', description: 'chatId of user', type: String })
    async deleteChat(
        @Param('mobile') mobile: string,
        @Param('chatId') chatId: string,
    ) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.deleteChat(mobile, chatId)
    }
    
    @Get('deleteProfilePics/:mobile')
    @ApiOperation({ summary: 'Create new session' })
    @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
    async deleteProfilePics(
        @Param('mobile') mobile: string,
    ) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.deleteProfilePhotos(mobile)
    }
}
