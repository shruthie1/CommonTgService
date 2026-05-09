import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import { IsOptional, IsString, IsBoolean, IsNumber, Matches } from 'class-validator';
import { CANONICAL_MOBILE_REGEX, normalizeMobileInput } from '../../shared/mobile-utils';

const toBoolean = ({ value }: TransformFnParams): boolean => value === 'true' || value === true;

export class SetupClientQueryDto {
    @ApiPropertyOptional({ description: 'Days to push availability forward', default: 0 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    days?: number = 0;

    @ApiPropertyOptional({ description: 'Archive the old client back to buffer pool', default: true })
    @IsOptional()
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
    @Transform(toBoolean)
    @IsBoolean()
    formalities: boolean = true;

    @ApiPropertyOptional({ description: 'Reason for triggering the swap (e.g. permanent error from tg-aut)' })
    @IsOptional()
    @IsString()
    reason?: string;
}
