import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PROOF_STATES } from './payment-proofs.classify';
import { ListQuery, MAX_LIMIT, PROOF_SORTS, PaymentProofsService } from './payment-proofs.service';

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
            'review (revenue + long-term blocking, post-hoc; nothing in tg-aut reads it) = CREDITED AND not reviewed AND chat not ' +
            'marked fake AND (strong fake signal OR (credited ₹ >= REVIEW_MIN_AMOUNT (100) AND among the IST day\'s top ' +
            'REVIEW_DAILY_TARGET (20) minus strong, by risk, with risk >= REVIEW_RISK_FLOOR (25))). Strong: fake reason code, ' +
            'fakeScore >= 40, fakeSignals, chat sent a fake receipt, same image in another chat (not the first chat), reused UTR of an ' +
            'earlier receipt (another chat or amount; the earliest proof with a UTR is the original), same receipt credited before, ' +
            'payer of a marked-fake chat. Uncredited proofs (repeats, not_ours, not_receipt, old_time, over_limit, uncredited ' +
            'fakes) never enter review. Items carry risk (0-100), riskReasons, atRiskAmount, strong, repeat, reusedFrom; ' +
            'counts.reviewAmount = credited ₹ in review. ' +
            'flagged = outcome fraud_ask|fake_blocked|cross_client; marked = chat has userData.fakePaymentAt; reviewed = review.state ok. ' +
            'Rows without verdict (before tg-aut wrote one) get an outcome derived from servedAt / ask / decision (legacy: true). ' +
            'state=review defaults to sort=risk (risk x atRiskAmount), other states to newest first; counts cover ' +
            'since/client/minAmount (not state/cursor); the review model always uses the whole 7-day collection.',
    })
    @ApiQuery({ name: 'since', required: false, description: 'ISO date; default now - 7 days (the TTL)' })
    @ApiQuery({ name: 'client', required: false, description: 'clientId' })
    @ApiQuery({ name: 'chat', required: false, description: 'chatId: only this chat (counts too)' })
    @ApiQuery({ name: 'state', required: false, enum: PROOF_STATES, description: 'default review' })
    @ApiQuery({ name: 'minAmount', required: false, description: 'creditAmount (else amount read) >= n' })
    @ApiQuery({ name: 'limit', required: false, description: `default 50, max ${MAX_LIMIT}` })
    @ApiQuery({ name: 'cursor', required: false, description: 'nextCursor from the previous page (same sort)' })
    @ApiQuery({ name: 'sort', required: false, enum: PROOF_SORTS, description: 'default risk for state=review, else time' })
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
