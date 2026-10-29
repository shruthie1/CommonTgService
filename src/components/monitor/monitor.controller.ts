import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { istDate, MONITOR_PERIODS, MonitorPeriod } from './monitor-time';
import { REVENUE_HISTORY_FROM } from './monitor-util';
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** IST date 'YYYY-MM-DD', a real calendar day, from 2026-10-04 (payment_event start) to today IST. */
export function parsePaidDate(date: string | undefined, now: number): string {
  if (!date || !DATE_RE.test(date)) throw new BadRequestException('date must be YYYY-MM-DD (IST)');
  const t = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== date) throw new BadRequestException('date is not a calendar date');
  if (date < REVENUE_HISTORY_FROM) throw new BadRequestException(`date must be on or after ${REVENUE_HISTORY_FROM} (payment data start)`);
  if (date > istDate(now)) throw new BadRequestException('date is in the future (IST)');
  return date;
}

export function parseOptionalClientId(clientId?: string): string | null {
  if (clientId === undefined || clientId === '') return null;
  if (!CLIENT_ID_RE.test(clientId)) throw new BadRequestException('invalid clientId');
  return clientId;
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

  /**
   * Chats credited on one IST day, one row per (clientId, chatId), from Postgres payment_event.
   * 400 on a bad/future/pre-2026-10-04 date, 503 when Postgres fails. Declared before client/:clientId.
   */
  @Get('paid-chats')
  @ApiQuery({ name: 'date', required: true, description: 'IST date YYYY-MM-DD, 2026-10-04 to today' })
  @ApiQuery({ name: 'clientId', required: false })
  paidChats(@Query('date') date?: string, @Query('clientId') clientId?: string) {
    return this.service.paidChats(parsePaidDate(date, Date.now()), parseOptionalClientId(clientId));
  }

  @Get('client/:clientId')
  @ApiParam({ name: 'clientId' })
  @ApiQuery({ name: 'days', required: false, enum: ['7', '30'] })
  async client(@Param('clientId') clientId: string, @Query('days') days?: string) {
    if (!CLIENT_ID_RE.test(clientId ?? '')) throw new BadRequestException('invalid clientId');
    return this.service.client(clientId, parseDays(days));
  }
}
