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
    @Matches(/^\d{5}$/, { message: 'Code must be exactly 5 digits' })
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
}