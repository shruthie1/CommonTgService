import { Controller, Post, Body, HttpException, HttpStatus, Get, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiQuery } from '@nestjs/swagger';
import { SessionService } from './session.service';
import { IsString, IsOptional, IsBoolean, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// DTOs for the two main endpoints
export class CreateSessionDto {
    @ApiPropertyOptional({
        description: 'Phone number with country code (optional if session provided)',
        example: '+1234567890'
    })
    @IsOptional()
    @IsString()
    mobile?: string;

    @ApiPropertyOptional({
        description: 'Existing session string to use',
        example: '1BVtsOHIBu2iBJgvn6U6SfJTgN6zPg2CwJjFBw5wHkJfFpBVts...'
    })
    @IsOptional()
    @IsString()
    session?: string;

    @ApiPropertyOptional({
        description: 'Force creation of new session even if active session exists',
        default: false
    })
    @IsOptional()
    @IsBoolean()
    forceNew?: boolean;
}

export class SearchAuditDto {
    @ApiPropertyOptional({
        description: 'Phone number to search for',
        example: '+1234567890'
    })
    @IsOptional()
    @IsString()
    mobile?: string;

    @ApiPropertyOptional({
        description: 'Session status to filter by',
        enum: ['created', 'active', 'expired', 'revoked', 'failed']
    })
    @IsOptional()
    @IsString()
    status?: string;

    @ApiPropertyOptional({
        description: 'Number of records to return',
        default: 10,
        minimum: 1
    })
    @IsOptional()
    @IsNumber()
    @Min(1)
    limit?: number;

    @ApiPropertyOptional({
        description: 'Number of records to skip',
        default: 0,
        minimum: 0
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    offset?: number;
}

@ApiTags('Telegram Session Management')
@Controller('telegram/session')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class SessionController {
    constructor(private readonly sessionService: SessionService) {}

    @Post('create')
    @ApiOperation({
        summary: 'Master session creation endpoint',
        description: 'Creates or retrieves a session based on provided parameters. If forceNew is true, always creates a new session. If forceNew is false, returns active session if exists and was used this month, otherwise creates new.'
    })
    @ApiBody({ type: CreateSessionDto })
    @ApiResponse({
        status: 200,
        description: 'Session created or retrieved successfully',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: true },
                message: { type: 'string', example: 'Session created successfully' },
                session: { type: 'string', example: '1BVtsOHIBu2iBJgvn6U6SfJTgN6z...' },
                isNew: { type: 'boolean', example: true }
            }
        }
    })
    @ApiResponse({
        status: 400,
        description: 'Bad request - validation failed or session creation failed'
    })
    async createSession(@Body() body: CreateSessionDto) {
        try {
            if (!body.mobile && !body.session) {
                throw new HttpException(
                    {
                        success: false,
                        message: 'Either mobile number or session string is required'
                    },
                    HttpStatus.BAD_REQUEST
                );
            }

            if (!body.forceNew && body.mobile) {
                const validSessionResult = await this.sessionService.findRecentValidSession(body.mobile);
                if (validSessionResult.success && validSessionResult.session) {
                    await this.sessionService.updateSessionLastUsed(body.mobile, validSessionResult.session.sessionString);
                    return {
                        success: true,
                        message: 'Valid session found from this month',
                        session: validSessionResult.session.sessionString,
                        isNew: false
                    };
                }else{
                    console.log('No valid session found from this month');
                }
            }

            // Create new session
            const options = {
                mobile: body.mobile,
                oldSession: body.session
            };

            const result = await this.sessionService.createSession(options);

            if (result.success) {
                return {
                    success: true,
                    message: 'Session created successfully',
                    session: result.session,
                    isNew: true
                };
            } else {
                throw new HttpException(
                    {
                        success: false,
                        message: result.error,
                        retryable: result.retryable
                    },
                    result.retryable ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.BAD_REQUEST
                );
            }
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }

            throw new HttpException(
                {
                    success: false,
                    message: error.message || 'Failed to create/retrieve session'
                },
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    @Get('audit/search')
    @ApiOperation({
        summary: 'Search existing audit sessions',
        description: 'Search and retrieve session audit records based on various criteria'
    })
    @ApiQuery({ name: 'mobile', required: false, type: String, description: 'Phone number to search for' })
    @ApiQuery({ name: 'status', required: false, enum: ['created', 'active', 'expired', 'revoked', 'failed'], description: 'Filter by session status' })
    @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of records to return (default: 10)' })
    @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Number of records to skip (default: 0)' })
    @ApiResponse({
        status: 200,
        description: 'Audit records retrieved successfully',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: true },
                data: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            mobile: { type: 'string', example: '916265240911' },
                            sessionString: { type: 'string', example: '1BQANOTEuM==...' },
                            status: { type: 'string', example: 'active' },
                            creationMethod: { type: 'string', example: 'old_session' },
                            createdAt: { type: 'string', example: '2023-12-01T10:00:00Z' },
                            lastUsedAt: { type: 'string', example: '2023-12-01T15:30:00Z' },
                            usageCount: { type: 'number', example: 5 }
                        }
                    }
                },
                total: { type: 'number', example: 25 },
                message: { type: 'string', example: 'Audit records retrieved successfully' }
            }
        }
    })
    async searchAudit(
        @Query('mobile') mobile?: string,
        @Query('status') status?: string,
        @Query('limit') limit?: number,
        @Query('offset') offset?: number
    ) {
        try {
            const options = {
                limit: limit ? Number(limit) : 10,
                offset: offset ? Number(offset) : 0
            };

            let result;
            if (mobile) {
                // Search by mobile number
                result = await this.sessionService.getSessionAuditHistory(mobile, {
                    ...options,
                    status: status as any
                });
            } else {
                // General search - we need to implement this in service
                // For now, throw error as we need mobile for the current implementation
                throw new HttpException(
                    {
                        success: false,
                        message: 'Mobile number is required for search'
                    },
                    HttpStatus.BAD_REQUEST
                );
            }

            if (result.success) {
                return {
                    success: true,
                    data: result.data,
                    total: result.total,
                    message: `Retrieved ${result.data?.length || 0} audit records`
                };
            } else {
                throw new HttpException(
                    {
                        success: false,
                        message: result.error || 'Failed to retrieve audit records'
                    },
                    HttpStatus.BAD_REQUEST
                );
            }
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }

            throw new HttpException(
                {
                    success: false,
                    message: error.message || 'Failed to search audit records'
                },
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }
}
