import { Controller, Get, Post, Body, Param, Query, BadRequestException, Res, UsePipes, ValidationPipe, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam, ApiBody, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { TelegramService } from './Telegram.service';
import {
    SendMediaDto,
    MediaDownloadDto,
    SendMediaAlbumDto,
    MediaSearchDto,
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
    MediaType
} from './dto';
import { MessageType } from './dto/message-search.dto';
import { MediaMetadataDto } from './dto/metadata-operations.dto';
import { CreateChatFolderDto } from './dto/create-chat-folder.dto';
import { MediaAlbumOptions } from './types/telegram-types';
import { ChatStatistics } from 'src/interfaces/telegram';
import { ConnectionStatusDto } from './dto/common-responses.dto';

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

    @Post('disconnect-all')
    @ApiOperation({ summary: 'Disconnect all clients' })
    @ApiResponse({ status: 200, description: 'All clients disconnected successfully' })
    async disconnectAllClients() {
        return this.handleTelegramOperation(() =>
            this.telegramService.disconnectAll()
        );
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

    @Get('entity/:mobile/:entity')
    @ApiOperation({ summary: 'Get Entity profile' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiParam({ name: 'entity', description: 'Entity identifier', required: true })
    @ApiResponse({ status: 200, description: 'Entity retrieved successfully' })
    async getEntity(@Param('mobile') mobile: string, @Param('entity') entity: string) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getEntity(mobile, entity);
        });
    }

    @Post('profile/update/:mobile')
    @ApiOperation({ summary: 'Update profile information' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: UpdateProfileDto })
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
    @ApiBody({ type: ProfilePhotoDto })
    async setProfilePhoto(
        @Param('mobile') mobile: string,
        @Body() photoDto: ProfilePhotoDto
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.setProfilePic(mobile, photoDto.name);
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
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getMessages(mobile, chatId, limit);
        });
    }

    @Post('messages/forward/:mobile')
    @ApiOperation({ summary: 'Forward messages' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: ForwardBatchDto })
    async forwardMessage(
        @Param('mobile') mobile: string,
        @Body() forwardDto: ForwardBatchDto
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.forwardBulkMessages(
                mobile,
                forwardDto.fromChatId,
                forwardDto.toChatId,
                forwardDto.messageIds
            );
        });
    }

    @Post('batch-process/:mobile')
    @ApiOperation({ summary: 'Process operations in batches' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: BatchProcessDto })
    async processBatchMessages(
        @Param('mobile') mobile: string,
        @Body() batchOp: BatchProcessDto
    ) {
        await this.telegramService.createClient(mobile);
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

    @Post('messages/bulk-forward/:mobile')
    @ApiOperation({ summary: 'Forward multiple messages' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: ForwardBatchDto })
    async forwardBulkMessages(
        @Param('mobile') mobile: string,
        @Body() bulkOp: ForwardBatchDto
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
    @ApiQuery({ name: 'chatId', required: true })
    @ApiQuery({ name: 'query', required: true })
    @ApiQuery({ name: 'types', required: false, enum: MessageType, isArray: true })
    @ApiQuery({ name: 'offset', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async searchMessages(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string,
        @Query('query') query: string,
        @Query('types') types?: MessageType[],
        @Query('offset') offset?: number,
        @Query('limit') limit: number = 20
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.searchMessages(mobile, { chatId, query, types, offset, limit });
        });
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
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getChannelInfo(mobile, includeIds);
        });
    }

    @Post('channels/join/:mobile')
    @ApiOperation({ summary: 'Join channel' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiParam({ name: 'channel', description: 'Channel username or ID', required: true })
    @ApiQuery({ name: 'forward', description: 'Whether to forward messages after joining', required: false, type: Boolean })
    @ApiQuery({ name: 'fromChatId', description: 'Source chat ID to forward messages from', required: false })
    async joinChannel(
        @Param('mobile') mobile: string,
        @Param('channel') channel: string,
        @Query('forward') forward?: boolean,
        @Query('fromChatId') fromChatId?: string
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            if (forward && fromChatId) {
                return this.telegramService.joinChannelAndForward(
                    mobile,
                    fromChatId,
                    channel
                );
            }
            return this.telegramService.joinChannel(mobile, channel);
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

    @Post('privacy/batch/:mobile')
    @ApiOperation({ summary: 'Update multiple privacy settings' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: PrivacySettingsDto })
    async updatePrivacyBatch(
        @Param('mobile') mobile: string,
        @Body() settings: PrivacySettingsDto
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.updatePrivacyBatch(mobile, settings);
        });
    }

    // Session Management
    @Get('sessions/:mobile')
    @ApiOperation({ summary: 'Get active sessions' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ status: 200, description: 'Active sessions retrieved successfully' })
    async getActiveSessions(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getAuths(mobile);
        });
    }

    @Delete('sessions/:mobile')
    @ApiOperation({ summary: 'Terminate other sessions' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ status: 200, description: 'Other sessions terminated successfully' })
    async terminateOtherSessions(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.removeOtherAuths(mobile);
        });
    }

    @Post('sessions/new/:mobile')
    @ApiOperation({ summary: 'Create new session' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ status: 200, description: 'New session created successfully' })
    async createNewSession(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.createNewSession(mobile);
        });
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

    @Get('monitoring/client/:mobile')
    @ApiOperation({ summary: 'Get client metadata' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ status: 200, description: 'Client metadata retrieved successfully' })
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
    @Post('contacts/add-bulk/:mobile')
    @ApiOperation({ summary: 'Add multiple contacts in bulk' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: AddContactsDto })
    @ApiResponse({ status: 200, description: 'Contacts added successfully' })
    async addContactsBulk(
        @Param('mobile') mobile: string,
        @Body() contactsDto: AddContactsDto
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.addContacts(
                mobile,
                contactsDto.phoneNumbers,
                contactsDto.prefix
            );
        });
    }

    @Get('contacts/:mobile')
    @ApiOperation({ summary: 'Get all contacts' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ status: 200, description: 'Contacts retrieved successfully' })
    async getContacts(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            const client = await this.telegramService.createClient(mobile);
            return client.getContacts();
        });
    }

    // Media Operations
    @Get('media/info/:mobile')
    @ApiOperation({ summary: 'Get media messages info' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', required: true })
    @ApiQuery({ name: 'types', required: false, enum: MediaType, isArray: true })
    @ApiQuery({ name: 'offset', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async getMediaInfo(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string,
        @Query('types') types?: MediaType[],
        @Query('offset') offset?: number,
        @Query('limit') limit?: number
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getMediaMetadata(mobile, chatId, offset, limit);
        });
    }

    @Post('media/send/:mobile')
    @ApiOperation({ summary: 'Send media message' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: SendMediaDto })
    async sendMedia(
        @Param('mobile') mobile: string,
        @Body() sendMediaDto: SendMediaDto
    ) {
        return this.handleTelegramOperation(async () => {
            const client = await this.telegramService.createClient(mobile);
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
        });
    }

    @Post('media/download/:mobile')
    @ApiOperation({ summary: 'Download media from a message' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: MediaDownloadDto })
    async downloadMedia(
        @Param('mobile') mobile: string,
        @Body() downloadDto: MediaDownloadDto,
        @Res() res: Response
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.downloadMediaFile(mobile, downloadDto.messageId, downloadDto.chatId, res);
        });
    }

    @Post('media/album/:mobile')
    @ApiOperation({ summary: 'Send media album (multiple photos/videos)' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: SendMediaAlbumDto })
    async sendMediaAlbum(
        @Param('mobile') mobile: string,
        @Body() albumDto: MediaAlbumOptions
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.sendMediaAlbum(mobile, albumDto);
        });
    }

    @Get('media/metadata/:mobile')
    @ApiOperation({ summary: 'Get media metadata from a chat' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ type: MediaSearchDto })
    @ApiResponse({ status: 200, type: [MediaMetadataDto] })
    async getMediaMetadata(
        @Param('mobile') mobile: string,
        @Query() searchDto: MediaSearchDto
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getMediaMetadata(mobile, searchDto.chatId, searchDto.offset, searchDto.limit);
        });
    }

    @Get('media/filter/:mobile')
    @ApiOperation({ summary: 'Get filtered media messages from a chat' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ name: 'chatId', required: true })
    @ApiQuery({ name: 'types', enum: ['photo', 'video', 'document'], required: false })
    @ApiQuery({ name: 'startDate', required: false })
    @ApiQuery({ name: 'endDate', required: false })
    @ApiResponse({ status: 200, type: [MediaMetadataDto] })
    async getFilteredMedia(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string,
        @Query('type') types?: ('photo' | 'video' | 'document' | 'voice')[],
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getFilteredMedia(mobile, {
                chatId,
                types,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined
            });
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
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getGrpMembers(mobile, groupId);
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
    @ApiQuery({ name: 'chatId', required: true })
    @ApiQuery({ name: 'message', required: true })
    @ApiQuery({ name: 'url', required: true })
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
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getDialogs(mobile, { limit, archived, offsetId });
        });
    }

    @Get('last-active/:mobile')
    @ApiOperation({ summary: 'Get last active time' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ status: 200, description: 'Last active time retrieved successfully' })
    async getLastActiveTime(@Param('mobile') mobile: string) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getLastActiveTime(mobile);
        });
    }

    // Enhanced Group Management
    @Post('group/create/:mobile')
    @ApiOperation({ summary: 'Create a new group with advanced options' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: GroupSettingsDto })
    async createGroupWithOptions(
        @Param('mobile') mobile: string,
        @Body() options: GroupSettingsDto
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.createGroupWithOptions(mobile, options);
        });
    }

    @Post('group/settings/:mobile')
    @ApiOperation({ summary: 'Update group settings' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: GroupSettingsDto })
    async updateGroupSettings(
        @Param('mobile') mobile: string,
        @Body() settings: GroupSettingsDto
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.updateGroupSettings(mobile, settings);
        });
    }

    @Post('group/members/:mobile')
    @ApiOperation({ summary: 'Add members to a group' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: GroupMemberOperationDto })
    async addGroupMembers(
        @Body() memberOp: GroupMemberOperationDto,
        @Param('mobile') mobile: string,
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.addGroupMembers(
                mobile,
                memberOp.groupId,
                memberOp.members
            );
        });
    }

    @Delete('group/members/:mobile')
    @ApiOperation({ summary: 'Remove members from a group' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: GroupMemberOperationDto })
    async removeGroupMembers(
        @Body() memberOp: GroupMemberOperationDto,
        @Param('mobile') mobile: string,
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.removeGroupMembers(
                mobile,
                memberOp.groupId,
                memberOp.members
            );
        });
    }

    @Post('group/admin/:mobile')
    @ApiOperation({ summary: 'Promote or demote group admins' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: AdminOperationDto })
    async handleAdminOperation(
        @Body() adminOp: AdminOperationDto,
        @Param('mobile') mobile: string
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
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
        });
    }

    @Post('chat/cleanup/:mobile')
    @ApiOperation({ summary: 'Clean up chat history' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: ChatCleanupDto })
    async cleanupChat(
        @Param('mobile') mobile: string,
        @Body() cleanup: ChatCleanupDto
    ) {
        await this.telegramService.createClient(mobile);
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
        await this.telegramService.createClient(mobile);
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
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getScheduledMessages(mobile, chatId);
        });
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
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.sendVoiceMessage(mobile, voice);
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
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getMessagesNew(mobile, chatId, offset, limit);
        });
    }

    @Get('session/validate/:mobile')
    @ApiOperation({ summary: 'Validate session status' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiResponse({ status: 200, description: 'Session status retrieved successfully' })
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

    @Post('group/admin/promote/:mobile')
    @ApiOperation({ summary: 'Promote members to admin' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: AdminOperationDto })
    async promoteToAdmin(
        @Param('mobile') mobile: string,
        @Body() adminOp: AdminOperationDto
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.promoteToAdmin(
                mobile,
                adminOp.groupId,
                adminOp.userId,
                adminOp.permissions,
                adminOp.rank
            );
        });
    }

    @Post('group/admin/demote/:mobile')
    @ApiOperation({ summary: 'Demote admin to regular member' })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiBody({ type: GroupMemberOperationDto })
    async demoteAdmin(
        @Param('mobile') mobile: string,
        @Body() memberOp: GroupMemberOperationDto
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.demoteAdmin(
                mobile,
                memberOp.groupId,
                memberOp.members[0]
            );
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
    @ApiBody({ type: ContactExportImportDto })
    async exportContacts(
        @Param('mobile') mobile: string,
        @Body() exportDto: ContactExportImportDto,
        @Res() res: Response
    ) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            const data = await this.telegramService.exportContacts(
                mobile,
                exportDto.format,
                exportDto.includeBlocked
            );

            const filename = `contacts_${mobile}_${new Date().toISOString()}.${exportDto.format}`;
            res.setHeader('Content-Type', exportDto.format === 'vcard' ? 'text/vcard' : 'text/csv');
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
    @ApiBody({ type: ContactBlockListDto })
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
    @ApiResponse({ status: 200, description: 'Contact statistics retrieved successfully' })
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
    @ApiBody({ type: CreateChatFolderDto })
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
