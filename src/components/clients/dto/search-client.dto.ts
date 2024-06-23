import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';

export class SearchClientDto {
    @ApiPropertyOptional({ description: 'Client ID of the client' })
    @Transform(({ value }: TransformFnParams) => value?.trim().toLowerCase())
    clientId?: string;
    
    @ApiPropertyOptional({ description: 'Database collection name' })
    @Transform(({ value }: TransformFnParams) => value?.trim().toLowerCase())
    dbcoll?: string;

    @ApiPropertyOptional({ description: 'Channel link of the client' })
    channelLink?: string;

    @ApiPropertyOptional({ description: 'Link of the client' })
    link?: string;

    @ApiPropertyOptional({ description: 'Name of the client' })
    name?: string;

    @ApiPropertyOptional({ description: 'Phone number of the client' })
    number?: string;

    @ApiPropertyOptional({ description: 'Password of the client' })
    password?: string;

    @ApiPropertyOptional({ description: 'Repl link of the client' })
    repl?: string;

    @ApiPropertyOptional({ description: 'Clientname of the client' })
    clientName?: string;

    @ApiPropertyOptional({ description: 'Deployment key URL' })
    deployKey?: string;

    @ApiPropertyOptional({ description: 'Main account of the client' })
    @Transform(({ value }: TransformFnParams) => value?.trim().toLowerCase())
    mainAccount?: string;

    @ApiPropertyOptional({ description: 'Product associated with the client' })
    product?: string;
}
