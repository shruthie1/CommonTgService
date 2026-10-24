import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import { IsOptional, IsString, IsBoolean, IsInt, Matches, Max, Min } from 'class-validator';
import { CANONICAL_MOBILE_REGEX, normalizeMobileInput } from '../../shared/mobile-utils';

const toBoolean = ({ value }: TransformFnParams): boolean => value === 'true' || value === true;

export class SetupClientQueryDto {
    @ApiPropertyOptional({ description: 'Days to push availability forward (0-35)', default: 0, minimum: 0, maximum: 35 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @Max(35)
    days?: number = 0;

    @ApiPropertyOptional({ description: 'Legacy flag: return the replaced client to the buffer pool', default: true })
    @IsOptional()
    @Type(() => String)
    @Transform(toBoolean)
    @IsBoolean()
    archiveOld: boolean = true;

    @ApiPropertyOptional({ description: 'Specific mobile to use as replacement' })
    @IsOptional()
    @Transform(({ value }: TransformFnParams) => typeof value === 'string' ? normalizeMobileInput(value) : value)
    @IsString()
    @Matches(CANONICAL_MOBILE_REGEX, { message: 'mobile must include country code and contain 11-15 digits' })
    mobile?: string;

    @ApiPropertyOptional({ description: 'Run privacy/cleanup formalities on old account', default: true })
    @IsOptional()
    @Type(() => String)
    @Transform(toBoolean)
    @IsBoolean()
    formalities: boolean = true;

    @ApiPropertyOptional({ description: 'Reason for triggering the swap (e.g. permanent error from tg-aut)' })
    @IsOptional()
    @IsString()
    reason?: string;

    @ApiPropertyOptional({
        description: 'The mobile the calling tg-aut process runs on. When present and not the client\'s current main, CMS answers stale_report and does nothing (a late report from a replaced process). Not validated strictly: an unparseable value counts as absent.',
    })
    // Never a 400: a repeated param (Express array) takes its first element; any other non-string is absent.
    @IsOptional()
    @Transform(({ value }: TransformFnParams) => {
        const first = Array.isArray(value) ? value[0] : value;
        return typeof first === 'string' ? first : undefined;
    })
    @IsString()
    reportedMobile?: string;
}
