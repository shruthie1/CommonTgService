import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { addDays, DateRange, daysIn, istDate, MAX_RANGE_DAYS, MONITOR_PERIODS, MonitorPeriod, RANGE_LOOKBACK_DAYS } from './monitor-time';
import { PROMO_WINDOWS, PromoWindow } from './monitor-promotions';
import { REACT_WINDOWS, ReactWindow } from './monitor-reactions';
import { REVENUE_HISTORY_FROM } from './monitor-util';
import { LIVE_SVCS, LiveSvc, MonitorService } from './monitor.service';

const CLIENT_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

export function parsePeriod(period?: string): MonitorPeriod {
  if (period === undefined || period === '') return 'today';
  if ((MONITOR_PERIODS as string[]).includes(period)) return period as MonitorPeriod;
  throw new BadRequestException(`period must be one of ${MONITOR_PERIODS.join('|')}`);
}

export function parseWindow(window?: string): PromoWindow {
  if (window === undefined || window === '') return 'today';
  if ((PROMO_WINDOWS as string[]).includes(window)) return window as PromoWindow;
  throw new BadRequestException(`window must be one of ${PROMO_WINDOWS.join('|')}`);
}

export function parseReactWindow(window?: string): ReactWindow {
  if (window === undefined || window === '') return 'today';
  if ((REACT_WINDOWS as string[]).includes(window)) return window as ReactWindow;
  throw new BadRequestException(`window must be one of ${REACT_WINDOWS.join('|')} (reactions are daily counters; no 24h)`);
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

/**
 * Optional IST range (design 2026-10-31 §4): `from` (+ optional `to`, default = from), both YYYY-MM-DD
 * real dates, from <= to <= today IST, at most MAX_RANGE_DAYS days, from >= max(today - 59, 2026-10-04).
 * null = no `from` (the legacy period/days/window param applies). 400 otherwise.
 */
export function parseRange(from: string | undefined, to: string | undefined, now: number): DateRange | null {
  if (from === undefined || from === '') {
    if (to !== undefined && to !== '') throw new BadRequestException('to requires from');
    return null;
  }
  const realDate = (d: string, name: string) => {
    if (!DATE_RE.test(d)) throw new BadRequestException(`${name} must be YYYY-MM-DD (IST)`);
    const t = Date.parse(`${d}T00:00:00.000Z`);
    if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== d) throw new BadRequestException(`${name} is not a calendar date`);
  };
  const end = to === undefined || to === '' ? from : to;
  realDate(from, 'from');
  realDate(end, 'to');
  const today = istDate(now);
  if (from > end) throw new BadRequestException('from must be on or before to');
  if (end > today) throw new BadRequestException('to is in the future (IST)');
  if (daysIn(from, end) > MAX_RANGE_DAYS) throw new BadRequestException(`range is longer than ${MAX_RANGE_DAYS} days`);
  const floor = [addDays(today, -RANGE_LOOKBACK_DAYS), REVENUE_HISTORY_FROM].sort()[1];
  if (from < floor) throw new BadRequestException(`from must be on or after ${floor}`);
  return { from, to: end };
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
  @ApiQuery({ name: 'from', required: false, description: 'IST YYYY-MM-DD; with to, replaces the legacy param (max 31 days)' })
  @ApiQuery({ name: 'to', required: false, description: 'IST YYYY-MM-DD inclusive (default = from)' })
  async fleet(@Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const r = parseRange(from, to, Date.now());
    return r ? this.service.fleetRange(r) : this.service.fleet(parsePeriod(period));
  }

  @Get('live')
  @ApiQuery({ name: 'svc', required: false, enum: ['tg-aut', 'promote', 'all'] })
  async live(@Query('svc') svc?: string) {
    return this.service.live(parseSvc(svc));
  }

  /** Client-detail shape aggregated over every client. Declared before client/:clientId. */
  @Get('fleet/detail')
  @ApiQuery({ name: 'days', required: false, enum: ['7', '30'] })
  @ApiQuery({ name: 'from', required: false, description: 'IST YYYY-MM-DD; with to, replaces the legacy param (max 31 days)' })
  @ApiQuery({ name: 'to', required: false, description: 'IST YYYY-MM-DD inclusive (default = from)' })
  fleetDetail(@Query('days') days?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const r = parseRange(from, to, Date.now());
    return r ? this.service.fleetDetailRange(r) : this.service.fleetDetail(parseDays(days));
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

  /**
   * Promotion health per family (tg-aut / promote), client and masked mobile. 400 on a bad window or
   * client, 503 when Postgres sends fail. Declared before client/:clientId.
   */
  @Get('promotions')
  @ApiQuery({ name: 'window', required: false, enum: PROMO_WINDOWS })
  @ApiQuery({ name: 'client', required: false })
  @ApiQuery({ name: 'from', required: false, description: 'IST YYYY-MM-DD; with to, replaces the legacy param (max 31 days)' })
  @ApiQuery({ name: 'to', required: false, description: 'IST YYYY-MM-DD inclusive (default = from)' })
  promotions(@Query('window') window?: string, @Query('client') client?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const r = parseRange(from, to, Date.now());
    const c = parseOptionalClientId(client);
    return r ? this.service.promotionsRange(r, c) : this.service.promotions(parseWindow(window), c);
  }

  /**
   * Reaction outcomes per family, client and masked mobile (daily_mobile + Redis reactions::* + Mongo
   * activeChannels). 400 on a bad window (24h included) or client, 503 when Postgres fails. Declared
   * before client/:clientId.
   */
  @Get('reactions')
  @ApiQuery({ name: 'window', required: false, enum: REACT_WINDOWS })
  @ApiQuery({ name: 'client', required: false })
  @ApiQuery({ name: 'from', required: false, description: 'IST YYYY-MM-DD; with to, replaces the legacy param (max 31 days)' })
  @ApiQuery({ name: 'to', required: false, description: 'IST YYYY-MM-DD inclusive (default = from)' })
  reactions(@Query('window') window?: string, @Query('client') client?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const r = parseRange(from, to, Date.now());
    const c = parseOptionalClientId(client);
    return r ? this.service.reactionsRange(r, c) : this.service.reactions(parseReactWindow(window), c);
  }

  /** New users -> payers by origin (direct / routed / unattributed). Declared before client/:clientId. */
  @Get('funnel')
  @ApiQuery({ name: 'period', required: false, enum: MONITOR_PERIODS })
  @ApiQuery({ name: 'client', required: false })
  @ApiQuery({ name: 'from', required: false, description: 'IST YYYY-MM-DD; with to, replaces the legacy param (max 31 days)' })
  @ApiQuery({ name: 'to', required: false, description: 'IST YYYY-MM-DD inclusive (default = from)' })
  funnel(@Query('period') period?: string, @Query('client') client?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const r = parseRange(from, to, Date.now());
    const c = parseOptionalClientId(client);
    return r ? this.service.funnelRange(r, c) : this.service.funnel(parsePeriod(period), c);
  }

  @Get('client/:clientId')
  @ApiParam({ name: 'clientId' })
  @ApiQuery({ name: 'days', required: false, enum: ['7', '30'] })
  @ApiQuery({ name: 'from', required: false, description: 'IST YYYY-MM-DD; with to, replaces the legacy param (max 31 days)' })
  @ApiQuery({ name: 'to', required: false, description: 'IST YYYY-MM-DD inclusive (default = from)' })
  async client(@Param('clientId') clientId: string, @Query('days') days?: string, @Query('from') from?: string, @Query('to') to?: string) {
    if (!CLIENT_ID_RE.test(clientId ?? '')) throw new BadRequestException('invalid clientId');
    const r = parseRange(from, to, Date.now());
    return r ? this.service.clientRange(clientId, r) : this.service.client(clientId, parseDays(days));
  }
}
