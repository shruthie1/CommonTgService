import { Controller, Get, Post, Body, Param, Query, BadRequestException, Res, Delete, Put, UseInterceptors, UploadedFile, Patch, ParseArrayPipe } from '@nestjs/common';
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
    CreateTgBotDto
} from './dto';
import { MediaMetadataDto } from './dto/metadata-operations.dto';
import { CreateChatFolderDto } from './dto/create-chat-folder.dto';
import { MediaAlbumOptions } from './types/telegram-types';
import { ChatStatistics } from '../../interfaces/telegram';
import { ConnectionStatusDto, GetClientOptionsDto } from './dto/connection-management.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import axios from 'axios';
import { connectionManager } from './utils/connection-manager';
import { SearchMessagesDto, SearchMessagesResponseDto } from './dto/message-search.dto';
import { DeleteHistoryDto } from './dto/delete-chat.dto';
import { UpdateUsernameDto } from './dto/update-username.dto';
import { SendTgMessageDto } from './dto/send-message.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import bigInt from 'big-integer';

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
    @ApiBody({ type: SendTgMessageDto })
    @ApiResponse({ type: Object })
    async sendMessage(@Param('mobile') mobile: string, @Body() dto: SendTgMessageDto) {
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
    @ApiOperation({ 
        summary: 'Get call log statistics with enhanced filtering',
        description: 'Retrieves comprehensive call statistics including incoming/outgoing calls, video/audio breakdown, ' +
                     'and per-chat call counts. Uses server-side filtering for optimal performance. ' +
                     'Supports pagination via limit parameter (default: 1000, max: 10000).'
    })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ 
        name: 'limit', 
        required: false, 
        type: Number,
        description: 'Maximum number of calls to analyze (default: 1000, max: 10000)',
        example: 1000,
        minimum: 1,
        maximum: 10000
    })
    @ApiResponse({ 
        status: 200,
        description: 'Call log statistics retrieved successfully',
        schema: {
            type: 'object',
            properties: {
                outgoing: { type: 'number', description: 'Total outgoing calls' },
                incoming: { type: 'number', description: 'Total incoming calls' },
                video: { type: 'number', description: 'Total video calls' },
                audio: { type: 'number', description: 'Total audio calls' },
                chatCallCounts: {
                    type: 'array',
                    description: 'Per-chat call statistics (only chats with >4 calls)',
                    items: {
                        type: 'object',
                        properties: {
                            chatId: { type: 'string' },
                            phone: { type: 'string' },
                            username: { type: 'string' },
                            name: { type: 'string' },
                            count: { type: 'number' },
                            msgs: { type: 'number', description: 'Total messages in chat' },
                            video: { type: 'number', description: 'Video messages count' },
                            photo: { type: 'number', description: 'Photo messages count' },
                            peerType: { type: 'string', enum: ['user', 'group', 'channel'] }
                        }
                    }
                },
                totalCalls: { type: 'number', description: 'Total number of calls analyzed' },
                analyzedCalls: { type: 'number', description: 'Number of calls actually processed' }
            }
        }
    })
    @ApiResponse({ status: 400, description: 'Bad Request - invalid limit parameter' })
    @ApiResponse({ status: 500, description: 'Internal Server Error' })
    async getCallLogStats(
        @Param('mobile') mobile: string,
        @Query('limit') limit?: number
    ) {
        if (limit !== undefined && (limit < 1 || limit > 10000)) {
            throw new BadRequestException('Limit must be between 1 and 10000.');
        }
        return this.telegramService.getCallLog(mobile, limit);
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
    @ApiOperation({ 
        summary: 'Send media message',
        description: 'Send a photo or file to a chat. Maximum file size is 100MB. Supports images, videos, and documents.'
    })
    @ApiParam({ name: 'mobile', description: 'Mobile number of the Telegram account', required: true, example: '1234567890' })
    @ApiBody({ type: SendMediaDto })
    @ApiResponse({ 
        status: 200, 
        description: 'Media sent successfully',
        type: Object 
    })
    @ApiResponse({ 
        status: 400, 
        description: 'Invalid request - file too large, invalid URL, or missing required fields' 
    })
    @ApiResponse({ 
        status: 500, 
        description: 'Failed to send media - check Telegram connection or file accessibility' 
    })
    async sendMedia(@Param('mobile') mobile: string, @Body() sendMediaDto: SendMediaDto) {
        // Validate file size before processing
        if (sendMediaDto.url) {
            try {
                const headResponse = await axios.head(sendMediaDto.url, { timeout: 10000 });
                const contentLength = parseInt(headResponse.headers['content-length'] || '0', 10);
                const maxSize = 100 * 1024 * 1024; // 100MB
                
                if (contentLength > maxSize) {
                    const fileSizeMB = (contentLength / (1024 * 1024)).toFixed(2);
                    const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(0);
                    throw new BadRequestException(
                        `File size (${fileSizeMB} MB) exceeds maximum allowed size of ${maxSizeMB} MB. Please use a smaller file.`
                    );
                }
            } catch (error) {
                if (error instanceof BadRequestException) {
                    throw error;
                }
                // Continue if HEAD request fails (some servers don't support it)
                // File size validation is optional - proceed with download
            }
        }
        
        try {
            const client = await connectionManager.getClient(mobile);
            if (sendMediaDto.type === MediaType.PHOTO) {
                return await client.sendPhotoChat(sendMediaDto.chatId, sendMediaDto.url, sendMediaDto.caption, sendMediaDto.filename);
            }
            return await client.sendFileChat(sendMediaDto.chatId, sendMediaDto.url, sendMediaDto.caption, sendMediaDto.filename);
        } catch (error) {
            // Re-throw BadRequestException as-is
            if (error instanceof BadRequestException) {
                throw error;
            }
            // For other errors, provide user-friendly message
            throw new BadRequestException(`Failed to send media: ${error.message || 'Unknown error'}`);
        }
    }

    @Get('media/download/:mobile')
    @ApiOperation({ 
        summary: 'Preview or download media from a message',
        description: 'Download or preview media from a Telegram message. Images and videos preview in browser, other files download. Supports HTTP Range requests for video streaming.'
    })
    @ApiParam({ name: 'mobile', description: 'Mobile number of the Telegram account', required: true, example: '1234567890' })
    @ApiQuery({ 
        name: 'chatId', 
        required: true, 
        description: 'Chat ID or username. Use "me" for saved messages, channel username (e.g., "channelname"), or numeric ID',
        example: 'me'
    })
    @ApiQuery({ 
        name: 'messageId', 
        required: true, 
        description: 'Message ID containing the media (must be a positive number)',
        type: Number,
        example: 12345
    })
    @ApiResponse({ 
        status: 200,
        description: 'Media file (preview in browser for images/videos, download for other types)',
        content: {
            'image/*': { schema: { type: 'string', format: 'binary' } },
            'video/*': { schema: { type: 'string', format: 'binary' } },
            'application/*': { schema: { type: 'string', format: 'binary' } }
        }
    })
    @ApiResponse({ 
        status: 206,
        description: 'Partial content (when using Range header for video streaming)'
    })
    @ApiResponse({ 
        status: 304,
        description: 'Not modified (when using If-None-Match header for caching)'
    })
    @ApiResponse({ 
        status: 404, 
        description: 'Media not found - message ID does not exist or message has no media' 
    })
    @ApiResponse({ 
        status: 416,
        description: 'Range not satisfiable - invalid Range header'
    })
    async downloadMedia(
        @Param('mobile') mobile: string, 
        @Query('chatId') chatId: string, 
        @Query('messageId') messageId: number, 
        @Res() res: Response
    ) {
        // Validate messageId
        if (!messageId || messageId <= 0 || !Number.isInteger(messageId)) {
            throw new BadRequestException('Message ID must be a positive integer');
        }
        
        // Validate chatId
        if (!chatId || chatId.trim().length === 0) {
            throw new BadRequestException('Chat ID is required and cannot be empty');
        }
        
        try {
            const fileInfo = await this.telegramService.getMediaFileDownloadInfo(mobile, messageId, chatId);
            
            // Check If-None-Match header for 304 Not Modified
            if (res.req.headers['if-none-match'] === fileInfo.etag) {
                return res.status(304).end();
            }
            
            // Support HTTP Range requests for video streaming
            const range = res.req.headers.range;
            const chunkSize = 512 * 1024; // 512 KB chunks
            
            if (range && fileInfo.fileSize > 0) {
                // Parse Range header: "bytes=start-end"
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileInfo.fileSize - 1;
                const chunksize = (end - start) + 1;

                // Validate range
                if (start >= fileInfo.fileSize || end >= fileInfo.fileSize || start > end) {
                    res.status(416).setHeader('Content-Range', `bytes */${fileInfo.fileSize}`);
                    return res.end();
                }

                res.status(206); // Partial Content
                res.setHeader('Content-Range', `bytes ${start}-${end}/${fileInfo.fileSize}`);
                res.setHeader('Accept-Ranges', 'bytes');
                res.setHeader('Content-Length', chunksize);
                res.setHeader('Content-Type', fileInfo.contentType);
                res.setHeader('Content-Disposition', `inline; filename="${fileInfo.filename}"`);
                res.setHeader('Cache-Control', 'public, max-age=3600');
                res.setHeader('ETag', fileInfo.etag);
                
                // Enable progressive video playback
                res.setHeader('X-Content-Type-Options', 'nosniff');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

                // Stream only the requested range
                for await (const chunk of this.telegramService.streamMediaFile(
                    mobile, 
                    fileInfo.fileLocation, 
                    bigInt(start), 
                    chunksize, 
                    chunkSize
                )) {
                    res.write(chunk);
                }
            } else {
                // Full file download
                res.setHeader('Content-Type', fileInfo.contentType);
                res.setHeader('Content-Disposition', `inline; filename="${fileInfo.filename}"`);
                res.setHeader('Cache-Control', 'public, max-age=3600');
                res.setHeader('ETag', fileInfo.etag);
                res.setHeader('Accept-Ranges', 'bytes');
                
                // Enable progressive video playback
                res.setHeader('X-Content-Type-Options', 'nosniff');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Accept-Ranges');
                
                if (fileInfo.fileSize > 0) {
                    res.setHeader('Content-Length', fileInfo.fileSize);
                }

                for await (const chunk of this.telegramService.streamMediaFile(
                    mobile, 
                    fileInfo.fileLocation, 
                    bigInt(0), 
                    5 * 1024 * 1024, 
                    chunkSize
                )) {
                    res.write(chunk);
                }
            }
            res.end();
        } catch (error) {
            if (error.message?.includes('FILE_REFERENCE_EXPIRED') || error.message?.includes('not found')) {
                return res.status(404).send(error.message || 'File reference expired');
            }
            if (!res.headersSent) {
                res.status(500).send('Error downloading media');
            }
        }
    }

    @Get('media/thumbnail/:mobile')
    @ApiOperation({ 
        summary: 'Get thumbnail for a media message',
        description: 'Get thumbnail image for a Telegram message containing media (photo or video). Returns JPEG image. Supports caching with ETag headers.'
    })
    @ApiParam({ name: 'mobile', description: 'Mobile number of the Telegram account', required: true, example: '1234567890' })
    @ApiQuery({ 
        name: 'chatId', 
        required: true, 
        description: 'Chat ID or username. Use "me" for saved messages, channel username (e.g., "channelname"), or numeric ID',
        example: 'me'
    })
    @ApiQuery({ 
        name: 'messageId', 
        required: true, 
        description: 'Message ID containing the media (must be a positive number)',
        type: Number,
        example: 12345
    })
    @ApiResponse({ 
        status: 200,
        description: 'Thumbnail image (JPEG format)',
        content: {
            'image/jpeg': { schema: { type: 'string', format: 'binary' } }
        }
    })
    @ApiResponse({ 
        status: 304,
        description: 'Not modified (when using If-None-Match header for caching)'
    })
    @ApiResponse({ 
        status: 404, 
        description: 'Thumbnail not found - message ID does not exist, message has no media, or thumbnail is not available' 
    })
    @ApiResponse({ 
        status: 500,
        description: 'Error getting thumbnail'
    })
    async getThumbnail(
        @Param('mobile') mobile: string, 
        @Query('chatId') chatId: string, 
        @Query('messageId') messageId: number, 
        @Res() res: Response
    ) {
        // Validate messageId
        if (!messageId || messageId <= 0 || !Number.isInteger(messageId)) {
            throw new BadRequestException('Message ID must be a positive integer');
        }
        
        // Validate chatId
        if (!chatId || chatId.trim().length === 0) {
            throw new BadRequestException('Chat ID is required and cannot be empty');
        }
        
        try {
            const thumbnail = await this.telegramService.getThumbnail(mobile, messageId, chatId);
            
            // Check If-None-Match header for 304 Not Modified
            if (res.req.headers['if-none-match'] === thumbnail.etag) {
                return res.status(304).end();
            }
            
            // Set response headers
            res.setHeader('Content-Type', thumbnail.contentType);
            res.setHeader('Content-Disposition', `inline; filename="${thumbnail.filename}"`);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.setHeader('ETag', thumbnail.etag);
            res.setHeader('Content-Length', thumbnail.buffer.length);
            
            return res.send(thumbnail.buffer);
        } catch (error) {
            if (error.message?.includes('FILE_REFERENCE_EXPIRED') || error.message?.includes('not found') || error.message?.includes('not available')) {
                return res.status(404).send(error.message || 'Thumbnail not available');
            }
            if (!res.headersSent) {
                res.status(500).send('Error getting thumbnail');
            }
        }
    }

    @Post('media/album/:mobile')
    @ApiOperation({ 
        summary: 'Send media album (multiple photos/videos)',
        description: 'Send multiple media files as an album. If some items fail, the operation continues and returns a summary of successful and failed items.'
    })
    @ApiParam({ name: 'mobile', description: 'Mobile number of the Telegram account', required: true, example: '1234567890' })
    @ApiBody({ type: SendMediaAlbumDto })
    @ApiResponse({ 
        status: 200,
        description: 'Album sent with summary of results',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'number', description: 'Number of successfully sent items' },
                failed: { type: 'number', description: 'Number of failed items' },
                errors: { 
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            index: { type: 'number', description: 'Index of failed item' },
                            error: { type: 'string', description: 'Error message' }
                        }
                    },
                    description: 'Details of failed items (only present if failed > 0)'
                }
            }
        }
    })
    @ApiResponse({ 
        status: 400, 
        description: 'Invalid request - empty album, invalid URLs, or file size exceeds limit' 
    })
    @ApiResponse({ 
        status: 500, 
        description: 'Failed to send album - all items failed or Telegram connection error' 
    })
    async sendMediaAlbum(@Param('mobile') mobile: string, @Body() albumDto: MediaAlbumOptions) {
        // Validate album has items
        if (!albumDto.media || albumDto.media.length === 0) {
            throw new BadRequestException('Album must contain at least one media item');
        }
        
        // Validate max album size (Telegram limit is 10 items)
        if (albumDto.media.length > 10) {
            throw new BadRequestException(`Album cannot contain more than 10 items. You provided ${albumDto.media.length} items.`);
        }
        
        return this.telegramService.sendMediaAlbum(mobile, albumDto);
    }

    @Get('media/metadata/:mobile')
    @ApiOperation({ 
        summary: 'Get media metadata from a chat',
        description: 'Retrieve metadata for media messages in a chat. Supports filtering by type, date range, and message ID range. Use maxId for pagination (get messages with ID less than maxId).'
    })
    @ApiParam({ name: 'mobile', description: 'Mobile number of the Telegram account', required: true, example: '1234567890' })
    @ApiQuery({ 
        name: 'chatId', 
        required: true,
        description: 'Chat ID or username. Use "me" for saved messages, channel username, or numeric ID',
        example: 'me'
    })
    @ApiQuery({ 
        name: 'types', 
        enum: ['photo', 'video', 'document', 'voice', 'all'], 
        required: false, 
        isArray: true,
        description: 'Filter by media types. Use "all" to get all types grouped by type. If not specified, returns all media types.',
        example: ['photo', 'video']
    })
    @ApiQuery({ 
        name: 'startDate', 
        required: false,
        description: 'Start date for filtering (ISO 8601 format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)',
        example: '2024-01-01'
    })
    @ApiQuery({ 
        name: 'endDate', 
        required: false,
        description: 'End date for filtering (ISO 8601 format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)',
        example: '2024-12-31'
    })
    @ApiQuery({ 
        name: 'limit', 
        description: 'Maximum number of messages to fetch (default: 50, max: 1000)', 
        required: false, 
        type: Number,
        example: 50
    })
    @ApiQuery({ 
        name: 'maxId', 
        required: false, 
        type: Number,
        description: 'Maximum message ID to include (use for pagination - get messages with ID less than this. Use nextMaxId from previous response for next page)',
        example: 12345
    })
    @ApiQuery({ 
        name: 'minId', 
        required: false, 
        type: Number,
        description: 'Minimum message ID to include',
        example: 1000
    })
    @ApiResponse({ 
        status: 200,
        description: 'Media metadata retrieved successfully',
        type: Object
    })
    @ApiResponse({ 
        status: 400,
        description: 'Invalid request - invalid date format, chat ID, or limit value'
    })
    async getMediaMetadata(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string,
        @Query('types', new ParseArrayPipe({ items: String, separator: ',', optional: true })) types?: string | string[],
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('limit') limit?: number,
        @Query('maxId') maxId?: number,
        @Query('minId') minId?: number
    ) {
        // Validate chatId
        if (!chatId || chatId.trim().length === 0) {
            throw new BadRequestException('Chat ID is required and cannot be empty');
        }
        
        // Validate limit
        if (limit !== undefined && (limit <= 0 || limit > 1000)) {
            throw new BadRequestException('Limit must be between 1 and 1000');
        }
        
        // Parse types array - handle both string and array formats
        let parsedTypes: ('photo' | 'video' | 'document' | 'voice' | 'all')[] | undefined;
        if (types) {
            const typesArray = Array.isArray(types) ? types : [types];
            const validTypes = ['photo', 'video', 'document', 'voice', 'all'];
            parsedTypes = typesArray
                .filter(t => validTypes.includes(t.toLowerCase()))
                .map(t => t.toLowerCase()) as ('photo' | 'video' | 'document' | 'voice' | 'all')[];
            
            if (parsedTypes.length === 0) {
                throw new BadRequestException(`Invalid types. Must be one or more of: ${validTypes.join(', ')}`);
            }
        }
        
        // Validate date formats
        let parsedStartDate: Date | undefined;
        let parsedEndDate: Date | undefined;
        
        if (startDate && startDate.trim()) {
            parsedStartDate = new Date(startDate);
            if (isNaN(parsedStartDate.getTime())) {
                throw new BadRequestException(`Invalid startDate format. Use ISO 8601 format (e.g., "2024-01-01" or "2024-01-01T10:00:00")`);
            }
        }
        
        if (endDate && endDate.trim()) {
            parsedEndDate = new Date(endDate);
            if (isNaN(parsedEndDate.getTime())) {
                throw new BadRequestException(`Invalid endDate format. Use ISO 8601 format (e.g., "2024-12-31" or "2024-12-31T23:59:59")`);
            }
        }
        
        // Validate date range
        if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
            throw new BadRequestException('startDate must be before or equal to endDate');
        }
        
        return this.telegramService.getMediaMetadata(mobile, {
            chatId,
            types: parsedTypes,
            startDate: parsedStartDate,
            endDate: parsedEndDate,
            limit,
            maxId,
            minId
        });
    }

    @Get('media/filter/:mobile')
    @ApiOperation({ 
        summary: 'Get filtered media messages from a chat',
        description: 'Get filtered list of media messages with detailed metadata including thumbnails. Returns standardized paginated response. Use maxId for pagination (get messages with ID less than maxId).'
    })
    @ApiParam({ name: 'mobile', description: 'Mobile number of the Telegram account', required: true, example: '1234567890' })
    @ApiQuery({ 
        name: 'chatId', 
        required: true, 
        description: 'Chat ID or username. Use "me" for saved messages, channel username, or numeric ID',
        example: 'me'
    })
    @ApiQuery({ 
        name: 'types', 
        required: false, 
        enum: ['photo', 'video', 'document', 'voice', 'all'], 
        isArray: true,
        description: 'Filter by media types. Use "all" to get all types grouped by type. If not specified, returns all media types.',
        example: ['photo', 'video']
    })
    @ApiQuery({ 
        name: 'startDate', 
        required: false, 
        description: 'Filter media after this date (ISO 8601 format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)',
        example: '2024-01-01'
    })
    @ApiQuery({ 
        name: 'endDate', 
        required: false, 
        description: 'Filter media before this date (ISO 8601 format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)',
        example: '2024-12-31'
    })
    @ApiQuery({ 
        name: 'limit', 
        required: false, 
        type: Number, 
        description: 'Maximum number of media items to fetch (default: 50, max: 1000)',
        example: 50
    })
    @ApiQuery({ 
        name: 'maxId', 
        required: false, 
        type: Number, 
        description: 'Maximum message ID to include (use for pagination - get messages with ID less than this. Use nextMaxId from previous response for next page)',
        example: 12345
    })
    @ApiQuery({ 
        name: 'minId', 
        required: false, 
        type: Number, 
        description: 'Minimum message ID to include',
        example: 1000
    })
    @ApiResponse({ 
        status: 200,
        description: 'Paginated media response with standardized format',
        type: Object
    })
    @ApiResponse({ 
        status: 400,
        description: 'Invalid request - invalid date format, chat ID, or limit value' 
    })
    async getFilteredMedia(
        @Param('mobile') mobile: string,
        @Query('chatId') chatId: string,
        @Query('types', new ParseArrayPipe({ items: String, separator: ',', optional: true })) types?: string | string[],
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('limit') limit?: number,
        @Query('maxId') maxId?: number,
        @Query('minId') minId?: number
    ) {
        // Validate chatId
        if (!chatId || chatId.trim().length === 0) {
            throw new BadRequestException('Chat ID is required and cannot be empty');
        }
        
        // Validate limit
        if (limit !== undefined && (limit <= 0 || limit > 1000)) {
            throw new BadRequestException('Limit must be between 1 and 1000');
        }
        
        // Parse types array - handle both string and array formats
        let parsedTypes: ('photo' | 'video' | 'document' | 'voice' | 'all')[] | undefined;
        if (types) {
            const typesArray = Array.isArray(types) ? types : [types];
            const validTypes = ['photo', 'video', 'document', 'voice', 'all'];
            parsedTypes = typesArray
                .filter(t => validTypes.includes(t.toLowerCase()))
                .map(t => t.toLowerCase()) as ('photo' | 'video' | 'document' | 'voice' | 'all')[];
            
            if (parsedTypes.length === 0) {
                throw new BadRequestException(`Invalid types. Must be one or more of: ${validTypes.join(', ')}`);
            }
        }
        
        // Validate date formats
        let parsedStartDate: Date | undefined;
        let parsedEndDate: Date | undefined;
        
        if (startDate && startDate.trim()) {
            parsedStartDate = new Date(startDate);
            if (isNaN(parsedStartDate.getTime())) {
                throw new BadRequestException(`Invalid startDate format. Use ISO 8601 format (e.g., "2024-01-01" or "2024-01-01T10:00:00")`);
            }
        }
        
        if (endDate && endDate.trim()) {
            parsedEndDate = new Date(endDate);
            if (isNaN(parsedEndDate.getTime())) {
                throw new BadRequestException(`Invalid endDate format. Use ISO 8601 format (e.g., "2024-12-31" or "2024-12-31T23:59:59")`);
            }
        }
        
        // Validate date range
        if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
            throw new BadRequestException('startDate must be before or equal to endDate');
        }
        
        return this.telegramService.getFilteredMedia(mobile, {
            chatId,
            types: parsedTypes,
            startDate: parsedStartDate,
            endDate: parsedEndDate,
            limit,
            maxId,
            minId
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
    @ApiOperation({ 
        summary: 'Send voice message',
        description: 'Send a voice message (audio file) to a chat. Maximum file size is 100MB. Duration is optional but recommended for better playback.'
    })
    @ApiParam({ name: 'mobile', description: 'Mobile number of the Telegram account', required: true, example: '1234567890' })
    @ApiBody({ 
        schema: { 
            type: 'object', 
            properties: { 
                chatId: { type: 'string', description: 'Chat ID or username', example: 'me' },
                url: { type: 'string', description: 'URL of the voice file (must be accessible)', example: 'https://example.com/voice.ogg' },
                duration: { type: 'number', description: 'Duration in seconds (optional but recommended)', example: 30 },
                caption: { type: 'string', description: 'Optional caption for the voice message' }
            },
            required: ['chatId', 'url']
        } 
    })
    @ApiResponse({ 
        status: 200,
        description: 'Voice message sent successfully',
        type: Object 
    })
    @ApiResponse({ 
        status: 400, 
        description: 'Invalid request - missing chatId/url, file too large, or invalid URL' 
    })
    async sendVoiceMessage(@Param('mobile') mobile: string, @Body() voice: { chatId: string; url: string; duration?: number; caption?: string }) {
        // Validate required fields
        if (!voice.chatId || voice.chatId.trim().length === 0) {
            throw new BadRequestException('Chat ID is required and cannot be empty');
        }
        
        if (!voice.url || voice.url.trim().length === 0) {
            throw new BadRequestException('URL is required and cannot be empty');
        }
        
        // Validate URL format
        try {
            new URL(voice.url);
        } catch {
            throw new BadRequestException('Invalid URL format. Please provide a valid HTTP/HTTPS URL.');
        }
        
        // Validate duration if provided
        if (voice.duration !== undefined && (voice.duration < 0 || !Number.isInteger(voice.duration))) {
            throw new BadRequestException('Duration must be a non-negative integer (in seconds)');
        }
        
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
    @ApiOperation({ 
        summary: 'Get top private chats with smart activity-based filtering',
        description: 'Retrieves top private chats ranked by engagement score using advanced filtering. ' +
                     'Uses time-decay scoring, conversation patterns, and dialog metadata for accurate results. ' +
                     'Considers recency, mutual engagement, reply chains, and call history. ' +
                     'Supports configurable limit (default: 10, max: 50).'
    })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ 
        name: 'limit', 
        required: false, 
        type: Number,
        description: 'Maximum number of top chats to return (default: 10, min: 1, max: 50)',
        example: 10
    })
    @ApiResponse({ 
        status: 200,
        description: 'Top private chats retrieved successfully',
        schema: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    chatId: { type: 'string', description: 'Chat/user ID' },
                    username: { type: 'string', description: 'Username (if available)' },
                    firstName: { type: 'string', description: 'First name' },
                    lastName: { type: 'string', description: 'Last name' },
                    totalMessages: { type: 'number', description: 'Total messages in conversation' },
                    interactionScore: { 
                        type: 'number', 
                        description: 'Calculated engagement score (higher = more active)' 
                    },
                    engagementLevel: { 
                        type: 'string', 
                        enum: ['recent', 'active', 'dormant'],
                        description: 'Activity classification: recent (≤7 days), active (7-30 days), dormant (30-90 days)'
                    },
                    lastActivityDays: { 
                        type: 'number', 
                        description: 'Days since last activity' 
                    },
                    calls: {
                        type: 'object',
                        properties: {
                            total: { type: 'number' },
                            incoming: {
                                type: 'object',
                                properties: {
                                    total: { type: 'number' },
                                    audio: { type: 'number' },
                                    video: { type: 'number' }
                                }
                            },
                            outgoing: {
                                type: 'object',
                                properties: {
                                    total: { type: 'number' },
                                    audio: { type: 'number' },
                                    video: { type: 'number' }
                                }
                            }
                        }
                    },
                    media: {
                        type: 'object',
                        properties: {
                            photos: { type: 'number', description: 'Total photos shared' },
                            videos: { type: 'number', description: 'Total videos shared' },
                            photosByUs: { type: 'number', description: 'Photos shared by current user' },
                            photosByThem: { type: 'number', description: 'Photos shared by other party' },
                            videosByUs: { type: 'number', description: 'Videos shared by current user' },
                            videosByThem: { type: 'number', description: 'Videos shared by other party' }
                        }
                    },
                    activityBreakdown: {
                        type: 'object',
                        description: 'Percentage breakdown of interaction types',
                        properties: {
                            videoCalls: { type: 'number', description: 'Percentage from video calls' },
                            audioCalls: { type: 'number', description: 'Percentage from audio calls' },
                            mediaSharing: { type: 'number', description: 'Percentage from media sharing' },
                            textMessages: { type: 'number', description: 'Percentage from text messages' }
                        }
                    }
                }
            }
        }
    })
    @ApiResponse({ status: 500, description: 'Internal Server Error' })
    async getTopPrivateChats(
        @Param('mobile') mobile: string,
        @Query('limit') limit?: number
    ) {
        return this.telegramService.getTopPrivateChats(mobile, limit);
    }

    @Get('messages/self-msg-info/:mobile')
    @ApiOperation({ 
        summary: 'Get statistics about media messages in saved messages',
        description: 'Retrieves comprehensive statistics about photos, videos, and movies in saved messages (self chat). ' +
                     'Uses memory-efficient iterMessages for processing large message histories. ' +
                     'Supports configurable limit for analysis scope (default: 500, max: 10000).'
    })
    @ApiParam({ name: 'mobile', description: 'Mobile number', required: true })
    @ApiQuery({ 
        name: 'limit', 
        required: false, 
        type: Number,
        description: 'Maximum number of messages to analyze (default: 500, max: 10000)',
        example: 500,
        minimum: 1,
        maximum: 10000
    })
    @ApiResponse({ 
        status: 200,
        description: 'Self messages statistics retrieved successfully',
        schema: {
            type: 'object',
            properties: {
                total: { type: 'number', description: 'Total messages in saved messages' },
                photoCount: { type: 'number', description: 'Total photos' },
                videoCount: { type: 'number', description: 'Total videos' },
                movieCount: { 
                    type: 'number', 
                    description: 'Messages containing movie-related keywords (links, shared content)' 
                },
                ownPhotoCount: { type: 'number', description: 'Photos sent by user' },
                otherPhotoCount: { type: 'number', description: 'Photos received from others' },
                ownVideoCount: { type: 'number', description: 'Videos sent by user' },
                otherVideoCount: { type: 'number', description: 'Videos received from others' },
                analyzedMessages: { 
                    type: 'number', 
                    description: 'Number of messages actually analyzed' 
                }
            }
        }
    })
    @ApiResponse({ status: 400, description: 'Bad Request - invalid limit parameter' })
    @ApiResponse({ status: 500, description: 'Internal Server Error' })
    async getSelfMsgsInfo(
        @Param('mobile') mobile: string,
        @Query('limit') limit?: number
    ) {
        if (limit !== undefined && (limit < 1 || limit > 10000)) {
            throw new BadRequestException('Limit must be between 1 and 10000.');
        }
        return this.telegramService.getSelfMsgsInfo(mobile, limit);
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
    @ApiBody({ type: CreateTgBotDto })
    @ApiResponse({ type: Object, schema: { properties: { botToken: { type: 'string', description: 'The token to access HTTP Bot API' }, username: { type: 'string', description: 'The username of the created bot' } } } })
    async createBot(@Param('mobile') mobile: string, @Body() createBotDto: CreateTgBotDto) {
        return this.telegramService.createBot(mobile, createBotDto);
    }
}