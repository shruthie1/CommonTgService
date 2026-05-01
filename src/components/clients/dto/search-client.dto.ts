import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsOptional, IsString, IsUrl, Matches } from 'class-validator';

export class SearchClientDto {
    @ApiPropertyOptional({ description: 'Client ID' })
    @Transform(({ value }: TransformFnParams) => value?.trim().toLowerCase())
    @IsOptional()
    @IsString()
    @Matches(/^[a-z0-9_-]{3,50}$/i, { message: 'Invalid client ID format' })
    clientId?: string;

    @ApiPropertyOptional({ description: 'Database collection name' })
    @Transform(({ value }: TransformFnParams) => value?.trim().toLowerCase())
    @IsOptional()
    @IsString()
    dbcoll?: string;

    @ApiPropertyOptional({ description: 'Channel link' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @IsString()
    channelLink?: string;

    @ApiPropertyOptional({ description: 'Client link' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @IsUrl({}, { message: 'Invalid URL format' })
    link?: string;

    @ApiPropertyOptional({ description: 'Display name' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({ description: 'Mobile number' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @Matches(/^\+?[0-9]{10,15}$/, { message: 'Invalid phone number format' })
    mobile?: string;

    @ApiPropertyOptional({ description: 'Password' })
    @IsOptional()
    @IsString()
    password?: string;

    @ApiPropertyOptional({ description: 'tg-aut repl link' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @IsUrl({}, { message: 'Invalid URL format' })
    repl?: string;

    @ApiPropertyOptional({ description: 'Promote repl link' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @IsUrl({}, { message: 'Invalid URL format' })
    promoteRepl?: string;

    @ApiPropertyOptional({ description: 'Deploy restart URL' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @IsUrl({}, { message: 'Invalid URL format' })
    deployKey?: string;

    @ApiPropertyOptional({ description: 'Product identifier' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @IsString()
    product?: string;

    @ApiPropertyOptional({ description: 'Paytm QR ID' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @IsString()
    qrId?: string;

    @ApiPropertyOptional({ description: 'Google Pay ID' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @IsString()
    gpayId?: string;
}
