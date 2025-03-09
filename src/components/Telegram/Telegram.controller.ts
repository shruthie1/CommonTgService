import { Controller, Get, Post, Body, Param, Query, BadRequestException, Res, UsePipes, ValidationPipe, Delete, Put, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam, ApiBody, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { Response } from 'express';
import { TelegramService } from './Telegram.service';
import {
    SendMediaDto,
    SendMediaAlbumDto,
    GroupSettingsDto,
    GroupMemberOperationDto,
    AdminOperationDto,
    ChatCleanupDto,
    UpdateProfileDto,
    PrivacySettingsDto,
    ProfilePhotoDto,
    ScheduleMessageDto,
    BatchProcessDto,
    BatchOperationType,
    ForwardBatchDto,
    ContactExportImportDto,
    ContactBlockListDto,
    AddContactsDto,
    MediaType,
    createGroupDto,
    ViewOnceMediaDto,
    MediaSourceType
} from './dto';
import { MessageType } from './dto/message-search.dto';
import { MediaMetadataDto } from './dto/metadata-operations.dto';
import { CreateChatFolderDto } from './dto/create-chat-folder.dto';
import { MediaAlbumOptions } from './types/telegram-types';
import { ChatStatistics } from '../../interfaces/telegram';
import { ConnectionStatusDto } from './dto/common-responses.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import connectionManager from './utils/connection-manager';

@Controller('telegram')
@ApiTags('Telegram')
@UsePipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true
}))
export class TelegramController {
    constructor(private readonly telegramService: TelegramService) {}

    @Get('connect/:mobile')
    @ApiOperation({ summary: 'Connect to Telegram' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ status: 200, description: 'Successfully connected' })
    @ApiResponse({ status: 400, description: 'Connection failed' })
    async connect(@Param('mobile') mobile: string) {
        await connectionManager.getClient(mobile);
        return { message: 'Connected successfully' };
    }

    @Get('disconnect/:mobile')
    @ApiOperation({ summary: 'Disconnect from Telegram' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ status: 200, description: 'Successfully disconnected' })
    async disconnect(@Param('mobile') mobile: string) {
        await connectionManager.unregisterClient(mobile);
        return { message: 'Disconnected successfully' };
    }

    @Post('disconnect-all')
    @ApiOperation({ summary: 'Disconnect all clients' })
    @ApiResponse({ status: 200, description: 'All clients disconnected successfully' })
    async disconnectAllClients() {
        await connectionManager.disconnectAll();
        return { message: 'All clients disconnected successfully' };
    }

    // Profile Management
    @Get('me/:mobile')
    @ApiOperation({ summary: 'Get current user profile' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
    async getMe(@Param('mobile') mobile: string) {
        return this.telegramService.getMe(mobile);
    }

    @Get('entity/:mobile/:entity')
    @ApiOperation({ summary: 'Get Entity profile' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiParam({ name: 'entity', description: 'Entity identifier', required: true })
    @ApiResponse({ status: 200, description: 'Entity retrieved successfully' })
    async getEntity(@Param('mobile') mobile: string, @Param('entity') entity: string) {
        return this.telegramService.getEntity(mobile, entity);
    }

    @Post('profile/update/:mobile')
    @ApiOperation({ summary: 'Update profile information' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: UpdateProfileDto })
    async updateProfile(
        @Param('mobile') mobile: string,
        @Body() updateProfileDto: UpdateProfileDto
    ) {
        return this.telegramService.updateNameandBio(
            mobile,
            updateProfileDto.firstName,
            updateProfileDto.about
        );
    }

    @Post('profile/photo/:mobile')
    @ApiOperation({ summary: 'Set profile photo' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: ProfilePhotoDto })
    async setProfilePhoto(
        @Param('mobile') mobile: string,
        @Body() photoDto: ProfilePhotoDto
    ) {
        return this.telegramService.setProfilePic(mobile, photoDto.name);
    }

    @Delete('profile/photos/:mobile')
    @ApiOperation({ summary: 'Delete all profile photos' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async deleteProfilePhotos(@Param('mobile') mobile: string) {
        return this.telegramService.deleteProfilePhotos(mobile);
    }

    // Message Operations
    @Get('messages/:mobile')
    @ApiOperation({ summary: 'Get chat messages' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', required: true })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async getMessages(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string,
        @Query('limit') limit?: number
    ) {
        return this.telegramService.getMessages(mobile, chatId, limit);
    }

    @Post('messages/forward/:mobile')
    @ApiOperation({ summary: 'Forward messages' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: ForwardBatchDto })
    async forwardMessage(
        @Param('mobile') mobile: string,
        @Body() forwardDto: ForwardBatchDto
    ) {
        return this.telegramService.forwardBulkMessages(
            mobile,
            forwardDto.fromChatId,
            forwardDto.toChatId,
            forwardDto.messageIds
        );
    }

    @Post('batch-process/:mobile')
    @ApiOperation({ summary: 'Process operations in batches' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: BatchProcessDto })
    async processBatchMessages(
        @Param('mobile') mobile: string,
        @Body() batchOp: BatchProcessDto
    ) {
        return this.telegramService.processBatch(
            batchOp.items,
            batchOp.batchSize || 20,
            async (batch) => {
                switch (batchOp.operation) {
                    case BatchOperationType.FORWARD:
                        for (const item of batch) {
                            if ('messageId' in item && item.fromChatId && item.toChatId) {
                                await this.telegramService.forwardMessage(
                                    mobile,
                                    item.toChatId,
                                    item.fromChatId,
                                    item.messageId
                                );
                            }
                        }
                        break;
                    case BatchOperationType.DELETE:
                        for (const item of batch) {
                            await this.telegramService.deleteChat(mobile, item.chatId);
                        }
                        break;
                    default:
                        throw new BadRequestException('Unsupported batch operation');
                }
            },
            batchOp.delayMs
        );
    }

    @Get('messages/search/:mobile')
    @ApiOperation({ summary: 'Search messages in a chat' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', required: true })
    @ApiQuery({ name: 'query', required: false })
    @ApiQuery({ name: 'types', required: false, enum: MessageType, isArray: true })
    @ApiQuery({ name: 'limit', description: 'Number of messages to fetch', required: false, type: Number })
    @ApiQuery({ name: 'minId', required: false, type: Number })
    @ApiQuery({ name: 'maxId', required: false, type: Number })
    async searchMessages(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string,
        @Query('query') query: string,
        @Query('types') types?: MessageType[],
        @Query('limit') limit?: number,
        @Query('minId') minId?: number,
        @Query('maxId') maxId?: number,
    ) {
        return this.telegramService.searchMessages(mobile, { chatId, query, types, minId, maxId, limit });
    }

    // Channel Operations
    @Get('channels/:mobile')
    @ApiOperation({ summary: 'Get channel information' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'includeIds', required: false, type: Boolean })
    async getChannelInfo(
        @Param('mobile') mobile: string,
        @Query('includeIds') includeIds?: boolean
    ) {
        return this.telegramService.getChannelInfo(mobile, includeIds);
    }

    @Post('forwardMediatoMe/:mobile')
    @ApiOperation({ summary: 'Forward media messages to me' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'channel', description: 'Channel username or ID', required: false })
    @ApiQuery({ name: 'fromChatId', description: 'Source chat ID to forward messages from', required: false })
    async forwardMedia(
        @Param('mobile') mobile: string,
        @Query('channel') channel?: string,
        @Query('fromChatId') fromChatId?: string
    ) {
        await connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
        return this.telegramService.forwardMedia(
            mobile,
            channel,
            fromChatId
        );
    }

    @Post('channels/leave/:mobile')
    @ApiOperation({ summary: 'Leave channel' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'channel', description: 'Channel ID/username', required: true })
    async leaveChannel(
        @Param('mobile') mobile: string,
        @Query('channel') channel: string
    ) {
        return this.telegramService.leaveChannel(mobile, channel);
    }

    // Security & Privacy
    @Post('2fa/:mobile')
    @ApiOperation({ summary: 'Setup two-factor authentication' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async setup2FA(@Param('mobile') mobile: string) {
        return this.telegramService.set2Fa(mobile);
    }

    @Post('privacy/:mobile')
    @ApiOperation({ summary: 'Update privacy settings' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async updatePrivacy(@Param('mobile') mobile: string) {
        return this.telegramService.updatePrivacy(mobile);
    }

    @Post('privacy/batch/:mobile')
    @ApiOperation({ summary: 'Update multiple privacy settings' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: PrivacySettingsDto })
    async updatePrivacyBatch(
        @Param('mobile') mobile: string,
        @Body() settings: PrivacySettingsDto
    ) {
        return this.telegramService.updatePrivacyBatch(mobile, settings);
    }

    // Session Management
    @Get('sessions/:mobile')
    @ApiOperation({ summary: 'Get active sessions' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ status: 200, description: 'Active sessions retrieved successfully' })
    async getActiveSessions(@Param('mobile') mobile: string) {
        return this.telegramService.getAuths(mobile);
    }

    @Delete('sessions/:mobile')
    @ApiOperation({ summary: 'Terminate other sessions' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ status: 200, description: 'Other sessions terminated successfully' })
    async terminateOtherSessions(@Param('mobile') mobile: string) {
        return this.telegramService.removeOtherAuths(mobile);
    }

    @Post('sessions/new/:mobile')
    @ApiOperation({ summary: 'Create new session' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ status: 200, description: 'New session created successfully' })
    async createNewSession(@Param('mobile') mobile: string) {
        return this.telegramService.createNewSession(mobile);
    }

    @Get('session/info/:mobile')
    @ApiOperation({ summary: 'Get session information' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async getSessionInfo(@Param('mobile') mobile: string) {
        return this.telegramService.getSessionInfo(mobile);
    }

    @Post('session/terminate/:mobile')
    @ApiOperation({ summary: 'Terminate specific session' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async terminateSession(
        @Param('mobile') mobile: string,
        @Body() data: {
            hash: string;
            type: 'app' | 'web';
            exceptCurrent?: boolean;
        }
    ) {
        return this.telegramService.terminateSession(mobile, data);
    }

    // Monitoring & Health
    @Get('monitoring/status')
    @ApiOperation({ summary: 'Get service health and connection status' })
    @ApiResponse({ status: 200, type: ConnectionStatusDto })
    async getConnectionStatus() {
        return {
            status: await this.telegramService.getConnectionStatus()
        };
    }

    @Get('monitoring/calllog/:mobile')
    @ApiOperation({ summary: 'Get call log statistics' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async getCallLogStats(@Param('mobile') mobile: string) {
        return this.telegramService.getCallLog(mobile);
    }

    // Contact Management
    @Post('contacts/add-bulk/:mobile')
    @ApiOperation({ summary: 'Add multiple contacts in bulk' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: AddContactsDto })
    @ApiResponse({ status: 200, description: 'Contacts added successfully' })
    async addContactsBulk(
        @Param('mobile') mobile: string,
        @Body() contactsDto: AddContactsDto
    ) {
        return this.telegramService.addContacts(
            mobile,
            contactsDto.phoneNumbers,
            contactsDto.prefix
        );
    }

    @Get('contacts/:mobile')
    @ApiOperation({ summary: 'Get all contacts' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ status: 200, description: 'Contacts retrieved successfully' })
    async getContacts(@Param('mobile') mobile: string) {
        return await this.telegramService.getContacts(mobile);
    }

    //To Cleanup
    @Post('media/send/:mobile')
    @ApiOperation({ summary: 'Send media message' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: SendMediaDto })
    async sendMedia(
        @Param('mobile') mobile: string,
        @Body() sendMediaDto: SendMediaDto
    ) {
        const client = await connectionManager.getClient(mobile);
        if (sendMediaDto.type === MediaType.PHOTO) {
            return client.sendPhotoChat(
                sendMediaDto.chatId,
                sendMediaDto.url,
                sendMediaDto.caption,
                sendMediaDto.filename
            );
        }
        return client.sendFileChat(
            sendMediaDto.chatId,
            sendMediaDto.url,
            sendMediaDto.caption,
            sendMediaDto.filename
        );
    }

    @Get('media/download/:mobile')
    @ApiOperation({ summary: 'Download media from a message' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', required: true })
    @ApiQuery({ name: 'messageId', required: true })
    async downloadMedia(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string,
        @Query('messageId') messageId: number,
        @Res() res: Response
    ) {
        return this.telegramService.downloadMediaFile(mobile, messageId, chatId, res);
    }

    @Post('media/album/:mobile')
    @ApiOperation({ summary: 'Send media album (multiple photos/videos)' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: SendMediaAlbumDto })
    async sendMediaAlbum(
        @Param('mobile') mobile: string,
        @Body() albumDto: MediaAlbumOptions
    ) {
        return this.telegramService.sendMediaAlbum(mobile, albumDto);
    }

    @Get('media/metadata/:mobile')
    @ApiOperation({ summary: 'Get media metadata from a chat' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', required: true })
    @ApiQuery({ name: 'types', enum: ['photo', 'video', 'document'], required: false, isArray: true })
    @ApiQuery({ name: 'startDate', required: false })
    @ApiQuery({ name: 'endDate', required: false })
    @ApiQuery({ name: 'limit', description: 'Number of messages to fetch', required: false, type: Number })
    @ApiQuery({ name: 'minId', required: false, type: Number })
    @ApiQuery({ name: 'maxId', required: false, type: Number })
    async getMediaMetadata(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string,
        @Query('types') types?: ('photo' | 'video' | 'document' | 'voice')[],
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('limit') limit?: number,
        @Query('minId') minId?: number,
        @Query('maxId') maxId?: number,
        @Query('all') all?: boolean
    ) {
        return this.telegramService.getMediaMetadata(mobile, {
            chatId,
            types,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            limit,
            minId,
            maxId,
            all
        });
    }

    @Get('media/filter/:mobile')
    @ApiOperation({ summary: 'Get filtered media messages from a chat' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', required: true })
    @ApiQuery({ name: 'types', enum: ['photo', 'video', 'document'], required: false, isArray: true })
    @ApiQuery({ name: 'startDate', required: false })
    @ApiQuery({ name: 'endDate', required: false })
    @ApiQuery({ name: 'limit', description: 'Number of messages to fetch', required: false, type: Number })
    @ApiQuery({ name: 'minId', required: false, type: Number })
    @ApiQuery({ name: 'maxId', required: false, type: Number })
    @ApiResponse({ status: 200, type: [MediaMetadataDto] })
    async getFilteredMedia(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string,
        @Query('types') types?: ('photo' | 'video' | 'document' | 'voice')[],
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('limit') limit?: number,
        @Query('minId') minId?: number,
        @Query('maxId') maxId?: number
    ) {
        return this.telegramService.getFilteredMedia(mobile, {
            chatId,
            types,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            limit,
            minId,
            maxId
        });
    }

    @Get('group/members/:mobile')
    @ApiOperation({ summary: 'Get group members' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'groupId', description: 'Group ID', required: true })
    async getGroupMembers(
        @Param('mobile') mobile: string,
        @Query('groupId') groupId: string
    ) {
        return this.telegramService.getGrpMembers(mobile, groupId);
    }

    @Post('chat/block/:mobile')
    @ApiOperation({ summary: 'Block a chat/user' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', description: 'Chat/User ID to block', required: true })
    async blockChat(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string
    ) {
        return this.telegramService.blockUser(mobile, chatId);
    }

    @Delete('chat/:mobile')
    @ApiOperation({ summary: 'Delete a chat' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', description: 'Chat ID to delete', required: true })
    async deleteChatHistory(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string
    ) {
        return this.telegramService.deleteChat(mobile, chatId);
    }

    // Additional Message Operations
    @Get('messages/inline/:mobile')
    @ApiOperation({ summary: 'Send message with inline button' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', required: true })
    @ApiQuery({ name: 'message', required: true })
    @ApiQuery({ name: 'url', required: true })
    async sendMessageWithInlineButton(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string,
        @Query('message') message: string,
        @Query('url') url: string
    ) {
        return this.telegramService.sendInlineMessage(mobile, chatId, message, url);
    }

    // Dialog Management
    @Get('dialogs/:mobile')
    @ApiOperation({ summary: 'Get all dialogs' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'limit', description: 'Number of dialogs to fetch', required: false, type: Number })
    @ApiQuery({ name: 'offsetId', description: 'Number of dialogs to fetch', required: false, type: Number })
    @ApiQuery({ name: 'archived', description: 'Include archived chats', required: false, type: Boolean })
    async getAllDialogs(
        @Param('mobile') mobile: string,
        @Query('limit') limit: number = 500,
        @Query('offsetId') offsetId: number = 0,
        @Query('archived') archived: boolean = false
    ) {
        return this.telegramService.getDialogs(mobile, { limit, archived, offsetId });
    }

    @Get('last-active/:mobile')
    @ApiOperation({ summary: 'Get last active time' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ status: 200, description: 'Last active time retrieved successfully' })
    async getLastActiveTime(@Param('mobile') mobile: string) {
        return this.telegramService.getLastActiveTime(mobile);
    }

    // Enhanced Group Management
    @Post('group/create/:mobile')
    @ApiOperation({ summary: 'Create a new group with advanced options' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: createGroupDto })
    async createGroupWithOptions(
        @Param('mobile') mobile: string,
        @Body() options: createGroupDto
    ) {
        return this.telegramService.createGroupWithOptions(mobile, options);
    }

    @Post('group/settings/:mobile')
    @ApiOperation({ summary: 'Update group settings' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: GroupSettingsDto })
    async updateGroupSettings(
        @Param('mobile') mobile: string,
        @Body() settings: GroupSettingsDto
    ) {
        return this.telegramService.updateGroupSettings(mobile, settings);
    }

    @Post('group/members/:mobile')
    @ApiOperation({ summary: 'Add members to a group' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: GroupMemberOperationDto })
    async addGroupMembers(
        @Body() memberOp: GroupMemberOperationDto,
        @Param('mobile') mobile: string,
    ) {
        return this.telegramService.addGroupMembers(
            mobile,
            memberOp.groupId,
            memberOp.members
        );
    }

    @Delete('group/members/:mobile')
    @ApiOperation({ summary: 'Remove members from a group' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: GroupMemberOperationDto })
    async removeGroupMembers(
        @Body() memberOp: GroupMemberOperationDto,
        @Param('mobile') mobile: string,
    ) {
        return this.telegramService.removeGroupMembers(
            mobile,
            memberOp.groupId,
            memberOp.members
        );
    }

    @Post('group/admin/:mobile')
    @ApiOperation({ summary: 'Promote or demote group admins' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: AdminOperationDto })
    async handleAdminOperation(
        @Body() adminOp: AdminOperationDto,
        @Param('mobile') mobile: string
    ) {
        if (adminOp.isPromote) {
            return this.telegramService.promoteToAdmin(
                mobile,
                adminOp.groupId,
                adminOp.userId,
                adminOp.permissions,
                adminOp.rank
            );
        } else {
            return this.telegramService.demoteAdmin(
                mobile,
                adminOp.groupId,
                adminOp.userId
            );
        }
    }

    @Post('chat/cleanup/:mobile')
    @ApiOperation({ summary: 'Clean up chat history' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: ChatCleanupDto })
    async cleanupChat(
        @Param('mobile') mobile: string,
        @Body() cleanup: ChatCleanupDto
    ) {
        return this.telegramService.cleanupChat(mobile, {
            chatId: cleanup.chatId,
            beforeDate: cleanup.beforeDate ? new Date(cleanup.beforeDate) : undefined,
            onlyMedia: cleanup.onlyMedia,
            excludePinned: cleanup.excludePinned
        });
    }

    @Get('chat/statistics/:mobile')
    @ApiOperation({ summary: 'Get chat statistics' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', description: 'Chat ID', required: true })
    @ApiQuery({ name: 'period', enum: ['day', 'week', 'month'], description: 'Statistics period', required: false })
    async getChatStatistics(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string,
        @Query('period') period: 'day' | 'week' | 'month' = 'week'
    ): Promise<ChatStatistics> {
        return this.telegramService.getChatStatistics(mobile, chatId, period);
    }

    // Message Scheduling
    @Post('messages/schedule/:mobile')
    @ApiOperation({ summary: 'Schedule a message' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: ScheduleMessageDto })
    async scheduleMessage(
        @Param('mobile') mobile: string,
        @Body() schedule: ScheduleMessageDto
    ) {
        return this.telegramService.scheduleMessage(mobile, {
            chatId: schedule.chatId,
            message: schedule.message,
            scheduledTime: new Date(schedule.scheduledTime),
            replyTo: schedule.replyTo,
            silent: schedule.silent
        });
    }

    @Get('messages/scheduled/:mobile')
    @ApiOperation({ summary: 'Get scheduled messages' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', description: 'Chat ID', required: true })
    async getScheduledMessages(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string
    ) {
        return this.telegramService.getScheduledMessages(mobile, chatId);
    }

    // Enhanced Media Operations
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
        return this.telegramService.sendVoiceMessage(mobile, voice);
    }

    @Post('media/view-once/:mobile')
    @ApiOperation({ summary: 'Send a view once (disappearing) media message' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiConsumes('multipart/form-data', 'application/json')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                chatId: { type: 'string', description: 'Chat ID to send the media to' },
                sourceType: { type: 'string', enum: ['path', 'base64', 'binary'], description: 'Source type of media' },
                path: { type: 'string', description: 'path of the media file (when sourceType is Path)' },
                base64Data: { type: 'string', description: 'Base64 data (when sourceType is base64)' },
                binaryData: { type: 'string', format: 'binary', description: 'Binary file (when sourceType is binary)' },
                caption: { type: 'string', description: 'Optional caption for the media' },
                filename: { type: 'string', description: 'Optional filename for the media' }
            },
            required: ['chatId', 'sourceType']
        }
    })
    @UseInterceptors(FileInterceptor('binaryData', {
        storage: multer.memoryStorage()
    }))
    @ApiResponse({ status: 200, description: 'View once media sent successfully' })
    @ApiResponse({ status: 400, description: 'Failed to send view once media' })
    async sendViewOnceMedia(
        @Param('mobile') mobile: string,
        @UploadedFile() file: Express.Multer.File,
        @Body() viewOnceDto: ViewOnceMediaDto
    ) {

        // Handle file upload case
        if (viewOnceDto.sourceType === MediaSourceType.BINARY && file) {
            return this.telegramService.sendViewOnceMedia(mobile, {
                chatId: viewOnceDto.chatId,
                sourceType: viewOnceDto.sourceType,
                binaryData: file.buffer,
                caption: viewOnceDto.caption,
                filename: viewOnceDto.filename || file.originalname
            });
        }

        // Handle JSON payload case (URL or base64)
        return this.telegramService.sendViewOnceMedia(mobile, {
            chatId: viewOnceDto.chatId,
            sourceType: viewOnceDto.sourceType,
            path: viewOnceDto.path,
            base64Data: viewOnceDto.base64Data,
            caption: viewOnceDto.caption,
            filename: viewOnceDto.filename
        });
    }

    // Advanced Chat Operations
    @Get('chat/history/:mobile')
    @ApiOperation({ summary: 'Get chat history with metadata' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', required: true })
    @ApiQuery({ name: 'offset', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async getChatHistory(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string,
        @Query('offset') offset?: number,
        @Query('limit') limit?: number
    ) {
        return this.telegramService.getMessagesNew(mobile, chatId, offset, limit);
    }

    @Post('group/admin/promote/:mobile')
    @ApiOperation({ summary: 'Promote members to admin' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: AdminOperationDto })
    async promoteToAdmin(
        @Param('mobile') mobile: string,
        @Body() adminOp: AdminOperationDto
    ) {
        return this.telegramService.promoteToAdmin(
            mobile,
            adminOp.groupId,
            adminOp.userId,
            adminOp.permissions,
            adminOp.rank
        );
    }

    @Post('group/admin/demote/:mobile')
    @ApiOperation({ summary: 'Demote admin to regular member' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: GroupMemberOperationDto })
    async demoteAdmin(
        @Param('mobile') mobile: string,
        @Body() memberOp: GroupMemberOperationDto
    ) {
        return this.telegramService.demoteAdmin(
            mobile,
            memberOp.groupId,
            memberOp.members[0]
        );
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
        return this.telegramService.unblockGroupUser(mobile, data.groupId, data.userId);
    }

    @Get('group/admins/:mobile')
    @ApiOperation({ summary: 'Get list of group admins' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'groupId', description: 'Group ID', required: true })
    async getGroupAdmins(
        @Param('mobile') mobile: string,
        @Query('groupId') groupId: string
    ) {
        return this.telegramService.getGroupAdmins(mobile, groupId);
    }

    @Get('group/banned/:mobile')
    @ApiOperation({ summary: 'Get list of banned users in a group' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'groupId', description: 'Group ID', required: true })
    async getGroupBannedUsers(
        @Param('mobile') mobile: string,
        @Query('groupId') groupId: string
    ) {
        return this.telegramService.getGroupBannedUsers(mobile, groupId);
    }

    // Advanced Contact Management
    @Post('contacts/export/:mobile')
    @ApiOperation({ summary: 'Export contacts in vCard or CSV format' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: ContactExportImportDto })
    async exportContacts(
        @Param('mobile') mobile: string,
        @Body() exportDto: ContactExportImportDto,
        @Res() res: Response
    ) {
        const data = await this.telegramService.exportContacts(
            mobile,
            exportDto.format,
            exportDto.includeBlocked
        );

        const filename = `contacts_${mobile}_${new Date().toISOString()}.${exportDto.format}`;
        res.setHeader('Content-Type', exportDto.format === 'vcard' ? 'text/vcard' : 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(data);
    }

    @Post('contacts/import/:mobile')
    @ApiOperation({ summary: 'Import contacts from a list' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async importContacts(
        @Param('mobile') mobile: string,
        @Body() contacts: { firstName: string; lastName?: string; phone: string }[]
    ) {
        return this.telegramService.importContacts(mobile, contacts);
    }

    @Post('contacts/block/:mobile')
    @ApiOperation({ summary: 'Manage blocked contacts' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: ContactBlockListDto })
    async manageBlockList(
        @Param('mobile') mobile: string,
        @Body() blockList: ContactBlockListDto
    ) {
        return this.telegramService.manageBlockList(
            mobile,
            blockList.userIds,
            blockList.block
        );
    }

    @Get('contacts/statistics/:mobile')
    @ApiOperation({ summary: 'Get contact activity statistics' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ status: 200, description: 'Contact statistics retrieved successfully' })
    async getContactStatistics(@Param('mobile') mobile: string) {
        return this.telegramService.getContactStatistics(mobile);
    }

    // Chat Folder Management
    @Post('folders/create/:mobile')
    @ApiOperation({ summary: 'Create a new chat folder' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: CreateChatFolderDto })
    async createChatFolder(
        @Param('mobile') mobile: string,
        @Body() folder: CreateChatFolderDto
    ) {
        return this.telegramService.createChatFolder(mobile, folder);
    }

    @Get('folders/:mobile')
    @ApiOperation({ summary: 'Get all chat folders' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async getChatFolders(@Param('mobile') mobile: string) {
        return this.telegramService.getChatFolders(mobile);
    }

    @Put('messages/:mobile')
    @ApiOperation({ summary: 'Edit message' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async editMessage(
        @Param('mobile') mobile: string,
        @Body() options: {
            chatId: string;
            messageId: number;
            text?: string;
            media?: {
                type: 'photo' | 'video' | 'document';
                url: string;
            };
        }
    ) {
        return this.telegramService.editMessage(mobile, options);
    }

    @Post('chat/settings/:mobile')
    @ApiOperation({ summary: 'Update chat settings' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async updateChatSettings(
        @Param('mobile') mobile: string,
        @Body() settings: {
            chatId: string;
            title?: string;
            about?: string;
            photo?: string;
            slowMode?: number;
            linkedChat?: string;
            defaultSendAs?: string;
            username?: string;
        }
    ) {
        return this.telegramService.updateChatSettings(mobile, settings);
    }

    @Post('media/batch/:mobile')
    @ApiOperation({ summary: 'Send multiple media files in batch' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async sendMediaBatch(
        @Param('mobile') mobile: string,
        @Body() options: {
            chatId: string;
            media: Array<{
                type: 'photo' | 'video' | 'document';
                url: string;
                caption?: string;
                fileName?: string;
            }>;
            silent?: boolean;
            scheduleDate?: number;
        }
    ) {
        return this.telegramService.sendMediaBatch(mobile, options);
    }

    @Get('security/2fa-status/:mobile')
    @ApiOperation({ summary: 'Check if 2FA password is set' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async hasPassword(@Param('mobile') mobile: string) {
        return this.telegramService.hasPassword(mobile);
    }

    @Get('chats/:mobile')
    @ApiOperation({ summary: 'Get chats with advanced filtering' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async getChats(
        @Param('mobile') mobile: string,
        @Query('limit') limit?: number,
        @Query('offsetDate') offsetDate?: number,
        @Query('offsetId') offsetId?: number,
        @Query('offsetPeer') offsetPeer?: string,
        @Query('folderId') folderId?: number
    ) {
        return this.telegramService.getChats(mobile, {
            limit,
            offsetDate,
            offsetId,
            offsetPeer,
            folderId
        });
    }

    @Get('file/url/:mobile')
    @ApiOperation({ summary: 'Get downloadable URL for a file' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async getFileUrl(
        @Param('mobile') mobile: string,
        @Query('url') url: string,
        @Query('filename') filename: string
    ): Promise<string> {
        return this.telegramService.getFileUrl(mobile, url, filename);
    }

    @Get('messages/stats/:mobile')
    @ApiOperation({ summary: 'Get message statistics' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async getMessageStats(
        @Param('mobile') mobile: string,
        @Body() options: {
            chatId: string;
            period: 'day' | 'week' | 'month';
            fromDate?: Date;
        }
    ) {
        return this.telegramService.getMessageStats(mobile, options);
    }

    @Get('chats/top-private/:mobile')
    @ApiOperation({ summary: 'Get top 5 private chats with detailed statistics' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    async getTopPrivateChats(@Param('mobile') mobile: string) {
        return this.telegramService.getTopPrivateChats(mobile);
    }
}
