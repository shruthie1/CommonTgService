// update-stat.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateStat2Dto } from './create-stat2.dto';

export class UpdateStat2Dto extends PartialType(CreateStat2Dto) {}
