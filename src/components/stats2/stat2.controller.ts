import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { Stat2Service } from './stat2.service';
import { CreateStat2Dto } from './create-stat2.dto';
import { UpdateStat2Dto } from './update-stat2.dto';

/** The row key is {chatId, profile, client}: without client a sibling client's row could match (stats2 audit A4). */
function requireClient(client: string | undefined): string {
  const value = typeof client === 'string' ? client.trim() : '';
  if (!value) throw new BadRequestException('client query parameter is required (?client=<clientId>)');
  return value;
}

@ApiTags('stats2')
@Controller('stats2')
export class Stat2Controller {
  constructor(private readonly statService: Stat2Service) {}

  @Post()
  async create(@Body() createStatDto: CreateStat2Dto) {
    return this.statService.create(createStatDto);
  }

  @Get(':chatId/:profile')
  @ApiQuery({ name: 'client', required: true, description: 'clientId of the row (sibling clients share a persona)' })
  async findByChatIdAndProfile(@Param('chatId') chatId: string, @Param('profile') profile: string, @Query('client') client: string) {
    return this.statService.findByChatIdAndProfile(chatId, profile, requireClient(client));
  }

  @Put(':chatId/:profile')
  @ApiQuery({ name: 'client', required: true, description: 'clientId of the row (sibling clients share a persona)' })
  async update(
    @Param('chatId') chatId: string,
    @Param('profile') profile: string,
    @Query('client') client: string,
    @Body() updateStatDto: UpdateStat2Dto,
  ) {
    return this.statService.update(chatId, profile, requireClient(client), updateStatDto);
  }

  @Delete(':chatId/:profile')
  @ApiQuery({ name: 'client', required: true, description: 'clientId of the row (sibling clients share a persona)' })
  async deleteOne(@Param('chatId') chatId: string, @Param('profile') profile: string, @Query('client') client: string) {
    return this.statService.deleteOne(chatId, profile, requireClient(client));
  }

  @Delete()
  async deleteAll() {
    return this.statService.deleteAll();
  }
}
