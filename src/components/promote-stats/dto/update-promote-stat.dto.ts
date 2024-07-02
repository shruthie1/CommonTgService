// update-promote-stat.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreatePromoteStatDto } from './create-promote-stat.dto';

export class UpdatePromoteStatDto extends PartialType(CreatePromoteStatDto) {}
