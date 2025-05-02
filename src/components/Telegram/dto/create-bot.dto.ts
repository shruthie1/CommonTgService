import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateBotDto {
    @ApiProperty({
        description: 'Name of the bot (required)',
        example: 'MyAwesomeBot'
    })
    @IsNotEmpty()
    @IsString()
    @MaxLength(64)
    name: string;

    @ApiProperty({
        description: 'Username for the bot (required)',
        example: 'my_awesome_bot'
    })
    @IsNotEmpty()
    @IsString()
    @MaxLength(32)
    username: string;

    @ApiProperty({
        description: 'Description of what your bot can do',
        example: 'This bot helps you manage your tasks',
        required: false
    })
    @IsOptional()
    @IsString()
    @MaxLength(512)
    description?: string;

    @ApiProperty({
        description: 'What the bot can be used for',
        example: 'Task Management, Reminders, Notes',
        required: false
    })
    @IsOptional()
    @IsString()
    @MaxLength(512)
    aboutText?: string;

    @ApiProperty({
        description: 'URL to the bot\'s profile photo',
        example: 'https://example.com/bot-photo.jpg',
        required: false
    })
    @IsOptional()
    @IsString()
    profilePhotoUrl?: string;
}
