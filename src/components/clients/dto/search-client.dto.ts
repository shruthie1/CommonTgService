import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsOptional, IsString, IsArray, IsUrl, Matches, ArrayNotEmpty } from 'class-validator';

export class SearchClientDto {
    @ApiPropertyOptional({ description: 'Client ID of the client' })
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

    @ApiPropertyOptional({ description: 'Channel link of the client' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @IsString()
    channelLink?: string;

    @ApiPropertyOptional({ description: 'Link of the client' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @IsUrl({}, { message: 'Invalid URL format' })
    link?: string;

    @ApiPropertyOptional({ description: 'Name of the client' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({ description: 'Phone number of the client' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @Matches(/^\+?[0-9]{10,15}$/, { message: 'Invalid phone number format' })
    number?: string;

    @ApiPropertyOptional({ description: 'Password of the client' })
    @IsOptional()
    @IsString()
    password?: string;

    @ApiPropertyOptional({ description: 'Repl link of the client' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @IsUrl({}, { message: 'Invalid URL format' })
    repl?: string;

    @ApiPropertyOptional({ description: 'Promotion Repl link of the client' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @IsUrl({}, { message: 'Invalid URL format' })
    promoteRepl?: string;

    @ApiPropertyOptional({ description: 'Clientname of the client' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @IsString()
    clientName?: string;

    @ApiPropertyOptional({ description: 'Deployment key URL' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @IsUrl({}, { message: 'Invalid URL format' })
    deployKey?: string;

    @ApiPropertyOptional({ description: 'Main account of the client' })
    @Transform(({ value }: TransformFnParams) => value?.trim().toLowerCase())
    @IsOptional()
    @IsString()
    mainAccount?: string;

    @ApiPropertyOptional({ description: 'Product associated with the client' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @IsString()
    product?: string;

    @ApiPropertyOptional({ description: 'Search by client ID that has promote mobiles assigned' })
    @Transform(({ value }: TransformFnParams) => value?.trim().toLowerCase())
    @IsOptional()
    @IsString()
    @Matches(/^(true|false)$/i, { message: 'hasPromoteMobiles must be either "true" or "false"' })
    hasPromoteMobiles?: string;

    @ApiPropertyOptional({ description: 'Paytm QR ID of the client' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @IsString()
    qrId?: string;

    @ApiPropertyOptional({ description: 'Google Pay ID of the client' })
    @Transform(({ value }: TransformFnParams) => value?.trim())
    @IsOptional()
    @IsString()
    gpayId?: string;
}
