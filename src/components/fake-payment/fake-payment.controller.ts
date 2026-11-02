import { Body, Controller, Get, Headers, HttpCode, Param, Post, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { createHash, timingSafeEqual } from 'crypto';
import { FakePaymentService } from './fake-payment.service';

export const OPS_WRITE_KEY_HEADER = 'x-ops-write-key';

/**
 * The write routes need `x-ops-write-key` equal to env OPS_WRITE_KEY (the same key ops-gateway checks and forwards),
 * on top of the global AuthGuard: that guard also accepts the public legacy x-api-key, which must not be enough to
 * block a user and drop revenue. Fail closed: unset = 503, missing or wrong = 401. SHA-256 of both sides, then
 * timingSafeEqual (equal lengths, no length leak).
 */
export function assertOpsWriteKey(provided: unknown, env: NodeJS.ProcessEnv = process.env): void {
    const expected = (env.OPS_WRITE_KEY || '').trim();
    if (!expected) throw new ServiceUnavailableException('OPS_WRITE_KEY is not configured: fake-payment writes are disabled');
    const got = typeof provided === 'string' ? provided : '';
    const a = createHash('sha256').update(got).digest();
    const b = createHash('sha256').update(expected).digest();
    if (!got || !timingSafeEqual(a, b)) throw new UnauthorizedException('invalid x-ops-write-key');
}

/**
 * Operator fake-payment mark (owner 2026-11-02). Called by ops-gateway (ops-ui "Fake payment" panel) with the CMS
 * x-api-key (global AuthGuard) and, on mark/unmark, x-ops-write-key (assertOpsWriteKey). Writes Mongo userData (every
 * persona row of the chat) and Postgres payment_event.is_fake. See FakePaymentService.
 */
@ApiTags('fake-payment')
@Controller('fake-payment')
export class FakePaymentController {
    constructor(private readonly service: FakePaymentService) {}

    @Get(':chatId')
    @ApiOperation({ summary: 'Fake-payment mark state of a chat (Mongo rows + Postgres payment_event.is_fake / payments)' })
    @ApiParam({ name: 'chatId' })
    status(@Param('chatId') chatId: string) {
        return this.service.status(chatId);
    }

    @Post(':chatId/mark')
    @HttpCode(200)
    @ApiOperation({ summary: 'Mark ALL payments of the chat fake: no revenue, blocked, owed nothing (idempotent)' })
    @ApiParam({ name: 'chatId' })
    @ApiHeader({ name: OPS_WRITE_KEY_HEADER, required: true })
    @ApiBody({ schema: { type: 'object', required: ['by', 'reason'], properties: { by: { type: 'string' }, reason: { type: 'string' } } } })
    mark(@Param('chatId') chatId: string, @Body() body: { by?: string; reason?: string }, @Headers(OPS_WRITE_KEY_HEADER) writeKey?: string) {
        assertOpsWriteKey(writeKey);
        return this.service.mark(chatId, body ?? {});
    }

    @Post(':chatId/unmark')
    @HttpCode(200)
    @ApiOperation({ summary: 'Remove the fake-payment mark: restore payAmount / canReply and revenue (idempotent)' })
    @ApiParam({ name: 'chatId' })
    @ApiHeader({ name: OPS_WRITE_KEY_HEADER, required: true })
    @ApiBody({ schema: { type: 'object', required: ['by'], properties: { by: { type: 'string' }, reason: { type: 'string' } } } })
    unmark(@Param('chatId') chatId: string, @Body() body: { by?: string; reason?: string }, @Headers(OPS_WRITE_KEY_HEADER) writeKey?: string) {
        assertOpsWriteKey(writeKey);
        return this.service.unmark(chatId, body ?? {});
    }
}
