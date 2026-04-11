import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsOptional, IsString, IsUrl, Matches } from 'class-validator';

export class CreateClientDto {
    @ApiProperty({ description: 'Channel link' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsString()
    readonly channelLink: string;

    @ApiProperty({ description: 'Database collection name' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsString()
    readonly dbcoll: string;

    @ApiProperty({ description: 'Client link' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsUrl({}, { message: 'Invalid client link format' })
    readonly link: string;

    @ApiProperty({ description: 'Display name' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsString()
    readonly name: string;

    @ApiProperty({ description: 'Mobile number' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @Matches(/^\+?[0-9]{10,15}$/, { message: 'Invalid phone number format' })
    readonly mobile: string;

    @ApiProperty({ description: '2FA password' })
    @IsString()
    readonly password: string;

    @ApiProperty({ description: 'tg-aut repl link' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsUrl({}, { message: 'Invalid repl URL format' })
    readonly repl: string;

    @ApiProperty({ description: 'Promote repl link' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsUrl({}, { message: 'Invalid promote repl URL format' })
    readonly promoteRepl: string;

    @ApiProperty({ description: 'Telegram session string' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsString()
    readonly session: string;

    @ApiProperty({ description: 'Telegram username' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsString()
    readonly username: string;

    @ApiProperty({ description: 'Unique client identifier' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsString()
    @Matches(/^[a-z0-9_-]{3,50}$/i, { message: 'Invalid client ID format' })
    readonly clientId: string;

    @ApiProperty({ description: 'Deploy restart URL' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsUrl({}, { message: 'Invalid deploy key URL format' })
    readonly deployKey: string;

    @ApiProperty({ description: 'Product identifier' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsString()
    readonly product: string;

    @ApiPropertyOptional({ description: 'Paytm QR ID' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @IsString()
    readonly qrId: string;

    @ApiPropertyOptional({ description: 'Google Pay ID' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @IsString()
    readonly gpayId: string;

    @ApiPropertyOptional({ description: 'Dedicated proxy IPs' })
    @IsOptional()
    @IsArray()
    @ArrayUnique()
    @IsString({ each: true })
    readonly dedicatedIps?: string[];

    @ApiPropertyOptional({ description: 'Preferred IP country (ISO 2-letter)' })
    @Transform(({ value }: TransformFnParams) => value?.trim().toUpperCase())
    @IsOptional()
    @Matches(/^[A-Z]{2}$/, { message: 'preferredIpCountry must be a 2-letter ISO country code' })
    readonly preferredIpCountry?: string;

    @ApiPropertyOptional({ description: 'Auto-assign IPs to mobile numbers' })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    readonly autoAssignIps?: boolean;

    @ApiPropertyOptional({ description: 'First name pool for persona assignment' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    firstNames?: string[];

    @ApiPropertyOptional({ description: 'Last name pool for buffer clients' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    bufferLastNames?: string[];

    @ApiPropertyOptional({ description: 'Last name pool for promote clients' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    promoteLastNames?: string[];

    @ApiPropertyOptional({ description: 'Bio pool' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    bios?: string[];

    @ApiPropertyOptional({ description: 'Profile pic URL pool' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @IsUrl({}, { each: true })
    profilePics?: string[];
}
