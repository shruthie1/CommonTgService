import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MONITOR_PERIODS, MonitorPeriod } from './monitor-time';
import { LIVE_SVCS, LiveSvc, MonitorService } from './monitor.service';

const CLIENT_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

export function parsePeriod(period?: string): MonitorPeriod {
  if (period === undefined || period === '') return 'today';
  if ((MONITOR_PERIODS as string[]).includes(period)) return period as MonitorPeriod;
  throw new BadRequestException(`period must be one of ${MONITOR_PERIODS.join('|')}`);
}

export function parseDays(days?: string): 7 | 30 {
  if (days === undefined || days === '' || days === '7') return 7;
  if (days === '30') return 30;
  throw new BadRequestException('days must be 7 or 30');
}

export function parseSvc(svc?: string): LiveSvc | 'all' {
  if (svc === undefined || svc === '' || svc === 'all') return 'all';
  if ((LIVE_SVCS as readonly string[]).includes(svc)) return svc as LiveSvc;
  throw new BadRequestException(`svc must be one of ${LIVE_SVCS.join('|')}|all`);
}

/** Read-only monitoring UI API. Additive; existing endpoints untouched. Auth: global AuthGuard. */
@ApiTags('monitor')
@Controller('monitor')
export class MonitorController {
  constructor(private readonly service: MonitorService) {}

  @Get('fleet')
  @ApiQuery({ name: 'period', required: false, enum: MONITOR_PERIODS })
  async fleet(@Query('period') period?: string) {
    return this.service.fleet(parsePeriod(period));
  }

  @Get('live')
  @ApiQuery({ name: 'svc', required: false, enum: ['tg-aut', 'promote', 'all'] })
  async live(@Query('svc') svc?: string) {
    return this.service.live(parseSvc(svc));
  }

  /** Client-detail shape aggregated over every client. Declared before client/:clientId. */
  @Get('fleet/detail')
  @ApiQuery({ name: 'days', required: false, enum: ['7', '30'] })
  fleetDetail(@Query('days') days?: string) {
    return this.service.fleetDetail(parseDays(days));
  }

  @Get('client/:clientId')
  @ApiParam({ name: 'clientId' })
  @ApiQuery({ name: 'days', required: false, enum: ['7', '30'] })
  async client(@Param('clientId') clientId: string, @Query('days') days?: string) {
    if (!CLIENT_ID_RE.test(clientId ?? '')) throw new BadRequestException('invalid clientId');
    return this.service.client(clientId, parseDays(days));
  }
}
