import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TranslateService } from './translate.service';

/**
 * Hard ceiling on one request. The service batches internally at MAX_BATCH_SIZE; this simply stops a
 * client asking for a thousand messages in one call.
 */
const MAX_MESSAGES_PER_REQUEST = 200;

export class TranslateBatchDto {
    @ApiProperty({
        type: [String],
        description: 'Chat messages to translate, in display order. The response preserves this order exactly.',
    })
    @IsArray()
    @ArrayMaxSize(MAX_MESSAGES_PER_REQUEST)
    @IsString({ each: true })
    messages: string[];

    @ApiPropertyOptional({ description: 'Target language name. Defaults to English.' })
    @IsString()
    @IsOptional()
    targetLang?: string;

    @ApiPropertyOptional({
        type: [String],
        description:
            'Earlier turns from the same chat, oldest first, used as REFERENCE ONLY — they are never '
            + 'translated or returned. Supplying these materially improves short ambiguous replies '
            + '("apram", "sari"), which are most of a chat. Capped server-side; send the ~10 messages '
            + 'immediately preceding the batch. Prefix with a speaker label ("me: ...") when known.',
    })
    @IsArray()
    @ArrayMaxSize(50)
    @IsString({ each: true })
    @IsOptional()
    context?: string[];
}

@ApiTags('Translate')
@Controller('translate')
export class TranslateController {
    constructor(private readonly translateService: TranslateService) { }

    @Post('batch')
    @ApiOperation({
        summary: 'Translate a batch of chat messages',
        description:
            'Proxies translation server-side so no provider key ships in the browser bundle. '
            + 'Returns one translation per input message, in the same order. On provider failure the '
            + 'ORIGINAL text is returned for that message rather than an error, so a chat always renders.',
    })
    @ApiBody({ type: TranslateBatchDto })
    @ApiResponse({ status: 201, description: 'Translations in input order.' })
    async translateBatch(@Body() body: TranslateBatchDto) {
        const context = (body.context || []).map(line => {
            const separator = line.indexOf(':');
            // Accept "speaker: text" but do not require it — a bare line is still useful context.
            return separator > 0 && separator < 12
                ? { speaker: line.slice(0, separator).trim(), text: line.slice(separator + 1).trim() }
                : { text: line };
        });
        return this.translateService.translateBatch(body.messages, body.targetLang || 'English', context);
    }
}
