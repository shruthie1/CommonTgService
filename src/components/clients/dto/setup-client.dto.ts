import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import { IsOptional, IsString, IsBoolean, IsNumber } from 'class-validator';

export class SetupClientQueryDto {
    @ApiPropertyOptional({
        type: Number,
        default: 3
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    days?: number = 0;

    @ApiPropertyOptional({
        type: Boolean,
        default: true
    })
    @IsOptional()
    @Transform(({ value }) => value === 'true' || value === true)
    @Type(() => Boolean)
    @IsBoolean()
    archiveOld?: boolean = true;

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
    @Transform(({ value }) => {
        console.log(value)
        return value === 'true' || value === true})
    @IsBoolean()
    formalities?: boolean = true;
}
