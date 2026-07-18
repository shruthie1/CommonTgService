import { ApiProperty } from '@nestjs/swagger';
import { IsUrl, IsObject, IsString, IsNotEmpty } from 'class-validator';

export class UploadByUrlDto {
    @ApiProperty({ example: "videos" })
    @IsString()
    @IsNotEmpty()
    folder: string;

    @ApiProperty({
        example: {
            intro: 'https://cdn.example.com/video1.mp4',
            welcome: 'https://cdn.example.com/welcome',
        },
    })
    @IsObject()
    files: Record<string, string>;
}
