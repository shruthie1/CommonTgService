import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateFolderDto {
  @ApiProperty({
    example: 'documents',
    description: 'Name of the folder to create',
  })
  @IsString()
  @IsNotEmpty()
  folderName: string;
}

export class MoveFileDto {
  @ApiProperty({
    example: 'destination',
    description: 'New folder path for the file',
  })
  @IsString()
  @IsOptional()
  newFolder?: string;

  @ApiProperty({ example: 'newname.pdf', description: 'New name for the file' })
  @IsString()
  @IsOptional()
  newFilename?: string;
}

export class MoveFolderDto {
  @ApiProperty({
    example: 'new-location',
    description: 'New location path for the folder',
  })
  @IsString()
  @IsNotEmpty()
  newLocation: string;
}

export class RenameFolderDto {
  @ApiProperty({
    example: 'new-folder-name',
    description: 'New name for the folder',
  })
  @IsString()
  @IsNotEmpty()
  newFolderName: string;
}

export class CopyFileDto {
  @ApiProperty({
    example: 'destination',
    description: 'Destination folder for the file copy',
  })
  @IsString()
  @IsNotEmpty()
  newFolder: string;
}

export class UpdateFileMetadataDto {
  @ApiProperty({ example: 'newname.pdf', description: 'New name for the file' })
  @IsString()
  @IsOptional()
  newFilename?: string;

  @ApiProperty({
    example: 'new-folder',
    description: 'New folder for the file',
  })
  @IsString()
  @IsOptional()
  newFolder?: string;
}

export class JsonPathParams {
  @ApiProperty({
    example: ['user', 'profile', 'name'],
    description: 'Path segments to the nested value',
    isArray: true,
  })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  path: string[];
}

export class JsonQuery {
  @ApiProperty({
    example: 'data.users[0].name',
    description: 'JSON path query using dot notation',
  })
  @IsString()
  @IsNotEmpty()
  query: string;
}

export class CopyFolderDto {
  @ApiProperty({
    example: 'destination-folder',
    description: 'Destination folder for the folder copy',
  })
  @IsString()
  @IsNotEmpty()
  destinationFolder: string;
}
