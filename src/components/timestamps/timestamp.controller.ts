import { Controller, Get, Body, Patch, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiQuery } from '@nestjs/swagger';
import { TimestampService } from './timestamp.service';

@ApiTags('Timestamps')
@Controller('timestamps')
export class TimestampController {
  constructor(private readonly timestampService: TimestampService) {}

  @Get()
  @ApiOperation({ summary: 'Get timestamp data' })
  async findOne(): Promise<any> {
    return this.timestampService.findOne();
  }

  @Get('stalled')
  @ApiOperation({ summary: 'Get clients with time differences greater than threshold' })
  @ApiQuery({ 
    name: 'threshold', 
    type: Number, 
    required: false, 
    description: 'Minimum time difference in minutes (default: 3)' 
  })
  async getClientsWithTimeDifference(@Query('threshold') thresholdMinutes?: number): Promise<any[]> {
    // Convert minutes to milliseconds, default to 3 minutes if not provided
    const threshold = thresholdMinutes ? thresholdMinutes * 60 * 1000 : 3 * 60 * 1000;
    return this.timestampService.getClientsWithTimeDifference(threshold);
  }

  @Patch()
  @ApiOperation({ summary: 'Update timestamp data' })
  @ApiBody({ type: Object })
  async update(@Body() updateTimestampDto: any): Promise<any> {
    return this.timestampService.update(updateTimestampDto);
  }
}