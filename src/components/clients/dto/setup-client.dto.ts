import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import { IsOptional, IsString, IsBoolean, IsNumber } from 'class-validator';

const toBoolean = ({ value }: TransformFnParams): boolean => value === 'true' || value === true;

export class SetupClientQueryDto {
    @ApiPropertyOptional({
        type: Number,
        default: 0
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    days?: number = 0;

    @ApiPropertyOptional({
        default: true
    })
    @IsOptional()
    @Transform(toBoolean)
    @IsBoolean()
    archiveOld: boolean = true;

    @ApiPropertyOptional({
        type: String
    })
    @IsOptional()
    @IsString()
    mobile?: string;

    @ApiPropertyOptional({
        default: true
    })
    @IsOptional()
    @Transform(toBoolean)
    @IsBoolean()
    formalities: boolean = true;
}
