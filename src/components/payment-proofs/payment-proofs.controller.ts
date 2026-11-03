import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PROOF_STATES } from './payment-proofs.classify';
import { ListQuery, MAX_LIMIT, PaymentProofsService } from './payment-proofs.service';

/**
 * Payments review (owner-approved scope 2026-11-03). Used by the tg-chats Review screen with the CMS x-api-key;
 * protected by the global AuthGuard like other CMS routes. Mark fake stays POST /fake-payment/:chatId/mark.
 */
@ApiTags('payment-proofs')
@Controller('payment-proofs')
export class PaymentProofsController {
    constructor(private readonly service: PaymentProofsService) {}

    @Get()
    @ApiOperation({
        summary: 'Payment screenshots for review: filtered, cursor-paged, with counts per state and userData/client join',
        description:
            'review = not reviewed AND (outcome != credited OR fakeScore >= 40 OR reasons non-empty), plus every unreviewed credited proof >= ₹300; ' +
            'flagged = outcome fraud_ask|fake_blocked|cross_client; marked = chat has userData.fakePaymentAt; reviewed = review.state ok. ' +
            'Rows without verdict (before tg-aut wrote one) get an outcome derived from servedAt / ask / decision (legacy: true). ' +
            'Items are newest first; counts cover since/client/minAmount (not state/cursor).',
    })
    @ApiQuery({ name: 'since', required: false, description: 'ISO date; default now - 7 days (the TTL)' })
    @ApiQuery({ name: 'client', required: false, description: 'clientId' })
    @ApiQuery({ name: 'state', required: false, enum: PROOF_STATES, description: 'default review' })
    @ApiQuery({ name: 'minAmount', required: false, description: 'creditAmount (else amount read) >= n' })
    @ApiQuery({ name: 'limit', required: false, description: `default 50, max ${MAX_LIMIT}` })
    @ApiQuery({ name: 'cursor', required: false, description: 'nextCursor from the previous page' })
    list(@Query() query: ListQuery) {
        return this.service.list(query ?? {});
    }

    @Post(':proofId/review')
    @HttpCode(200)
    @ApiOperation({ summary: "Set (state 'ok') or clear the operator review of one proof (idempotent)" })
    @ApiParam({ name: 'proofId', description: '<clientId>-<chatId>-<telegramMsgId>' })
    @ApiBody({ schema: { type: 'object', required: ['state'], properties: { state: { type: 'string', enum: ['ok', 'clear'] }, by: { type: 'string', description: "required for 'ok'" } } } })
    review(@Param('proofId') proofId: string, @Body() body: { state?: string; by?: string }) {
        return this.service.review(proofId, body ?? {});
    }
}
