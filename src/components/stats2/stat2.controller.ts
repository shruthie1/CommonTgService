import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Stat2Service } from './stat2.service';
import { CreateStatDto } from './create-stat2.dto';
import { UpdateStatDto } from './update-stat2.dto';

@ApiTags('stats2')
@Controller('stats2')
export class Stat2Controller {
  constructor(private readonly statService: Stat2Service) {}

  @Post()
  async create(@Body() createStatDto: CreateStatDto) {
    return this.statService.create(createStatDto);
  }

  @Get(':chatId/:profile')
  async findByChatIdAndProfile(@Param('chatId') chatId: string, @Param('profile') profile: string) {
    return this.statService.findByChatIdAndProfile(chatId, profile);
  }

  @Put(':chatId/:profile')
  async update(
    @Param('chatId') chatId: string,
    @Param('profile') profile: string,
    @Body() updateStatDto: UpdateStatDto,
  ) {
    return this.statService.update(chatId, profile, updateStatDto);
  }

  @Delete(':chatId/:profile')
  async deleteOne(@Param('chatId') chatId: string, @Param('profile') profile: string) {
    return this.statService.deleteOne(chatId, profile);
  }

  @Delete()
  async deleteAll() {
    return this.statService.deleteAll();
  }
}
