import { PartialType } from '@nestjs/swagger';
import { CreateBufferClientDto } from './create-buffer-client.dto';

export class UpdateBufferClientDto extends PartialType(CreateBufferClientDto) {}
