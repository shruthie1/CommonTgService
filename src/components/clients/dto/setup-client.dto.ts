import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import { IsOptional, IsString, IsBoolean, IsNumber } from 'class-validator';

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
    @IsString()
    mobile?: string;

    @ApiPropertyOptional({ description: 'Run privacy/cleanup formalities on old account', default: true })
    @IsOptional()
    @Transform(toBoolean)
    @IsBoolean()
    formalities: boolean = true;
}
