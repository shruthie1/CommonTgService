import { Controller, Get, Body, Param, Patch, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { BuildService } from './build.service';
import { CloudflareCache } from '../../decorators';
import { CloudflareCacheInterceptor } from '../../interceptors';

@ApiTags('Build')
@Controller('builds')
export class BuildController {
  constructor(private readonly buildService: BuildService) { }

  @Get()
  @UseInterceptors(CloudflareCacheInterceptor)
  @CloudflareCache(3600, 60)
  @ApiOperation({ summary: 'Get build data' })
  async findOne(): Promise<any> {
    return this.buildService.findOne();
  }

  @Patch()
  @ApiOperation({ summary: 'Update build' })
  @ApiBody({ type: Object })
  async update(@Body() updateClientDto: any): Promise<any> {
    return this.buildService.update(updateClientDto);
  }

}
