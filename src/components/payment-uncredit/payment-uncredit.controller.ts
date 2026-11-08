import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PaymentUncreditService, UNCREDIT_REASONS } from './payment-uncredit.service';

/**
 * Uncredit / Recredit one credited payment (owner 2026-11-08; tg-platform docs/design/2026-11-08-payment-uncredit.md).
 * Called by tg-chats with the CMS x-api-key; protected by the global AuthGuard like other CMS routes.
 * No vcui / payment-local route is touched.
 */
@ApiTags('payment-proofs')
@Controller('payment-proofs')
export class PaymentUncreditController {
    constructor(private readonly service: PaymentUncreditService) {}

    @Post(':proofId/uncredit')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Void ONE credited payment: Postgres payment_void (out of revenue; payer taken back only if it was the day\'s last), ' +
            'stats2 day marker, the profile\'s userData credit/tier, review stamp fake. Idempotent (changed:false). ' +
            '409 fake_marked | call_in_progress (retry with force) | pg_row_pending | uncredit_in_progress; 502 {failedAt, compensated}',
    })
    @ApiParam({ name: 'proofId', description: '<clientId>-<chatId>-<telegramMsgId>' })
    @ApiBody({
        schema: {
            type: 'object', required: ['reason'],
            properties: {
                reason: { type: 'string', enum: [...UNCREDIT_REASONS] },
                note: { type: 'string', description: "required for 'other'" },
                by: { type: 'string', description: "default 'tg-chats'" },
                force: { type: 'boolean', description: 'uncredit during a live show (treated as delivered)' },
            },
        },
    })
    uncredit(@Param('proofId') proofId: string, @Body() body: { reason?: string; note?: string; by?: string; force?: boolean }) {
        return this.service.uncredit(proofId, body ?? {});
    }

    @Post(':proofId/recredit')
    @HttpCode(200)
    @ApiOperation({ summary: 'Undo an Uncredit: userData, stats2, Postgres payment_unvoid, review stamp back. Idempotent (changed:false)' })
    @ApiParam({ name: 'proofId' })
    @ApiBody({ schema: { type: 'object', properties: { by: { type: 'string', description: "default 'tg-chats'" } } } })
    recredit(@Param('proofId') proofId: string, @Body() body: { by?: string }) {
        return this.service.recredit(proofId, body ?? {});
    }
}
