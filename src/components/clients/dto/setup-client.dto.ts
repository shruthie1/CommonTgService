import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import { IsOptional, IsString, IsBoolean, IsNumber } from 'class-validator';

export class SetupClientQueryDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    days?: number = 0;

    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ value }: TransformFnParams) => value === 'true' || value === true)
    @IsBoolean()
    archiveOld?: boolean = true;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    mobile?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ value }: TransformFnParams) => value === 'true' || value === true)
    @IsBoolean()
    formalities?: boolean = true;
}
