import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsNotEmpty, IsOptional, Matches, MinLength } from 'class-validator';

export class SendCodeDto {
    @ApiProperty({
        description: 'Phone number to send the verification code to (international format)',
        example: '+919876543210'
    })
    @IsString()
    @IsNotEmpty()
    @Matches(/^\+\d{8,15}$/, { message: 'Invalid phone number format' })
    phone: string;
}

export class VerifyCodeDto {
    @ApiProperty({
        description: 'Phone number used for verification (international format)',
        example: '919876543210'
    })
    @IsString()
    @IsNotEmpty()
    @Matches(/^\+\d{8,15}$/, { message: 'Invalid phone number format' })
    phone: string;

    @ApiProperty({
        description: 'Verification code received',
        example: '12345'
    })
    @IsString()
    @IsNotEmpty()
    @Matches(/^\d{5}$/, { message: 'Code must be exactly 5 digits' })
    code: string;

    @ApiProperty({
        description: 'Two-factor authentication password if required',
        example: 'yourSecurePassword123',
        required: false
    })
    @IsString()
    @IsOptional()
    @Transform(({ value }) => value === '' ? undefined : value)
    password?: string | undefined;

}

export class TgSignupResponse {
    @ApiProperty({
        description: 'Operation status code',
        example: 200
    })
    status: number;

    @ApiProperty({
        description: 'Response message',
        example: 'Login successful'
    })
    message: string;

    @ApiProperty({
        description: 'Phone code hash for verification',
        example: 'abc123xyz',
        required: false
    })
    phoneCodeHash?: string;

    @ApiProperty({
        description: 'Whether the code was sent via app',
        example: true,
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
        example: false,
        required: false
    })
    requires2FA?: boolean;
}