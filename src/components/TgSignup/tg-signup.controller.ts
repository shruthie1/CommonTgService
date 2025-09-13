import { Controller, Post, Body, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiExtraModels } from '@nestjs/swagger';
import { TgSignupService } from './tg-signup.service';
import { SendCodeDto, VerifyCodeDto, TgSignupResponse } from './dto/tg-signup.dto';
import { Logger } from '../../utils';

@Controller('tgsignup')
@ApiTags('tgsignup')
@ApiExtraModels(SendCodeDto, VerifyCodeDto, TgSignupResponse)
export class TgSignupController {
    private readonly logger = new Logger(TgSignupController.name);

    constructor(private readonly tgSignupService: TgSignupService) {}

    @Post('send-code')
    @ApiOperation({
        summary: 'Send verification code to phone number',
        description: 'Initiates the signup process by sending a verification code via Telegram'
    })
    @ApiResponse({
        status: HttpStatus.CREATED,
        type: TgSignupResponse,
        description: 'Code sent successfully'
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid phone number or failed to send code',
        schema: {
            type: 'object',
            properties: {
                statusCode: { type: 'number', example: 400 },
                message: { type: 'string', example: 'Invalid phone number format' },
                error: { type: 'string', example: 'Bad Request' }
            }
        }
    })
    @ApiResponse({
        status: HttpStatus.TOO_MANY_REQUESTS,
        description: 'Rate limit exceeded'
    })
    @ApiResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Internal server error occurred'
    })
    async sendCode(@Body() sendCodeDto: SendCodeDto): Promise<TgSignupResponse> {
        try {
            this.logger.debug(`[SEND_CODE] Request received for phone: ${sendCodeDto.phone}`);
            const result = await this.tgSignupService.sendCode(sendCodeDto.phone);

            return {
                status: HttpStatus.CREATED,
                message: 'Code sent to your Telegram App',
                phoneCodeHash: result.phoneCodeHash,
                isCodeViaApp: result.isCodeViaApp
            };
        } catch (error) {
            this.logger.error(`[SEND_CODE] Error for phone: ${sendCodeDto.phone}`, {
                error,
                stack: error.stack
            });

            throw error;
        }
    }

    @Post('verify')
    @ApiOperation({
        summary: 'Verify code and complete signup/login',
        description: 'Verifies the code sent to phone and completes the signup/login process'
    })
    @ApiResponse({
        status: HttpStatus.OK,
        type: TgSignupResponse,
        description: 'Verification successful'
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid code or verification failed'
    })
    @ApiResponse({
        status: HttpStatus.TOO_MANY_REQUESTS,
        description: 'Rate limit exceeded'
    })
    @ApiResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Internal server error occurred'
    })
    async verifyCode(@Body() verifyCodeDto: VerifyCodeDto): Promise<TgSignupResponse> {
        try {
            this.logger.debug(`[VERIFY_CODE] Request received for phone: ${verifyCodeDto.phone}`);

            const result = await this.tgSignupService.verifyCode(
                verifyCodeDto.phone,
                verifyCodeDto.code,
                verifyCodeDto.password
            );

            return {
                status: result.requires2FA ? HttpStatus.BAD_REQUEST : HttpStatus.OK,
                message: result.message || 'Successfully logged in',
                session: result.session,
                requires2FA: result.requires2FA
            };
        } catch (error) {
            this.logger.error(`[VERIFY_CODE] Error for phone: ${verifyCodeDto.phone}`, {
                error,
                stack: error.stack
            });

            throw error;
        }
    }
}
