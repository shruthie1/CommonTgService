// update-stat.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateStatDto } from './create-stat2.dto';

export class UpdateStatDto extends PartialType(CreateStatDto) {}
