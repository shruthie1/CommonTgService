import { Controller, Get, Body, Param, Patch, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { ConfigurationService } from './init.service';
import { NoCache } from '../../decorators';
import { CloudflareCacheInterceptor } from '../../interceptors';

@ApiTags('Configuration')
@Controller('configuration')
export class ConfigurationController {
  constructor(private readonly configurationService: ConfigurationService) { }

  @Get()
  @UseInterceptors(CloudflareCacheInterceptor)
  @NoCache() // contains every secret: never cacheable
  @ApiOperation({ summary: 'Get configuration data' })
  async findOne(): Promise<any> {
    return this.configurationService.findOne();
  }

  @Patch()
  @ApiOperation({ summary: 'Update configuration' })
  @ApiBody({ type: Object })
  async update(@Body() updateClientDto: any): Promise<any> {
    return this.configurationService.update(updateClientDto);
  }

}
