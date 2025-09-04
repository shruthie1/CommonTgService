import { Controller, Get, Post, Body, Param, Query, BadRequestException, Res, Delete, Put, UseInterceptors, UploadedFile, Patch } from '@nestjs/common';
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
    MediaSourceType,
    CreateBotDto
} from './dto';
import { MediaMetadataDto } from './dto/metadata-operations.dto';
import { CreateChatFolderDto } from './dto/create-chat-folder.dto';
import { MediaAlbumOptions } from './types/telegram-types';
import { ChatStatistics } from '../../interfaces/telegram';
import { ConnectionStatusDto, GetClientOptionsDto } from './dto/connection-management.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { connectionManager } from './utils/connection-manager';
import { SearchMessagesDto, SearchMessagesResponseDto } from './dto/message-search.dto';
import { DeleteHistoryDto } from './dto/delete-chat.dto';
import { UpdateUsernameDto } from './dto/update-username.dto';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('telegram')
@ApiTags('Telegram')
export class TelegramController {
    constructor(private readonly telegramService: TelegramService) {}

    @Get('connect/:mobile')
    @ApiOperation({ summary: 'Connect to Telegram' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'autoDisconnect', description: 'Whether to auto disconnect the client after period of inactivity', required: false, type: Boolean, default: true })
    @ApiQuery({ name: 'handler', description: 'Whether to use event handler', required: false, type: Boolean, default: true })
    @ApiResponse({ type: Object, schema: { properties: { message: { type: 'string' } } } })
    async connect(
        @Param('mobile') mobile: string,
        @Query('autoDisconnect') autoDisconnect?: boolean,
        @Query('handler') handler?: boolean,
    ): Promise<{ message: string }> {
        const options: GetClientOptionsDto = { autoDisconnect, handler };
        await this.telegramService.connect(mobile, options);
        return { message: 'Connected successfully' };
    }

    @Get('disconnect/:mobile')
    @ApiOperation({ summary: 'Disconnect from Telegram' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ type: Object, schema: { properties: { message: { type: 'string' } } } })
    async disconnect(@Param('mobile') mobile: string): Promise<{ message: string }> {
        await this.telegramService.disconnect(mobile);
        return { message: 'Disconnected successfully' };
    }

    @Get('disconnect-all')
    @ApiOperation({ summary: 'Disconnect all clients' })
    @ApiResponse({ type: Object, schema: { properties: { message: { type: 'string' } } } })
    async disconnectAll(): Promise<{ message: string }> {
        await this.telegramService.disconnectAll();
        return { message: 'All clients disconnected successfully' };
    }

    @Get('connection/stats')
    @ApiOperation({ summary: 'Get connection statistics' })
    getConnectionStats() {
        return this.telegramService.getConnectionStats();
    }

    @Get('connection/state/:mobile')
    @ApiOperation({ summary: 'Get connection state for a client' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ type: ConnectionStatusDto })
    getClientState(@Param('mobile') mobile: string): ConnectionStatusDto | undefined {
        return this.telegramService.getClientState(mobile);
    }

    @Get('connection/count')
    @ApiOperation({ summary: 'Get active connection count' })
    @ApiResponse({ type: Number })
    getActiveConnectionCount(): number {
        return this.telegramService.getActiveConnectionCount();
    }

    @Get('me/:mobile')
    @ApiOperation({ summary: 'Get current user profile' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ type: Object })
    async getMe(@Param('mobile') mobile: string) {
        return this.telegramService.getMe(mobile);
    }

    @Get('entity/:mobile/:entity')
    @ApiOperation({ summary: 'Get Entity profile' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiParam({ name: 'entity', description: 'Entity identifier', required: true })
    @ApiResponse({ type: Object })
    async getEntity(@Param('mobile') mobile: string, @Param('entity') entity: string) {
        return this.telegramService.getEntity(mobile, entity);
    }

    @Post('profile/update/:mobile')
    @ApiOperation({ summary: 'Update profile information' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: UpdateProfileDto })
    @ApiResponse({ type: Object })
    async updateProfile(@Param('mobile') mobile: string, @Body() updateProfileDto: UpdateProfileDto) {
        return this.telegramService.updateNameandBio(mobile, updateProfileDto.firstName, updateProfileDto.about);
    }

    @Post('profile/photo/:mobile')
    @ApiOperation({ summary: 'Set profile photo' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: ProfilePhotoDto })
    @ApiResponse({ type: Object })
    async setProfilePhoto(@Param('mobile') mobile: string, @Body() photoDto: ProfilePhotoDto) {
        return this.telegramService.setProfilePic(mobile, photoDto.name);
    }

    @Delete('profile/photos/:mobile')
    @ApiOperation({ summary: 'Delete all profile photos' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ type: Object })
    async deleteProfilePhotos(@Param('mobile') mobile: string) {
        return this.telegramService.deleteProfilePhotos(mobile);
    }

    @Get('messages/:mobile')
    @ApiOperation({ summary: 'Get chat messages' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', required: true })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiResponse({ type: Object })
    async getMessages(@Param('mobile') mobile: string, @Query('chatId') chatId: string, @Query('limit') limit?: number) {
        return this.telegramService.getMessages(mobile, chatId, limit);
    }

    @Post('message/:mobile')
    @ApiOperation({ summary: 'Send a Telegram message as a user' })
    @ApiParam({ name: 'mobile', description: 'Mobile number of the user account to send the message from', required: true })
    @ApiBody({ type: SendMessageDto })
    @ApiResponse({ type: Object })
    async sendMessage(@Param('mobile') mobile: string, @Body() dto: SendMessageDto) {
        return this.telegramService.sendMessage(mobile, dto);
    }

    @Post('messages/forward/:mobile')
    @ApiOperation({ summary: 'Forward messages' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: ForwardBatchDto })
    @ApiResponse({ type: Object })
    async forwardMessage(@Param('mobile') mobile: string, @Body() forwardDto: ForwardBatchDto) {
        return this.telegramService.forwardBulkMessages(mobile, forwardDto.fromChatId, forwardDto.toChatId, forwardDto.messageIds);
    }

    @Post('batch-process/:mobile')
    @ApiOperation({ summary: 'Process operations in batches' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: BatchProcessDto })
    @ApiResponse({ type: Object })
    async processBatchMessages(@Param('mobile') mobile: string, @Body() batchOp: BatchProcessDto) {
        return this.telegramService.processBatch(
            batchOp.items,
            batchOp.batchSize || 20,
            async (batch) => {
                switch (batchOp.operation) {
                    case BatchOperationType.FORWARD:
                        for (const item of batch) {
                            if ('messageId' in item && item.fromChatId && item.toChatId) {
                                await this.telegramService.forwardMessage(mobile, item.toChatId, item.fromChatId, item.messageId);
                            }
                        }
                        break;
                    case BatchOperationType.DELETE:
                        for (const item of batch) {
                            await this.telegramService.deleteChat(mobile, { peer: item.chatId, justClear: true });
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
    @ApiOperation({ summary: 'Search messages in Telegram', description: 'Search for messages in a specific chat or globally across all chats' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ type: SearchMessagesDto })
    @ApiResponse({ type: SearchMessagesResponseDto })
    async searchMessages(@Param('mobile') mobile: string, @Query() queryParams: SearchMessagesDto): Promise<SearchMessagesResponseDto> {
        return this.telegramService.searchMessages(mobile, queryParams);
    }

    @Get('channels/:mobile')
    @ApiOperation({ summary: 'Get channel information' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'includeIds', required: false, type: Boolean })
    @ApiResponse({ type: Object })
    async getChannelInfo(@Param('mobile') mobile: string, @Query('includeIds') includeIds?: boolean) {
        return this.telegramService.getChannelInfo(mobile, includeIds);
    }

    @Post('forwardMediatoMe/:mobile')
    @ApiOperation({ summary: 'Forward media messages to me' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'channel', description: 'Channel username or ID', required: false })
    @ApiQuery({ name: 'fromChatId', description: 'Source chat ID to forward messages from', required: false })
    @ApiResponse({ type: Object })
    async forwardMedia(@Param('mobile') mobile: string, @Query('channel') channel?: string, @Query('fromChatId') fromChatId?: string) {
        await connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
        return this.telegramService.forwardMedia(mobile, channel, fromChatId);
    }

    @Post('channels/leave/:mobile')
    @ApiOperation({ summary: 'Leave channel' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'channel', description: 'Channel ID/username', required: true })
    @ApiResponse({ type: Object })
    async leaveChannel(@Param('mobile') mobile: string, @Query('channel') channel: string) {
        return this.telegramService.leaveChannel(mobile, channel);
    }

    @Patch('username/:mobile')
    @ApiOperation({ summary: 'Update the Telegram username of a user' })
    @ApiParam({ name: 'mobile', description: 'Mobile number of the user whose username should be updated', required: true })
    @ApiBody({ type: UpdateUsernameDto })
    @ApiResponse({ type: Object })
    async updateUsername(@Param('mobile') mobile: string, @Body() updateUsernameDto: UpdateUsernameDto) {
        return this.telegramService.updateUsername(mobile, updateUsernameDto.newUsername);
    }

    @Post('2fa/:mobile')
    @ApiOperation({ summary: 'Setup two-factor authentication' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ type: Object })
    async setup2FA(@Param('mobile') mobile: string) {
        return this.telegramService.set2Fa(mobile);
    }

    @Post('privacy/:mobile')
    @ApiOperation({ summary: 'Update privacy settings' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ type: Object })
    async updatePrivacy(@Param('mobile') mobile: string) {
        return this.telegramService.updatePrivacy(mobile);
    }

    @Post('privacy/batch/:mobile')
    @ApiOperation({ summary: 'Update multiple privacy settings' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: PrivacySettingsDto })
    @ApiResponse({ type: Object })
    async updatePrivacyBatch(@Param('mobile') mobile: string, @Body() settings: PrivacySettingsDto) {
        return this.telegramService.updatePrivacyBatch(mobile, settings);
    }

    @Get('sessions/:mobile')
    @ApiOperation({ summary: 'Get active sessions' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ type: Object })
    async getActiveSessions(@Param('mobile') mobile: string) {
        return this.telegramService.getAuths(mobile);
    }

    @Delete('sessions/:mobile')
    @ApiOperation({ summary: 'Terminate other sessions' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ type: Object })
    async terminateOtherSessions(@Param('mobile') mobile: string) {
        return this.telegramService.removeOtherAuths(mobile);
    }

    @Post('sessions/new/:mobile')
    @ApiOperation({ summary: 'Create new session' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ type: Object })
    async createNewSession(@Param('mobile') mobile: string) {
        return this.telegramService.createNewSession(mobile);
    }

    @Get('session/info/:mobile')
    @ApiOperation({ summary: 'Get session information' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ type: Object })
    async getSessionInfo(@Param('mobile') mobile: string) {
        return this.telegramService.getSessionInfo(mobile);
    }

    @Post('session/terminate/:mobile')
    @ApiOperation({ summary: 'Terminate specific session' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ schema: { type: 'object', properties: { hash: { type: 'string' }, type: { type: 'string', enum: ['app', 'web'] }, exceptCurrent: { type: 'boolean' } } } })
    @ApiResponse({ type: Object })
    async terminateSession(@Param('mobile') mobile: string, @Body() data: { hash: string; type: 'app' | 'web'; exceptCurrent?: boolean }) {
        return this.telegramService.terminateSession(mobile, data);
    }

    @Get('monitoring/status')
    @ApiOperation({ summary: 'Get service health and connection status' })
    @ApiResponse({ type: ConnectionStatusDto })
    async getConnectionStatus() {
        return { status: await this.telegramService.getConnectionStatus() };
    }

    @Get('monitoring/calllog/:mobile')
    @ApiOperation({ summary: 'Get call log statistics' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ type: Object })
    async getCallLogStats(@Param('mobile') mobile: string) {
        return this.telegramService.getCallLog(mobile);
    }

    @Post('contacts/add-bulk/:mobile')
    @ApiOperation({ summary: 'Add multiple contacts in bulk' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: AddContactsDto })
    @ApiResponse({ type: Object })
    async addContactsBulk(@Param('mobile') mobile: string, @Body() contactsDto: AddContactsDto) {
        return this.telegramService.addContacts(mobile, contactsDto.phoneNumbers, contactsDto.prefix);
    }

    @Get('contacts/:mobile')
    @ApiOperation({ summary: 'Get all contacts' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ type: Object })
    async getContacts(@Param('mobile') mobile: string) {
        return this.telegramService.getContacts(mobile);
    }

    @Post('media/send/:mobile')
    @ApiOperation({ summary: 'Send media message' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: SendMediaDto })
    @ApiResponse({ type: Object })
    async sendMedia(@Param('mobile') mobile: string, @Body() sendMediaDto: SendMediaDto) {
        const client = await connectionManager.getClient(mobile);
        if (sendMediaDto.type === MediaType.PHOTO) {
            return client.sendPhotoChat(sendMediaDto.chatId, sendMediaDto.url, sendMediaDto.caption, sendMediaDto.filename);
        }
        return client.sendFileChat(sendMediaDto.chatId, sendMediaDto.url, sendMediaDto.caption, sendMediaDto.filename);
    }

    @Get('media/download/:mobile')
    @ApiOperation({ summary: 'Download media from a message' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', required: true })
    @ApiQuery({ name: 'messageId', required: true })
    @ApiResponse({ type: Object })
    async downloadMedia(@Param('mobile') mobile: string, @Query('chatId') chatId: string, @Query('messageId') messageId: number, @Res() res: Response) {
        return this.telegramService.downloadMediaFile(mobile, messageId, chatId, res);
    }

    @Post('media/album/:mobile')
    @ApiOperation({ summary: 'Send media album (multiple photos/videos)' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: SendMediaAlbumDto })
    @ApiResponse({ type: Object })
    async sendMediaAlbum(@Param('mobile') mobile: string, @Body() albumDto: MediaAlbumOptions) {
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
    @ApiQuery({ name: 'all', required: false, type: Boolean })
    @ApiResponse({ type: Object })
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
    @ApiQuery({ name: 'chatId', required: true, description: 'Chat ID to get media from' })
    @ApiQuery({ name: 'types', required: false, enum: ['photo', 'video', 'document', 'voice'], isArray: true })
    @ApiQuery({ name: 'startDate', required: false, description: 'Filter media after this date' })
    @ApiQuery({ name: 'endDate', required: false, description: 'Filter media before this date' })
    @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of media items to fetch' })
    @ApiQuery({ name: 'minId', required: false, type: Number, description: 'Minimum message ID' })
    @ApiQuery({ name: 'maxId', required: false, type: Number, description: 'Maximum message ID' })
    @ApiResponse({ type: [MediaMetadataDto] })
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
    @ApiResponse({ type: Object })
    async getGroupMembers(@Param('mobile') mobile: string, @Query('groupId') groupId: string) {
        return this.telegramService.getGrpMembers(mobile, groupId);
    }

    @Post('chat/block/:mobile')
    @ApiOperation({ summary: 'Block a chat/user' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', description: 'Chat/User ID to block', required: true })
    @ApiResponse({ type: Object })
    async blockChat(@Param('mobile') mobile: string, @Query('chatId') chatId: string) {
        return this.telegramService.blockUser(mobile, chatId);
    }

    @Delete('chat/:mobile')
    @ApiOperation({ summary: 'Delete or clear a chat history for a user' })
    @ApiParam({ name: 'mobile', description: 'Mobile number of the user whose chat should be deleted', required: true })
    @ApiQuery({ name: 'peer', description: 'Username or Peer ID of the chat to delete', required: true })
    @ApiQuery({ name: 'maxId', required: false, description: 'Delete messages with ID ≤ maxId' })
    @ApiQuery({ name: 'justClear', required: false, description: 'Only clear history for this user', type: Boolean })
    @ApiQuery({ name: 'revoke', required: false, description: 'Delete for everyone if possible', type: Boolean })
    @ApiQuery({ name: 'minDate', required: false, description: 'Minimum date (UNIX timestamp)' })
    @ApiQuery({ name: 'maxDate', required: false, description: 'Maximum date (UNIX timestamp)' })
    @ApiResponse({ type: Object })
    async deleteChatHistory(@Param('mobile') mobile: string, @Query() deleteHistoryDto: DeleteHistoryDto) {
        return this.telegramService.deleteChat(mobile, deleteHistoryDto);
    }

    @Get('messages/inline/:mobile')
    @ApiOperation({ summary: 'Send message with inline button' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', required: true })
    @ApiQuery({ name: 'message', required: true })
    @ApiQuery({ name: 'url', required: true })
    @ApiResponse({ type: Object })
    async sendMessageWithInlineButton(@Param('mobile') mobile: string, @Query('chatId') chatId: string, @Query('message') message: string, @Query('url') url: string) {
        return this.telegramService.sendInlineMessage(mobile, chatId, message, url);
    }

    @Get('dialogs/:mobile')
    @ApiOperation({ summary: 'Get all dialogs' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of dialogs to fetch', default: 500 })
    @ApiQuery({ name: 'offsetId', required: false, type: Number, description: 'Offset ID for pagination', default: 0 })
    @ApiQuery({ name: 'archived', required: false, type: Boolean, description: 'Include archived chats', default: false })
    @ApiResponse({ type: Object })
    async getAllDialogs(@Param('mobile') mobile: string, @Query('limit') limit: number = 500, @Query('offsetId') offsetId: number = 0, @Query('archived') archived: boolean = false) {
        return this.telegramService.getDialogs(mobile, { limit, archived, offsetId });
    }

    @Get('last-active/:mobile')
    @ApiOperation({ summary: 'Get last active time' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ type: Object })
    async getLastActiveTime(@Param('mobile') mobile: string) {
        return this.telegramService.getLastActiveTime(mobile);
    }

    @Post('group/create/:mobile')
    @ApiOperation({ summary: 'Create a new group with advanced options' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: createGroupDto })
    @ApiResponse({ type: Object })
    async createGroupWithOptions(@Param('mobile') mobile: string, @Body() options: createGroupDto) {
        return this.telegramService.createGroupWithOptions(mobile, options);
    }

    @Post('group/settings/:mobile')
    @ApiOperation({ summary: 'Update group settings' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: GroupSettingsDto })
    @ApiResponse({ type: Object })
    async updateGroupSettings(@Param('mobile') mobile: string, @Body() settings: GroupSettingsDto) {
        return this.telegramService.updateGroupSettings(mobile, settings);
    }

    @Post('group/members/:mobile')
    @ApiOperation({ summary: 'Add members to a group' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: GroupMemberOperationDto })
    @ApiResponse({ type: Object })
    async addGroupMembers(@Body() memberOp: GroupMemberOperationDto, @Param('mobile') mobile: string) {
        return this.telegramService.addGroupMembers(mobile, memberOp.groupId, memberOp.members);
    }

    @Delete('group/members/:mobile')
    @ApiOperation({ summary: 'Remove members from a group' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: GroupMemberOperationDto })
    @ApiResponse({ type: Object })
    async removeGroupMembers(@Body() memberOp: GroupMemberOperationDto, @Param('mobile') mobile: string) {
        return this.telegramService.removeGroupMembers(mobile, memberOp.groupId, memberOp.members);
    }

    @Post('group/admin/:mobile')
    @ApiOperation({ summary: 'Promote or demote group admins' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: AdminOperationDto })
    @ApiResponse({ type: Object })
    async handleAdminOperation(@Body() adminOp: AdminOperationDto, @Param('mobile') mobile: string) {
        if (adminOp.isPromote) {
            return this.telegramService.promoteToAdmin(mobile, adminOp.groupId, adminOp.userId, adminOp.permissions, adminOp.rank);
        } else {
            return this.telegramService.demoteAdmin(mobile, adminOp.groupId, adminOp.userId);
        }
    }

    @Post('chat/cleanup/:mobile')
    @ApiOperation({ summary: 'Clean up chat history' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: ChatCleanupDto })
    @ApiResponse({ type: Object })
    async cleanupChat(@Param('mobile') mobile: string, @Body() cleanup: ChatCleanupDto) {
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
    async getChatStatistics(@Param('mobile') mobile: string, @Query('chatId') chatId: string, @Query('period') period: 'day' | 'week' | 'month' = 'week'): Promise<ChatStatistics> {
        return this.telegramService.getChatStatistics(mobile, chatId, period);
    }

    @Post('messages/schedule/:mobile')
    @ApiOperation({ summary: 'Schedule a message' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: ScheduleMessageDto })
    @ApiResponse({ type: Object })
    async scheduleMessage(@Param('mobile') mobile: string, @Body() schedule: ScheduleMessageDto) {
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
    @ApiResponse({ type: Object })
    async getScheduledMessages(@Param('mobile') mobile: string, @Query('chatId') chatId: string) {
        return this.telegramService.getScheduledMessages(mobile, chatId);
    }

    @Post('media/voice/:mobile')
    @ApiOperation({ summary: 'Send voice message' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ schema: { type: 'object', properties: { chatId: { type: 'string' }, url: { type: 'string' }, duration: { type: 'number' }, caption: { type: 'string' } } } })
    @ApiResponse({ type: Object })
    async sendVoiceMessage(@Param('mobile') mobile: string, @Body() voice: { chatId: string; url: string; duration?: number; caption?: string }) {
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
    @UseInterceptors(FileInterceptor('binaryData', { storage: multer.memoryStorage() }))
    @ApiResponse({ type: Object })
    async sendViewOnceMedia(@Param('mobile') mobile: string, @UploadedFile() file: Express.Multer.File, @Body() viewOnceDto: ViewOnceMediaDto) {
        if (viewOnceDto.sourceType === MediaSourceType.BINARY && file) {
            return this.telegramService.sendViewOnceMedia(mobile, {
                chatId: viewOnceDto.chatId,
                sourceType: viewOnceDto.sourceType,
                binaryData: file.buffer,
                caption: viewOnceDto.caption,
                filename: viewOnceDto.filename || file.originalname
            });
        }
        return this.telegramService.sendViewOnceMedia(mobile, {
            chatId: viewOnceDto.chatId,
            sourceType: viewOnceDto.sourceType,
            path: viewOnceDto.path,
            base64Data: viewOnceDto.base64Data,
            caption: viewOnceDto.caption,
            filename: viewOnceDto.filename
        });
    }

    @Get('chat/history/:mobile')
    @ApiOperation({ summary: 'Get chat history with metadata' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', required: true })
    @ApiQuery({ name: 'offset', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiResponse({ type: Object })
    async getChatHistory(@Param('mobile') mobile: string, @Query('chatId') chatId: string, @Query('offset') offset?: number, @Query('limit') limit?: number) {
        return this.telegramService.getMessagesNew(mobile, chatId, offset, limit);
    }

    @Post('group/admin/promote/:mobile')
    @ApiOperation({ summary: 'Promote members to admin' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: AdminOperationDto })
    @ApiResponse({ type: Object })
    async promoteToAdmin(@Param('mobile') mobile: string, @Body() adminOp: AdminOperationDto) {
        return this.telegramService.promoteToAdmin(mobile, adminOp.groupId, adminOp.userId, adminOp.permissions, adminOp.rank);
    }

    @Post('group/admin/demote/:mobile')
    @ApiOperation({ summary: 'Demote admin to regular member' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: GroupMemberOperationDto })
    @ApiResponse({ type: Object })
    async demoteAdmin(@Param('mobile') mobile: string, @Body() memberOp: GroupMemberOperationDto) {
        return this.telegramService.demoteAdmin(mobile, memberOp.groupId, memberOp.members[0]);
    }

    @Post('group/unblock/:mobile')
    @ApiOperation({ summary: 'Unblock a user in a group' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ schema: { type: 'object', properties: { groupId: { type: 'string' }, userId: { type: 'string' } } } })
    @ApiResponse({ type: Object })
    async unblockGroupUser(@Param('mobile') mobile: string, @Body() data: { groupId: string; userId: string }) {
        return this.telegramService.unblockGroupUser(mobile, data.groupId, data.userId);
    }

    @Get('group/admins/:mobile')
    @ApiOperation({ summary: 'Get list of group admins' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'groupId', description: 'Group ID', required: true })
    @ApiResponse({ type: Object })
    async getGroupAdmins(@Param('mobile') mobile: string, @Query('groupId') groupId: string) {
        return this.telegramService.getGroupAdmins(mobile, groupId);
    }

    @Get('group/banned/:mobile')
    @ApiOperation({ summary: 'Get list of banned users in a group' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'groupId', description: 'Group ID', required: true })
    @ApiResponse({ type: Object })
    async getGroupBannedUsers(@Param('mobile') mobile: string, @Query('groupId') groupId: string) {
        return this.telegramService.getGroupBannedUsers(mobile, groupId);
    }

    @Post('contacts/export/:mobile')
    @ApiOperation({ summary: 'Export contacts in vCard or CSV format' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: ContactExportImportDto })
    @ApiResponse({ type: Object })
    async exportContacts(@Param('mobile') mobile: string, @Body() exportDto: ContactExportImportDto, @Res() res: Response) {
        const data = await this.telegramService.exportContacts(mobile, exportDto.format, exportDto.includeBlocked);
        const filename = `contacts_${mobile}_${new Date().toISOString()}.${exportDto.format}`;
        res.setHeader('Content-Type', exportDto.format === 'vcard' ? 'text/vcard' : 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(data);
    }

    @Post('contacts/import/:mobile')
    @ApiOperation({ summary: 'Import contacts from a list' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ schema: { type: 'array', items: { type: 'object', properties: { firstName: { type: 'string' }, lastName: { type: 'string' }, phone: { type: 'string' } } } } })
    @ApiResponse({ type: Object })
    async importContacts(@Param('mobile') mobile: string, @Body() contacts: { firstName: string; lastName?: string; phone: string }[]) {
        return this.telegramService.importContacts(mobile, contacts);
    }

    @Post('contacts/block/:mobile')
    @ApiOperation({ summary: 'Manage blocked contacts' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: ContactBlockListDto })
    @ApiResponse({ type: Object })
    async manageBlockList(@Param('mobile') mobile: string, @Body() blockList: ContactBlockListDto) {
        return this.telegramService.manageBlockList(mobile, blockList.userIds, blockList.block);
    }

    @Get('contacts/statistics/:mobile')
    @ApiOperation({ summary: 'Get contact activity statistics' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ type: Object })
    async getContactStatistics(@Param('mobile') mobile: string) {
        return this.telegramService.getContactStatistics(mobile);
    }

    @Post('folders/create/:mobile')
    @ApiOperation({ summary: 'Create a new chat folder' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: CreateChatFolderDto })
    @ApiResponse({ type: Object })
    async createChatFolder(@Param('mobile') mobile: string, @Body() folder: CreateChatFolderDto) {
        return this.telegramService.createChatFolder(mobile, folder);
    }

    @Get('folders/:mobile')
    @ApiOperation({ summary: 'Get all chat folders' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ type: Object })
    async getChatFolders(@Param('mobile') mobile: string) {
        return this.telegramService.getChatFolders(mobile);
    }

    @Put('messages/:mobile')
    @ApiOperation({ summary: 'Edit message' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ schema: { type: 'object', properties: { chatId: { type: 'string' }, messageId: { type: 'number' }, text: { type: 'string' }, media: { type: 'object', properties: { type: { type: 'string', enum: ['photo', 'video', 'document'] }, url: { type: 'string' } } } } } })
    @ApiResponse({ type: Object })
    async editMessage(@Param('mobile') mobile: string, @Body() options: { chatId: string; messageId: number; text?: string; media?: { type: 'photo' | 'video' | 'document'; url: string } }) {
        return this.telegramService.editMessage(mobile, options);
    }

    @Post('chat/settings/:mobile')
    @ApiOperation({ summary: 'Update chat settings' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ schema: { type: 'object', properties: { chatId: { type: 'string' }, title: { type: 'string' }, about: { type: 'string' }, photo: { type: 'string' }, slowMode: { type: 'number' }, linkedChat: { type: 'string' }, defaultSendAs: { type: 'string' }, username: { type: 'string' } } } })
    @ApiResponse({ type: Object })
    async updateChatSettings(@Param('mobile') mobile: string, @Body() settings: { chatId: string; title?: string; about?: string; photo?: string; slowMode?: number; linkedChat?: string; defaultSendAs?: string; username?: string }) {
        return this.telegramService.updateChatSettings(mobile, settings);
    }

    @Post('media/batch/:mobile')
    @ApiOperation({ summary: 'Send multiple media files in batch' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ schema: { type: 'object', properties: { chatId: { type: 'string' }, media: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ['photo', 'video', 'document'] }, url: { type: 'string' }, caption: { type: 'string' }, fileName: { type: 'string' } } } }, silent: { type: 'boolean' }, scheduleDate: { type: 'number' } } } })
    @ApiResponse({ type: Object })
    async sendMediaBatch(@Param('mobile') mobile: string, @Body() options: { chatId: string; media: Array<{ type: 'photo' | 'video' | 'document'; url: string; caption?: string; fileName?: string }>; silent?: boolean; scheduleDate?: number }) {
        return this.telegramService.sendMediaBatch(mobile, options);
    }

    @Get('security/2fa-status/:mobile')
    @ApiOperation({ summary: 'Check if 2FA password is set' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ type: Object })
    async hasPassword(@Param('mobile') mobile: string) {
        return this.telegramService.hasPassword(mobile);
    }

    @Get('chats/:mobile')
    @ApiOperation({ summary: 'Get chats with advanced filtering' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'offsetDate', required: false, type: Number })
    @ApiQuery({ name: 'offsetId', required: false, type: Number })
    @ApiQuery({ name: 'offsetPeer', required: false, type: String })
    @ApiQuery({ name: 'folderId', required: false, type: Number })
    @ApiResponse({ type: Object })
    async getChats(@Param('mobile') mobile: string, @Query('limit') limit?: number, @Query('offsetDate') offsetDate?: number, @Query('offsetId') offsetId?: number, @Query('offsetPeer') offsetPeer?: string, @Query('folderId') folderId?: number) {
        return this.telegramService.getChats(mobile, { limit, offsetDate, offsetId, offsetPeer, folderId });
    }

    @Get('file/url/:mobile')
    @ApiOperation({ summary: 'Get downloadable URL for a file' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'url', required: true })
    @ApiQuery({ name: 'filename', required: true })
    @ApiResponse({ type: String })
    async getFileUrl(@Param('mobile') mobile: string, @Query('url') url: string, @Query('filename') filename: string): Promise<string> {
        return this.telegramService.getFileUrl(mobile, url, filename);
    }

    @Get('messages/stats/:mobile')
    @ApiOperation({ summary: 'Get message statistics' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ schema: { type: 'object', properties: { chatId: { type: 'string' }, period: { type: 'string', enum: ['day', 'week', 'month'] }, fromDate: { type: 'string', format: 'date-time' } } } })
    @ApiResponse({ type: Object })
    async getMessageStats(@Param('mobile') mobile: string, @Body() options: { chatId: string; period: 'day' | 'week' | 'month'; fromDate?: Date }) {
        return this.telegramService.getMessageStats(mobile, options);
    }

    @Get('chats/top-private/:mobile')
    @ApiOperation({ summary: 'Get top 5 private chats with detailed statistics' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ type: Object })
    async getTopPrivateChats(@Param('mobile') mobile: string) {
        return this.telegramService.getTopPrivateChats(mobile);
    }

    @Post('bots/add-to-channel/:mobile')
    @ApiOperation({ summary: 'Add bots to channel with admin privileges' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ schema: { type: 'object', properties: { channelIds: { type: 'array', items: { type: 'string' }, description: 'Array of channel IDs to add bots to. If not provided, will use default channels from environment variables.' } } } })
    @ApiResponse({ type: Object })
    async addBotsToChannel(@Param('mobile') mobile: string, @Body() body: { channelIds?: string[] }) {
        return this.telegramService.addBotsToChannel(mobile, body.channelIds);
    }

    @Post('bot/create/:mobile')
    @ApiOperation({ summary: 'Create a new bot using BotFather' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: CreateBotDto })
    @ApiResponse({ type: Object, schema: { properties: { botToken: { type: 'string', description: 'The token to access HTTP Bot API' }, username: { type: 'string', description: 'The username of the created bot' } } } })
    async createBot(@Param('mobile') mobile: string, @Body() createBotDto: CreateBotDto) {
        return this.telegramService.createBot(mobile, createBotDto);
    }
}