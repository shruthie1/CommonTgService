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
    @Type(() => Boolean)
    @IsBoolean()
    archiveOld?: boolean = true;

    @ApiPropertyOptional({
        type:String
    })
    @IsOptional()
    @IsString()
    mobile?: string;

    @ApiPropertyOptional({
        type: Boolean,
        default: true
    })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    formalities?: boolean = true;
}
