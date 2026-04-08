import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { EventManagerService } from './event-manager.service';
import { CreateEventDto } from './dto/create-event.dto';
import { ScheduleEventsDto } from './dto/schedule-events.dto';

@ApiTags('event-manager')
@Controller('event-manager')
export class EventManagerController {
  constructor(private readonly eventManagerService: EventManagerService) {}

  @Get()
  @ApiOperation({ summary: 'Get all events (supports query filters)' })
  async getAllEvents(@Query() filter: object) {
    const data = await this.eventManagerService.getEvents(filter);
    return { data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get event by ID' })
  async getEventById(@Param('id') id: string) {
    const data = await this.eventManagerService.getEventById(id);
    return { data };
  }

  @Post()
  @ApiOperation({ summary: 'Create a single event' })
  async createEvent(@Body() dto: CreateEventDto) {
    const data = await this.eventManagerService.create(dto);
    return { data };
  }

  @Post('schedule')
  @ApiOperation({ summary: 'Schedule paid events for a chatId+profile' })
  async schedulePaidEvents(@Body() dto: ScheduleEventsDto) {
    const data = await this.eventManagerService.schedulePaidEvents(dto.chatId, dto.profile, dto.type);
    return { data };
  }

  @Post('createMultiple')
  @ApiOperation({ summary: 'Create multiple events at once' })
  async createMultiple(@Body() events: CreateEventDto[]) {
    const data = await this.eventManagerService.createMultiple(events);
    return { data };
  }

  @Delete('delete')
  @ApiOperation({ summary: 'Delete all events for a chatId' })
  async deleteMultiple(@Query('chatId') chatId: string) {
    const entriesDeleted = await this.eventManagerService.deleteMultiple(chatId);
    return { status: 'Deleted Sucessfully', entriesDeleted };
  }
}
