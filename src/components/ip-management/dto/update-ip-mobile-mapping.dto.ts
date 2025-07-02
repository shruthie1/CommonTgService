import { PartialType } from '@nestjs/swagger';
import { CreateIpMobileMappingDto } from './create-ip-mobile-mapping.dto';

export class UpdateIpMobileMappingDto extends PartialType(CreateIpMobileMappingDto) {}
