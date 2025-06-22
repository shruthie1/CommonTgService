import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export enum ArrayOperationType {
  PUSH = 'PUSH',
  POP = 'POP',
  INSERT = 'INSERT',
  REMOVE = 'REMOVE',
  UPDATE = 'UPDATE',
}

export class ArrayOperation {
  @ApiProperty({
    enum: ArrayOperationType,
    description: 'Type of array operation to perform',
  })
  @IsEnum(ArrayOperationType)
  type: ArrayOperationType;

  @ApiProperty({
    description: 'Index for array operations (required for INSERT and UPDATE)',
    required: false,
  })
  @IsOptional()
  index?: number;
}

export class UpdateDynamicDataDto {
  @ApiProperty({
    description: 'Path to the field to update using dot notation',
    example: 'profile.age',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9]+([\._][a-zA-Z0-9]+)*$/, {
    message: 'Invalid path format. Use dot notation (e.g., profile.age)',
  })
  readonly path: string;

  @ApiProperty({
    description: 'New value for the field',
    example: 31,
  })
  @IsNotEmpty()
  readonly value: any;

  @ApiProperty({
    description: 'Array operation configuration',
    required: false,
    type: ArrayOperation,
  })
  @IsOptional()
  readonly arrayOperation?: ArrayOperation;
}
