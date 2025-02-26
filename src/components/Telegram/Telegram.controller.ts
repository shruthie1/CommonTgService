import { Controller, Get, Post, Body, Param, Query, BadRequestException, Res, UsePipes, ValidationPipe, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam, ApiBody, ApiResponse } from '@nestjs/swagger';
import { TelegramService } from './Telegram.service';
import { ForwardMessageDto } from './dto/forward-message.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChannelOperationDto } from './dto/channel-operation.dto';
import { BulkMessageOperationDto } from './dto/metadata-operations.dto';
import { AddContactsDto } from './dto/contact-operation.dto';
import { MessageSearchDto } from './dto/message-search.dto';
import { MediaFilterDto } from './dto/media-filter.dto';
import { CreateChatFolderDto } from './dto/create-chat-folder.dto';
import { ContactExportImportDto } from './dto/contact-export-import.dto';
import { ContactBlockListDto } from './dto/contact-block-list.dto';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { 
    BackupOptions, 
    ChatStatistics, 
    ContentFilter, 
    GroupOptions, 
    MediaAlbumOptions, 
    ScheduleMessageOptions 
} from '../../interfaces/telegram';

@Controller('telegram')
@ApiTags('Telegram')
@UsePipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true
}))
export class TelegramController {
    constructor(private readonly telegramService: TelegramService) {}

    private async handleTelegramOperation<T>(operation: () => Promise<T>): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            throw new BadRequestException(error.message || 'Telegram operation failed');
        }
    }

    // Connection Management
    @Post('connect/:mobile')
    @ApiOperation({ summary: 'Connect to Telegram' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ status: 200, description: 'Successfully connected' })
    @ApiResponse({ status: 400, description: 'Connection failed' })
    async connect(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(() =>
            this.telegramService.createClient(mobile)
        );
    }

    @Get('disconnect/:mobile')
    @ApiOperation({ summary: 'Disconnect from Telegram' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ status: 200, description: 'Successfully disconnected' })
    async disconnect(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.deleteClient(mobile);
        });
    }

    // Profile Management
    @Get('me/:mobile')
    @ApiOperation({ summary: 'Get current user profile' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
    async getMe(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getMe(mobile);
        });
    }

    @Post('profile/update/:mobile')
    @ApiOperation({ summary: 'Update profile information' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ status: 200, description: 'Profile updated successfully' })
    async updateProfile(
        @Param('mobile') mobile: string,
        @Body() updateProfileDto: UpdateProfileDto
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.updateNameandBio(
                mobile,
                updateProfileDto.firstName,
                updateProfileDto.about
            );
        });
    }

    @Post('profile/photo/:mobile')
    @ApiOperation({ summary: 'Set profile photo' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiParam({ name: 'name', description: 'Profile photo name', required: true })
    async setProfilePhoto(
        @Param('mobile') mobile: string,
        @Param('name') name: string
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.setProfilePic(mobile, name);
        });
    }

    @Delete('profile/photos/:mobile')
    @ApiOperation({ summary: 'Delete all profile photos' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async deleteProfilePhotos(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.deleteProfilePhotos(mobile);
        });
    }

    // Message Management
    @Get('messages/:mobile')
    @ApiOperation({ summary: 'Get chat messages' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', description: 'Chat ID or username', required: true })
    @ApiQuery({ name: 'limit', description: 'Number of messages', required: false })
    async getMessages(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string,
        @Query('limit') limit: number = 20
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getMessages(mobile, chatId, limit);
        });
    }

    @Post('messages/forward')
    @ApiOperation({ summary: 'Forward messages' })
    @ApiBody({ type: ForwardMessageDto })
    async forwardMessage(@Body() forwardMessageDto: ForwardMessageDto) {
        return this.handleTelegramOperation(async () => {
            const { mobile, chatId, messageId } = forwardMessageDto;
            await this.telegramService.createClient(mobile);
            return this.telegramService.forwardMessage(mobile, chatId, messageId);
        });
    }

    @Post('messages/bulk-forward/:mobile')
    @ApiOperation({ summary: 'Forward multiple messages' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: BulkMessageOperationDto })
    async forwardBulkMessages(
        @Param('mobile') mobile: string,
        @Body() bulkOp: BulkMessageOperationDto
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.forwardBulkMessages(
                mobile,
                bulkOp.fromChatId,
                bulkOp.toChatId,
                bulkOp.messageIds
            );
        });
    }

    @Get('messages/search/:mobile')
    @ApiOperation({ summary: 'Search messages in a chat' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async searchMessages(
        @Param('mobile') mobile: string,
        @Query() searchParams: MessageSearchDto
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.searchMessages(mobile, searchParams);
        });
    }

    // Channel Operations
    @Get('channels/:mobile')
    @ApiOperation({ summary: 'Get channel information' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'includeIds', description: 'Include channel IDs', required: false })
    async getChannelInfo(
        @Param('mobile') mobile: string,
        @Query('includeIds') includeIds: boolean = false
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getChannelInfo(mobile, includeIds);
        });
    }

    @Post('channels/join/:mobile')
    @ApiOperation({ summary: 'Join channel' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: ChannelOperationDto })
    async joinChannel(
        @Param('mobile') mobile: string,
        @Body() channelOp: ChannelOperationDto
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            if (channelOp.forward) {
                return this.telegramService.joinChannelAndForward(
                    mobile,
                    channelOp.fromChatId,
                    channelOp.channel
                );
            }
            return this.telegramService.joinChannel(mobile, channelOp.channel);
        });
    }

    @Post('channels/leave/:mobile')
    @ApiOperation({ summary: 'Leave channel' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'channel', description: 'Channel ID/username', required: true })
    async leaveChannel(
        @Param('mobile') mobile: string,
        @Query('channel') channel: string
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.leaveChannel(mobile, channel);
        });
    }

    // Security & Privacy
    @Post('2fa/:mobile')
    @ApiOperation({ summary: 'Setup two-factor authentication' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async setup2FA(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.set2Fa(mobile);
        });
    }

    @Post('privacy/:mobile')
    @ApiOperation({ summary: 'Update privacy settings' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async updatePrivacy(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.updatePrivacy(mobile);
        });
    }

    // Session Management
    @Get('sessions/:mobile')
    @ApiOperation({ summary: 'Get active sessions' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async getActiveSessions(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getAuths(mobile);
        });
    }

    @Delete('sessions/:mobile')
    @ApiOperation({ summary: 'Terminate other sessions' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async terminateOtherSessions(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.removeOtherAuths(mobile);
        });
    }

    @Post('sessions/new/:mobile')
    @ApiOperation({ summary: 'Create new session' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async createNewSession(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.createNewSession(mobile);
        });
    }

    // Monitoring & Health
    @Get('monitoring/status')
    @ApiOperation({ summary: 'Get connection status' })
    @ApiResponse({ status: 200, description: 'Connection status retrieved successfully' })
    async getConnectionStatus() {
        return {
            status: await this.telegramService.getConnectionStatus()
        };
    }

    @Get('monitoring/client/:mobile')
    @ApiOperation({ summary: 'Get client metadata' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async getClientMetadata(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getClientMetadata(mobile);
        });
    }

    @Get('monitoring/statistics')
    @ApiOperation({ summary: 'Get client statistics' })
    @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
    async getClientStatistics() {
        return await this.telegramService.getClientStatistics();
    }

    @Get('monitoring/health')
    @ApiOperation({ summary: 'Get service health' })
    @ApiResponse({ status: 200, description: 'Health status retrieved successfully' })
    async getHealthStatus() {
        return {
            connections: await this.telegramService.getConnectionStatus(),
            statistics: await this.telegramService.getClientStatistics()
        };
    }

    @Get('monitoring/media-statistics/:mobile')
    @ApiOperation({ summary: 'Get media message statistics' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async getMediaStats(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            const client = await this.telegramService.createClient(mobile);
            return client.getSelfMSgsInfo();
        });
    }

    @Get('monitoring/calllog/:mobile')
    @ApiOperation({ summary: 'Get call log statistics' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async getCallLogStats(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getCallLog(mobile);
        });
    }

    // Contact Management 
    @Post('contacts/add-bulk')
    @ApiOperation({ summary: 'Add multiple contacts in bulk' })
    @ApiBody({ type: AddContactsDto })
    @ApiResponse({ status: 200, description: 'Contacts added successfully' })
    async addContactsBulk(@Body() contactsDto: AddContactsDto) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(contactsDto.mobile);
            return this.telegramService.addContacts(
                contactsDto.mobile,
                contactsDto.phoneNumbers,
                contactsDto.prefix
            );
        });
    }

    // Media Operations
    @Get('media/info/:mobile')
    @ApiOperation({ summary: 'Get media messages info' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async getMediaInfo(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getmedia(mobile);
        });
    }

    @Post('media/send/:mobile')
    @ApiOperation({ summary: 'Send media message' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', description: 'Chat ID to send to', required: true })
    @ApiQuery({ name: 'url', description: 'Media URL', required: true })
    @ApiQuery({ name: 'caption', description: 'Media caption', required: false })
    @ApiQuery({ name: 'filename', description: 'Filename for the media', required: true })
    @ApiQuery({ name: 'type', description: 'Media type (photo/file)', required: true, enum: ['photo', 'file'] })
    async sendMedia(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string,
        @Query('url') url: string,
        @Query('caption') caption: string = '',
        @Query('filename') filename: string,
        @Query('type') type: 'photo' | 'file'
    ) {
        return this.handleTelegramOperation(async () => {
            const client = await this.telegramService.createClient(mobile);
            if (type === 'photo') {
                return client.sendPhotoChat(chatId, url, caption, filename);
            } else {
                return client.sendFileChat(chatId, url, caption, filename);
            }
        });
    }

    @Post('media/download/:mobile')
    @ApiOperation({ summary: 'Download media from a message' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'messageId', description: 'Message ID', required: true })
    @ApiQuery({ name: 'chatId', description: 'Chat ID', required: true })
    async downloadMedia(
        @Param('mobile') mobile: string,
        @Query('messageId') messageId: number,
        @Query('chatId') chatId: string,
        @Res() res: Response
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.downloadMediaFile(mobile, messageId, chatId, res);
        });
    }

    @Get('media/metadata/:mobile')
    @ApiOperation({ summary: 'Get media metadata from a chat' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', description: 'Chat ID', required: false })
    @ApiQuery({ name: 'offset', description: 'Message offset', required: false })
    @ApiQuery({ name: 'limit', description: 'Number of messages', required: false })
    async getMediaMetadata(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string = 'me',
        @Query('offset') offset: number,
        @Query('limit') limit: number = 100
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getMediaMetadata(mobile, chatId, offset, limit);
        });
    }

    @Get('media/filter/:mobile')
    @ApiOperation({ summary: 'Get filtered media messages from a chat' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async getFilteredMedia(
        @Param('mobile') mobile: string,
        @Query() filterParams: MediaFilterDto
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getFilteredMedia(mobile, {
                ...filterParams,
                startDate: filterParams.startDate ? new Date(filterParams.startDate) : undefined,
                endDate: filterParams.endDate ? new Date(filterParams.endDate) : undefined
            });
        });
    }

    // Chat Operations
    @Get('chats/:mobile')
    @ApiOperation({ summary: 'Get all chats' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async getAllChats(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            const client = await this.telegramService.createClient(mobile);
            return client.getAllChats();
        });
    }

    @Get('group/members/:mobile')
    @ApiOperation({ summary: 'Get group members' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'entityId', description: 'Group/Channel ID', required: true })
    async getGroupMembers(
        @Param('mobile') mobile: string,
        @Query('entityId') entityId: string
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getGrpMembers(mobile, entityId);
        });
    }

    @Post('chat/block/:mobile')
    @ApiOperation({ summary: 'Block a chat/user' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', description: 'Chat/User ID to block', required: true })
    async blockChat(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.blockUser(mobile, chatId);
        });
    }

    @Delete('chat/:mobile')
    @ApiOperation({ summary: 'Delete a chat' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', description: 'Chat ID to delete', required: true })
    async deleteChatHistory(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.deleteChat(mobile, chatId);
        });
    }

    // Additional Message Operations
    @Get('messages/inline/:mobile')
    @ApiOperation({ summary: 'Send message with inline button' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', description: 'Chat ID', required: true })
    @ApiQuery({ name: 'message', description: 'Message text', required: true })
    @ApiQuery({ name: 'url', description: 'Button URL', required: true })
    async sendMessageWithInlineButton(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string,
        @Query('message') message: string,
        @Query('url') url: string
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.sendInlineMessage(mobile, chatId, message, url);
        });
    }

    // Dialog Management
    @Get('dialogs/all/:mobile')
    @ApiOperation({ summary: 'Get all dialogs' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'limit', description: 'Number of dialogs to fetch', required: false })
    @ApiQuery({ name: 'archived', description: 'Include archived chats', required: false })
    async getAllDialogs(
        @Param('mobile') mobile: string,
        @Query('limit') limit: number = 500,
        @Query('archived') archived: boolean = false
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getDialogs(mobile, { limit, archived });
        });
    }

    @Get('contacts/:mobile')
    @ApiOperation({ summary: 'Get all contacts' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async getContacts(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            const client = await this.telegramService.createClient(mobile);
            return client.getContacts();
        });
    }

    @Get('last-active/:mobile')
    @ApiOperation({ summary: 'Get last active time' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async getLastActiveTime(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getLastActiveTime(mobile);
        });
    }

    // System Operations
    @Post('disconnect-all')
    @ApiOperation({ summary: 'Disconnect all clients' })
    @ApiResponse({ status: 200, description: 'All clients disconnected successfully' })
    async disconnectAllClients() {
        return this.handleTelegramOperation(() =>
            this.telegramService.disconnectAll()
        );
    }

    // Enhanced Group Management
    @Post('group/create/:mobile')
    @ApiOperation({ summary: 'Create a new group with advanced options' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ description: 'Group creation options', type: 'object' })
    async createGroupWithOptions(
        @Param('mobile') mobile: string,
        @Body() options: GroupOptions
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.createGroupWithOptions(mobile, options);
        });
    }

    @Post('group/settings/:mobile')
    @ApiOperation({ summary: 'Update group settings' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ description: 'Group settings' })
    async updateGroupSettings(
        @Param('mobile') mobile: string,
        @Body() settings: {
            groupId: string;
            title?: string;
            description?: string;
            slowMode?: number;
            memberRestrictions?: any;
        }
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.updateGroupSettings(mobile, settings);
        });
    }

    // Message Scheduling
    @Post('messages/schedule/:mobile')
    @ApiOperation({ summary: 'Schedule a message' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async scheduleMessage(
        @Param('mobile') mobile: string,
        @Body() schedule: ScheduleMessageOptions
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.scheduleMessage(mobile, schedule);
        });
    }

    @Get('messages/scheduled/:mobile')
    @ApiOperation({ summary: 'Get scheduled messages' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async getScheduledMessages(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getScheduledMessages(mobile, chatId);
        });
    }

    // Enhanced Media Operations
    @Post('media/album/:mobile')
    @ApiOperation({ summary: 'Send media album (multiple photos/videos)' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async sendMediaAlbum(
        @Param('mobile') mobile: string,
        @Body() album: MediaAlbumOptions
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.sendMediaAlbum(mobile, album);
        });
    }

    @Post('media/voice/:mobile')
    @ApiOperation({ summary: 'Send voice message' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async sendVoiceMessage(
        @Param('mobile') mobile: string,
        @Body() voice: {
            chatId: string;
            url: string;
            duration?: number;
            caption?: string;
        }
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.sendVoiceMessage(mobile, voice);
        });
    }

    // Advanced Chat Operations
    @Post('chat/cleanup/:mobile')
    @ApiOperation({ summary: 'Clean up chat history' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async cleanupChat(
        @Param('mobile') mobile: string,
        @Body() cleanup: {
            chatId: string;
            beforeDate?: Date;
            onlyMedia?: boolean;
            excludePinned?: boolean;
        }
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.cleanupChat(mobile, cleanup);
        });
    }

    @Get('chat/statistics/:mobile')
    @ApiOperation({ summary: 'Get chat statistics' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async getChatStatistics(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string,
        @Query('period') period: 'day' | 'week' | 'month' = 'week'
    ): Promise<ChatStatistics> {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getChatStatistics(mobile, chatId, period);
        });
    }

    // Enhanced Privacy Features
    @Post('privacy/batch/:mobile')
    @ApiOperation({ summary: 'Update multiple privacy settings' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async updatePrivacyBatch(
        @Param('mobile') mobile: string,
        @Body() settings: {
            phoneNumber?: 'everybody' | 'contacts' | 'nobody';
            lastSeen?: 'everybody' | 'contacts' | 'nobody';
            profilePhotos?: 'everybody' | 'contacts' | 'nobody';
            forwards?: 'everybody' | 'contacts' | 'nobody';
            calls?: 'everybody' | 'contacts' | 'nobody';
            groups?: 'everybody' | 'contacts' | 'nobody';
        }
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.updatePrivacyBatch(mobile, settings);
        });
    }

    // Backup and Restore
    @Post('backup/:mobile')
    @ApiOperation({ summary: 'Create chat backup' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async createBackup(
        @Param('mobile') mobile: string,
        @Body() options: {
            chatIds?: string[];
            includeMedia?: boolean;
            exportFormat?: 'json' | 'html';
        }
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.createBackup(mobile, options);
        });
    }

    @Get('backup/:mobile/download')
    @ApiOperation({ summary: 'Download chat backup' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'backupId', description: 'Backup ID', required: true })
    async downloadBackup(
        @Param('mobile') mobile: string,
        @Query('backupId') backupId: string,
        @Res() res: Response
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            const result = await this.telegramService.createBackup(mobile, {
                chatIds: [backupId],
                includeMedia: true,
                exportFormat: 'json'
            });
            return res.download(result.path);
        });
    }

    @Get('backup/download/:mobile/:backupId')
    @ApiOperation({ summary: 'Download backup using backupId' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiParam({ name: 'backupId', description: 'Backup ID', required: true })
    async downloadExistingBackup(
        @Param('mobile') mobile: string,
        @Param('backupId') backupId: string,
        @Body() options: Omit<BackupOptions, 'backupId'>
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            const fullOptions: BackupOptions = {
                ...options,
                backupId
            };
            return this.telegramService.downloadBackup(mobile, fullOptions);
        });
    }

    @Get('backup/stats/:mobile')
    @ApiOperation({ summary: 'Get chat statistics for backup' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', description: 'Chat ID', required: true })
    @ApiQuery({ name: 'period', enum: ['day', 'week', 'month'], description: 'Statistics period', required: false })
    async getChatBackupStats(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string,
        @Query('period') period: 'day' | 'week' | 'month' = 'week'
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getChatStatistics(mobile, chatId, period);
        });
    }

    @Get('backup/list/:mobile')
    @ApiOperation({ summary: 'List available backups' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async listBackups(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            const backupsPath = path.join(process.cwd(), 'backups');
            if (!fs.existsSync(backupsPath)) {
                return [];
            }
            const backups = fs.readdirSync(backupsPath)
                .filter(dir => fs.statSync(path.join(backupsPath, dir)).isDirectory())
                .map(dir => {
                    const backupJsonPath = path.join(backupsPath, dir, 'backup.json');
                    if (fs.existsSync(backupJsonPath)) {
                        const backupData = JSON.parse(fs.readFileSync(backupJsonPath, 'utf-8'));
                        return {
                            backupId: dir,
                            timestamp: backupData.timestamp,
                            account: backupData.account,
                            chats: backupData.chats.length,
                            totalMessages: backupData.chats.reduce((sum, chat) => sum + chat.messages.length, 0)
                        };
                    }
                    return null;
                })
                .filter(backup => backup !== null && backup.account === mobile);
            return backups;
        });
    }

    @Delete('backup/:mobile')
    @ApiOperation({ summary: 'Delete a backup' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'backupId', description: 'Backup ID to delete', required: true })
    async deleteBackup(
        @Param('mobile') mobile: string,
        @Query('backupId') backupId: string
    ) {
        return this.handleTelegramOperation(async () => {
            const backupPath = path.join(process.cwd(), 'backups', backupId);
            if (!fs.existsSync(backupPath)) {
                throw new BadRequestException('Backup not found');
            }
            
            const backupJsonPath = path.join(backupPath, 'backup.json');
            if (fs.existsSync(backupJsonPath)) {
                const backupData = JSON.parse(fs.readFileSync(backupJsonPath, 'utf-8'));
                if (backupData.account !== mobile) {
                    throw new BadRequestException('Unauthorized to delete this backup');
                }
            }
            
            fs.rmSync(backupPath, { recursive: true, force: true });
            return { success: true, message: 'Backup deleted successfully' };
        });
    }

    @Post('batch-process/:mobile')
    @ApiOperation({ summary: 'Process messages in batches' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async processBatchMessages(
        @Param('mobile') mobile: string,
        @Body() batchOptions: {
            items: any[];
            batchSize: number;
            operation: string;
            delayMs?: number;
        }
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.processBatch(
                batchOptions.items,
                batchOptions.batchSize,
                async (batch) => {
                    // Execute the specified operation on each batch
                    switch (batchOptions.operation) {
                        case 'forward':
                            for (const item of batch) {
                                await this.telegramService.forwardMessage(mobile, item.chatId, item.messageId);
                            }
                            break;
                        case 'delete':
                            for (const item of batch) {
                                await this.telegramService.deleteChat(mobile, item.chatId);
                            }
                            break;
                        default:
                            throw new BadRequestException('Unsupported batch operation');
                    }
                },
                batchOptions.delayMs
            );
        });
    }

    @Get('chat/history/:mobile')
    @ApiOperation({ summary: 'Get chat history with metadata' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', description: 'Chat ID', required: true })
    @ApiQuery({ name: 'offset', description: 'Message offset', required: false })
    @ApiQuery({ name: 'limit', description: 'Number of messages', required: false })
    async getChatHistory(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string,
        @Query('offset') offset: number = 0,
        @Query('limit') limit: number = 20
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getMessagesNew(mobile, chatId, offset, limit);
        });
    }

    @Get('session/validate/:mobile')
    @ApiOperation({ summary: 'Validate session status' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async validateSession(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            const client = await this.telegramService.createClient(mobile);
            const isConnected = await client.connected();
            if (!isConnected) {
                await client.connect();
            }
            return {
                isValid: true,
                isConnected,
                phoneNumber: client.phoneNumber
            };
        });
    }

    // Group Member Management
    @Post('group/members/add/:mobile')
    @ApiOperation({ summary: 'Add members to a group' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async addGroupMembers(
        @Param('mobile') mobile: string,
        @Body() data: {
            groupId: string;
            members: string[];
        }
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.addGroupMembers(mobile, data.groupId, data.members);
        });
    }

    @Delete('group/members/remove/:mobile')
    @ApiOperation({ summary: 'Remove members from a group' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async removeGroupMembers(
        @Param('mobile') mobile: string,
        @Body() data: {
            groupId: string;
            members: string[];
        }
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.removeGroupMembers(mobile, data.groupId, data.members);
        });
    }

    @Post('group/admin/promote/:mobile')
    @ApiOperation({ summary: 'Promote group members to admin' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async promoteToAdmin(
        @Param('mobile') mobile: string,
        @Body() data: {
            groupId: string;
            userId: string;
            permissions?: {
                changeInfo?: boolean;
                postMessages?: boolean;
                editMessages?: boolean;
                deleteMessages?: boolean;
                banUsers?: boolean;
                inviteUsers?: boolean;
                pinMessages?: boolean;
                addAdmins?: boolean;
                anonymous?: boolean;
                manageCall?: boolean;
            };
            rank?: string;
        }
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.promoteToAdmin(mobile, data.groupId, data.userId, data.permissions, data.rank);
        });
    }

    @Post('group/admin/demote/:mobile')
    @ApiOperation({ summary: 'Demote group admin to regular member' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async demoteAdmin(
        @Param('mobile') mobile: string,
        @Body() data: {
            groupId: string;
            userId: string;
        }
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.demoteAdmin(mobile, data.groupId, data.userId);
        });
    }

    @Post('group/unblock/:mobile')
    @ApiOperation({ summary: 'Unblock a user in a group' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async unblockGroupUser(
        @Param('mobile') mobile: string,
        @Body() data: {
            groupId: string;
            userId: string;
        }
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.unblockGroupUser(mobile, data.groupId, data.userId);
        });
    }

    @Get('group/admins/:mobile')
    @ApiOperation({ summary: 'Get list of group admins' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'groupId', description: 'Group ID', required: true })
    async getGroupAdmins(
        @Param('mobile') mobile: string,
        @Query('groupId') groupId: string
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getGroupAdmins(mobile, groupId);
        });
    }

    @Get('group/banned/:mobile')
    @ApiOperation({ summary: 'Get list of banned users in a group' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'groupId', description: 'Group ID', required: true })
    async getGroupBannedUsers(
        @Param('mobile') mobile: string,
        @Query('groupId') groupId: string
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getGroupBannedUsers(mobile, groupId);
        });
    }

    // Advanced Contact Management
    @Post('contacts/export/:mobile')
    @ApiOperation({ summary: 'Export contacts in vCard or CSV format' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async exportContacts(
        @Param('mobile') mobile: string,
        @Body() exportOptions: ContactExportImportDto,
        @Res() res: Response
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            const data = await this.telegramService.exportContacts(
                mobile,
                exportOptions.format,
                exportOptions.includeBlocked
            );

            const filename = `contacts_${mobile}_${new Date().toISOString()}.${exportOptions.format}`;
            res.setHeader('Content-Type', exportOptions.format === 'vcard' ? 'text/vcard' : 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(data);
        });
    }

    @Post('contacts/import/:mobile')
    @ApiOperation({ summary: 'Import contacts from a list' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async importContacts(
        @Param('mobile') mobile: string,
        @Body() contacts: { firstName: string; lastName?: string; phone: string }[]
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.importContacts(mobile, contacts);
        });
    }

    @Post('contacts/block/:mobile')
    @ApiOperation({ summary: 'Manage blocked contacts' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async manageBlockList(
        @Param('mobile') mobile: string,
        @Body() blockList: ContactBlockListDto
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.manageBlockList(
                mobile,
                blockList.userIds,
                blockList.block
            );
        });
    }

    @Get('contacts/statistics/:mobile')
    @ApiOperation({ summary: 'Get contact activity statistics' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async getContactStatistics(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getContactStatistics(mobile);
        });
    }

    // Chat Folder Management
    @Post('folders/create/:mobile')
    @ApiOperation({ summary: 'Create a new chat folder' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async createChatFolder(
        @Param('mobile') mobile: string,
        @Body() folder: CreateChatFolderDto
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.createChatFolder(mobile, folder);
        });
    }

    @Get('folders/:mobile')
    @ApiOperation({ summary: 'Get all chat folders' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async getChatFolders(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getChatFolders(mobile);
        });
    }
}
