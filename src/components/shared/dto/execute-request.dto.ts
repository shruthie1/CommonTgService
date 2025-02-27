import { IsString, IsOptional, IsEnum, IsObject, IsUrl, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Method } from 'axios';
import { Transform } from 'class-transformer';

export enum ResponseType {
    JSON = 'json',
    TEXT = 'text',
    BLOB = 'blob',
    ARRAYBUFFER = 'arraybuffer',
    STREAM = 'stream'
}

export class ExecuteRequestDto {
    @ApiProperty({ description: 'The URL to send the request to' })
    @IsUrl({}, { message: 'Please provide a valid URL' })
    url: string;

    @ApiPropertyOptional({ enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'], default: 'GET' })
    @IsEnum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const)
    @IsOptional()
    method?: Method;

    @ApiPropertyOptional({ type: Object, additionalProperties: { type: "string" } })
    @IsObject()
    @IsOptional()
    headers?: Record<string, string>;

    @ApiPropertyOptional({ description: 'Request body data' })
    @IsOptional()
    data?: any;

    @ApiPropertyOptional({ type: Object, additionalProperties: { type: 'string' } })
    @IsObject()
    @IsOptional()
    params?: Record<string, string>;

    @ApiPropertyOptional({ enum: ResponseType, default: ResponseType.JSON })
    @IsEnum(ResponseType)
    @IsOptional()
    responseType?: ResponseType;

    @ApiPropertyOptional({ description: 'Request timeout in milliseconds', default: 30000, minimum: 1000, maximum: 300000 })
    @IsNumber()
    @Min(1000)
    @Max(300000)
    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    timeout?: number;

    @ApiPropertyOptional({ description: 'Whether to follow redirects', default: true })
    @IsOptional()
    @Transform(({ value }) => value === 'true' || value === true)
    followRedirects?: boolean;

    @ApiPropertyOptional({ description: 'Maximum number of redirects to follow', default: 5, minimum: 0, maximum: 10 })
    @IsNumber()
    @Min(0)
    @Max(10)
    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    maxRedirects?: number;
}