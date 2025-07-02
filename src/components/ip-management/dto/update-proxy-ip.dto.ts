import { PartialType } from '@nestjs/swagger';
import { CreateProxyIpDto } from './create-proxy-ip.dto';

export class UpdateProxyIpDto extends PartialType(CreateProxyIpDto) {}
