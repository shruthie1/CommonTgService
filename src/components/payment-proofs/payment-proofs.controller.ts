import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PROOF_STATES } from './payment-proofs.classify';
import { ListQuery, MAX_LIMIT, MAX_STAMP_IDS, PROOF_SORTS, PaymentProofsService, ViewQuery } from './payment-proofs.service';
import { REVIEW_VIEWS } from './payment-proofs.views';

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
        summary: 'Every payment screenshot (state=all, newest first): filtered, cursor-paged, with counts and userData/client join',
        description:
            'Since 2026-11-07 the only state is all and the only sort time; the per-state lists and the risk order were removed ' +
            '(the views replace them). counts: flagged, not_credited, credited, marked, reviewed, all. ' +
            'review rule (revenue + long-term blocking, post-hoc; nothing in tg-aut reads it) = CREDITED AND not reviewed AND chat not ' +
            'marked fake AND (strong fake signal OR (credited ₹ >= REVIEW_MIN_AMOUNT (100) AND among the IST day\'s top ' +
            'REVIEW_DAILY_TARGET (20) minus strong, by risk, with risk >= REVIEW_RISK_FLOOR (25))). Strong: fake reason code, ' +
            'fakeScore >= 40, fakeSignals, chat sent a fake receipt, same image in another chat (not the first chat), reused UTR of an ' +
            'earlier receipt (another chat or amount; the earliest proof with a UTR is the original), same receipt credited before, ' +
            'payer of a marked-fake chat. Uncredited proofs (repeats, not_ours, not_receipt, old_time, over_limit, uncredited ' +
            'fakes) never enter review. Items carry risk (0-100), riskReasons, atRiskAmount, strong, repeat, reusedFrom; ' +
            'flagged = outcome fraud_ask|fake_blocked|cross_client; marked = chat has userData.fakePaymentAt; reviewed = a stamp that still holds (item.stamp). ' +
            'Rows without verdict (before tg-aut wrote one) get an outcome derived from servedAt / ask / decision (legacy: true). ' +
            'counts cover since/client/chat/minAmount (not cursor); the review model always uses the whole 7-day collection.',
    })
    @ApiQuery({ name: 'since', required: false, description: 'ISO date; default now - 7 days (the TTL)' })
    @ApiQuery({ name: 'client', required: false, description: 'clientId' })
    @ApiQuery({ name: 'chat', required: false, description: 'chatId: only this chat (counts too)' })
    @ApiQuery({ name: 'state', required: false, enum: PROOF_STATES, description: 'default all' })
    @ApiQuery({ name: 'minAmount', required: false, description: 'creditAmount (else amount read) >= n' })
    @ApiQuery({ name: 'limit', required: false, description: `default 50, max ${MAX_LIMIT}` })
    @ApiQuery({ name: 'cursor', required: false, description: 'nextCursor from the previous page (same sort)' })
    @ApiQuery({ name: 'sort', required: false, enum: PROOF_SORTS, description: 'default time' })
    @ApiQuery({
        name: 'view', required: false, enum: REVIEW_VIEWS,
        description: 'Redesign 2026-11-07 (additive; without view the response above is unchanged). check = one entry per chat ' +
            'needing a look (real fake signal or high value); muted = one entry per chat with fakePaymentAt or canReply 0 ' +
            '(source, when, why, evidence); refused = uncredited proofs that look genuine. Response { view, entries, counts, ' +
            'truncated }; only client applies.',
    })
    @ApiQuery({ name: 'includeReviewed', required: false, description: "view only: '1' also returns stamped entries (entry.stamp set) and marked chats with no proof left; counts never include them" })
    list(@Query() query: ListQuery & ViewQuery) {
        if (query?.view !== undefined && query.view !== '') return this.service.views(query);
        return this.service.list(query ?? {});
    }

    @Post('chat/:chatId/actions')
    @HttpCode(200)
    @ApiOperation({
        summary: "Stamp the proofs a review card showed: review = { decision, at }. Mark fake / unblock stay on /fake-payment (called first). " +
            'A stamp stops holding when tg-aut later opens or blocks an ask on the row',
    })
    @ApiParam({ name: 'chatId' })
    @ApiBody({ schema: { type: 'object', required: ['decision', 'proofIds'], properties: { decision: { type: 'string', enum: ['fine', 'fake', 'unblocked'] }, proofIds: { type: 'array', maxItems: MAX_STAMP_IDS, items: { type: 'string' } } } } })
    stampChat(@Param('chatId') chatId: string, @Body() body: { decision?: unknown; proofIds?: unknown }) {
        return this.service.stampChat(chatId, body ?? {});
    }
}
