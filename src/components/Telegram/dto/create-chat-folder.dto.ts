import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateChatFolderDto {
    @ApiProperty({ description: 'Name of the chat folder' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ description: 'List of chat IDs to include in the folder' })
    @IsArray()
    @IsNotEmpty()
    includedChats: string[];

    @ApiProperty({ description: 'List of chat IDs to exclude from the folder', required: false })
    @IsArray()
    @IsOptional()
    excludedChats?: string[];

    @ApiProperty({ description: 'Include contacts in the folder', required: false, default: true })
    @IsBoolean()
    @IsOptional()
    includeContacts?: boolean;

    @ApiProperty({ description: 'Include non-contacts in the folder', required: false, default: true })
    @IsBoolean()
    @IsOptional()
    includeNonContacts?: boolean;

    @ApiProperty({ description: 'Include groups in the folder', required: false, default: true })
    @IsBoolean()
    @IsOptional()
    includeGroups?: boolean;

    @ApiProperty({ description: 'Include broadcast channels in the folder', required: false, default: true })
    @IsBoolean()
    @IsOptional()
    includeBroadcasts?: boolean;

    @ApiProperty({ description: 'Include bots in the folder', required: false, default: true })
    @IsBoolean()
    @IsOptional()
    includeBots?: boolean;

    @ApiProperty({ description: 'Exclude muted chats from the folder', required: false, default: false })
    @IsBoolean()
    @IsOptional()
    excludeMuted?: boolean;

    @ApiProperty({ description: 'Exclude read chats from the folder', required: false, default: false })
    @IsBoolean()
    @IsOptional()
    excludeRead?: boolean;

    @ApiProperty({ description: 'Exclude archived chats from the folder', required: false, default: false })
    @IsBoolean()
    @IsOptional()
    excludeArchived?: boolean;
}