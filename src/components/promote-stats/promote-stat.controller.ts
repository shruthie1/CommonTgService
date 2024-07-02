import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PromoteStatService } from './promote-stat.service';
import { CreatePromoteStatDto } from './dto/create-promote-stat.dto';
import { UpdatePromoteStatDto } from './dto/update-promote-stat.dto';

@ApiTags('promote-stats')
@Controller('promote-stats')
export class PromoteStatController {
  constructor(private readonly promoteStatService: PromoteStatService) {}

  @Post()
  async create(@Body() createPromoteStatDto: CreatePromoteStatDto) {
    return this.promoteStatService.create(createPromoteStatDto);
  }

  @Get(':client')
  async findByClient(@Param('client') client: string) {
    return this.promoteStatService.findByClient(client);
  }

  @Put(':client')
  async update(
    @Param('client') client: string,
    @Body() updatePromoteStatDto: UpdatePromoteStatDto,
  ) {
    return this.promoteStatService.update(client, updatePromoteStatDto);
  }

  @Delete(':client')
  async deleteOne(@Param('client') client: string) {
    return this.promoteStatService.deleteOne(client);
  }

  @Delete()
  async deleteAll() {
    return this.promoteStatService.deleteAll();
  }
}
