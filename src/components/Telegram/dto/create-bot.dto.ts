import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateTgBotDto {
    @ApiProperty({
        description: 'Name of the bot (required)'})
    @IsNotEmpty()
    @IsString()
    @MaxLength(64)
    name: string;

    @ApiProperty({
        description: 'Username for the bot (required)'})
    @IsNotEmpty()
    @IsString()
    @MaxLength(32)
    username: string;

    @ApiProperty({
        description: 'Description of what your bot can do',
        required: false
    })
    @IsOptional()
    @IsString()
    @MaxLength(512)
    description?: string;

    @ApiProperty({
        description: 'What the bot can be used for',
        required: false
    })
    @IsOptional()
    @IsString()
    @MaxLength(512)
    aboutText?: string;

    @ApiProperty({
        description: 'URL to the bot\'s profile photo',
        required: false
    })
    @IsOptional()
    @IsString()
    profilePhotoUrl?: string;
}
