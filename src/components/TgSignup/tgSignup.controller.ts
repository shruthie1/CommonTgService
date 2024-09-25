import { Controller, Get, Post, Query, BadRequestException, HttpException } from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { createClient, getClient } from './TgSignup.service';


@Controller('tgsignup')
@ApiTags('tgsignup')
export class TgSignupController {
    constructor(
        // private readonly tgSignupService: TgSignupService
    ) {}

    @Get('login')
    @ApiQuery({ name: 'phone', required: true })
    async sendCode(@Query('phone') phone: string) {
        console.log(phone)
        const result = await createClient(phone);
        if (result?.isCodeViaApp) {
            console.log('OTP SENT!! - ', phone)
            return result
        } else {
            throw new BadRequestException("Failed to send OTP")
        }
    }

    @Get('otp')
    @ApiQuery({ name: 'phone', required: true })
    @ApiQuery({ name: 'code', required: true })
    @ApiQuery({ name: 'password', required: false })
    async verifyCode(@Query('phone') phone: string, @Query('code') code: string, @Query('password') password: string) {
        const cli = await getClient(phone);
        if (cli) {
            console.log(cli?.phoneCodeHash, cli?.phoneNumber);
            const result: any = await cli?.login(code, password);
            if (result && result.status === 200) {
                return ({ mesaage: result.message });
            } else {
                throw new HttpException(result.message, result.status)
            }
        } else {
            throw new BadRequestException("Failed to Verify OTP")
        }
    }
}
