import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min, Max } from 'class-validator';

export class CleanupSessionsDto {
    @ApiProperty({
        example: 5,
        description: 'Maximum number of old sessions to keep',
        minimum: 0,
        maximum: 20,
        default: 5,
        required: false
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(20)
    readonly maxSessions?: number;
}
