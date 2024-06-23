import { Controller, Get, Body, Param, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { ConfigurationService } from './init.service';

@ApiTags('Configuration')
@Controller('Configuration')
export class ConfigurationController {
  constructor(private readonly configurationService: ConfigurationService) {}

  @Get()
  @ApiOperation({ summary: 'Get configuration data' })
  async findOne(): Promise<any>{
    return this.configurationService.findOne();
  }

  @Patch()
  @ApiOperation({ summary: 'Update configuration' })
  @ApiBody({type: Object})
  async update( @Body() updateClientDto: any): Promise<any> {
    return this.configurationService.update( updateClientDto);
  }

}
