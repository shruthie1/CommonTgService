import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsNotEmpty, IsOptional, Matches, MinLength } from 'class-validator';

export class SendCodeDto {
    @ApiProperty({
        description: 'Phone number to send the verification code to (international format)'})
    @IsString()
    @IsNotEmpty()
    @Matches(/^\+\d{8,15}$/, { message: 'Invalid phone number format' })
    phone: string;
}

export class VerifyCodeDto {
    @ApiProperty({
        description: 'Phone number used for verification (international format)'})
    @IsString()
    @IsNotEmpty()
    @Matches(/^\+\d{8,15}$/, { message: 'Invalid phone number format' })
    phone: string;

    @ApiProperty({
        description: 'Verification code received'})
    @IsString()
    @IsNotEmpty()
    // Telegram codes are usually 5 digits, but email codes are longer and SmsWord/SmsPhrase codes are words.
    // The service validates against the code type Telegram actually sent.
    @Matches(/^[\p{L}\p{N}][\p{L}\p{N} -]{2,63}$/u, { message: 'Code must be exactly 5 digits' })
    code: string;

    @ApiProperty({
        description: 'Two-factor authentication password if required',
        required: false
    })
    @IsString()
    @IsOptional()
    @Transform(({ value }) => value === '' ? undefined : value)
    password?: string | undefined;

}

export class TgSignupResponse {
    @ApiProperty({
        description: 'Operation status code'})
    status: number;

    @ApiProperty({
        description: 'Response message'})
    message: string;

    @ApiProperty({
        description: 'Phone code hash for verification',
        required: false
    })
    phoneCodeHash?: string;

    @ApiProperty({
        description: 'Whether the code was sent via app',
        required: false
    })
    isCodeViaApp?: boolean;

    @ApiProperty({
        description: 'Session string for authenticated client',
        required: false
    })
    session?: string;

    @ApiProperty({
        description: 'Whether 2FA is required',
        required: false
    })
    requires2FA?: boolean;

    @ApiProperty({ description: 'How Telegram delivered the code (app, sms, call, email, ...)', required: false })
    codeType?: string;

    @ApiProperty({ description: 'Expected code length, when Telegram reports it', required: false })
    codeLength?: number;

    @ApiProperty({ description: 'Delivery channel a resend will use, if any', required: false })
    nextType?: string;

    @ApiProperty({ description: 'Seconds until a resend is allowed', required: false })
    resendAfter?: number;

    @ApiProperty({ description: '2FA password hint set by the account owner', required: false })
    passwordHint?: string;
}