import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { StatService } from './stat.service';
import { CreateStatDto } from './create-stat.dto';
import { UpdateStatDto } from './update-stat.dto';

/** The row key is {chatId, profile, client}: without client a sibling client's row could match (stats2 audit A4). */
function requireClient(client: string | undefined): string {
  const value = typeof client === 'string' ? client.trim() : '';
  if (!value) throw new BadRequestException('client query parameter is required (?client=<clientId>)');
  return value;
}

@ApiTags('stats')
@Controller('stats')
export class StatController {
  constructor(private readonly statService: StatService) {}

  @Post()
  async create(@Body() createStatDto: CreateStatDto) {
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
    @Body() updateStatDto: UpdateStatDto,
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
