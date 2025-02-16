import { IsString, IsOptional, IsEnum, IsObject, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Method } from 'axios';

export class ExecuteRequestDto {
    @ApiProperty({ description: 'The URL to send the request to' })
    @IsUrl({}, { message: 'Please provide a valid URL' })
    url: string;

    @ApiPropertyOptional({ enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], default: 'GET' })
    @IsEnum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const)
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
}