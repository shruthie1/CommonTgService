import { IsString, IsNumber, IsOptional, IsArray, IsBoolean, Min, Max, Length, ArrayMinSize, ArrayMaxSize, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export class DialogsQueryDto {
    @ApiPropertyOptional({ description: 'Number of dialogs to fetch', required: false, type: Number, minimum: 1, maximum: 1000 })
    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    @IsNumber()
    @Min(1, { message: 'Limit must be at least 1' }) // Adjusted to remove redundant @Min(0)
    @Max(1000, { message: 'Limit cannot exceed 1000' })
    limit: number = 100;

    @ApiPropertyOptional({ description: 'Dialog offset', required: false, type: Number, minimum: 0 })
    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    @IsNumber()
    @Min(0)
    @Min(0, { message: 'Offset must be non-negative' })
    offsetId?: number = 0;

    @ApiPropertyOptional({ description: 'Include archived chats', required: false, type: Boolean })
    @IsOptional()
    @Transform(({ value }) => {
        if (value === 'true') return true;
        if (value === 'false') return false;
        return value;
    })
    @IsBoolean({ message: 'Archived must be a boolean value (true/false)' })
    archived?: boolean = false;
}

export class MessageQueryDto {
    @ApiProperty({ description: 'Entity to get messages from', type: String, minLength: 1, maxLength: 255 })
    @IsString()
    @IsNotEmpty()
    @Length(1, 255, { message: 'Entity ID must be between 1 and 255 characters' })
    entityId!: string;

    @ApiProperty({ description: 'Number of messages to fetch', required: false, type: Number, minimum: 1, maximum: 1000 })
    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    @IsNumber()
    @Min(0)
    @Min(1, { message: 'Limit must be at least 1' })
    @Max(1000, { message: 'Limit cannot exceed 1000' })
    limit?: number = 100;

    @ApiProperty({ description: 'Message offset ID', required: false, type: Number, minimum: 0 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 0 })
    offsetId?: number = 0;
}

export class BulkMessageOperationDto {
    @ApiProperty({ description: 'Source chat ID', type: String, minLength: 1, maxLength: 255 })
    @IsString()
    @IsNotEmpty()
    @Length(1, 255)
    fromChatId!: string;

    @ApiProperty({ description: 'Target chat ID', type: String, minLength: 1, maxLength: 255 })
    @IsString()
    @IsNotEmpty()
    @Length(1, 255)
    toChatId!: string;

    @ApiProperty({ description: 'Message IDs to operate on', type: [Number], minItems: 1, maxItems: 100 })
    @IsArray()
    @ArrayMinSize(1, { message: 'At least one message ID is required' })
    @ArrayMaxSize(100, { message: 'Cannot operate on more than 100 messages at once' })
    @IsNumber({}, { each: true })
    @Transform(({ value }) => Array.isArray(value) ? value.map(Number) : value)
    messageIds!: number[];
}