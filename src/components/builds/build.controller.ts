import { Controller, Get, Body, Param, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { BuildService } from './build.service';

@ApiTags('Build')
@Controller('build')
export class BuildController {
  constructor(private readonly buildService: BuildService) {}

  @Get()
  @ApiOperation({ summary: 'Get build data' })
  async findOne(): Promise<any>{
    return this.buildService.findOne();
  }

  @Patch()
  @ApiOperation({ summary: 'Update build' })
  @ApiBody({type: Object})
  async update( @Body() updateClientDto: any): Promise<any> {
    return this.buildService.update( updateClientDto);
  }

}
