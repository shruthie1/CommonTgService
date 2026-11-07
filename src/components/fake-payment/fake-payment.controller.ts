import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { FakePaymentService } from './fake-payment.service';

/**
 * Operator fake-payment mark (owner 2026-11-02). Called by tg-chats / ops tools with the CMS x-api-key; protected only
 * by the global AuthGuard like other CMS routes (the separate x-ops-write-key was removed by owner decision 2026-11-03).
 * Writes Mongo userData (every persona row of the chat) and Postgres payment_event.is_fake. See FakePaymentService.
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
    @ApiBody({
        schema: {
            type: 'object', required: ['reason'],
            properties: {
                by: { type: 'string', description: "operator; default 'tg-chats'" }, reason: { type: 'string' },
                proofIds: { type: 'array', items: { type: 'string' }, description: 'the proofs judged fake (proof ids of this chat)' },
            },
        },
    })
    mark(@Param('chatId') chatId: string, @Body() body: { by?: string; reason?: string; proofIds?: unknown }) {
        return this.service.mark(chatId, body ?? {});
    }

    @Post(':chatId/unmark')
    @HttpCode(200)
    @ApiOperation({ summary: 'Remove the fake-payment mark: restore payAmount / canReply and revenue (idempotent)' })
    @ApiParam({ name: 'chatId' })
    @ApiBody({ schema: { type: 'object', properties: { by: { type: 'string', description: "default 'tg-chats'" }, reason: { type: 'string' } } } })
    unmark(@Param('chatId') chatId: string, @Body() body: { by?: string; reason?: string }) {
        return this.service.unmark(chatId, body ?? {});
    }

    @Post(':chatId/not-fake')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Not fake: undo an operator mark (unmark, history kept) or a payment-check fraud block / unknown mute ' +
            '(canReply 1, limitTime 0, open fraud asks closed). Never writes cheatCount. Idempotent',
    })
    @ApiParam({ name: 'chatId' })
    @ApiBody({ schema: { type: 'object', properties: { by: { type: 'string', description: "default 'tg-chats'" }, reason: { type: 'string' } } } })
    notFake(@Param('chatId') chatId: string, @Body() body: { by?: string; reason?: string }) {
        return this.service.notFake(chatId, body ?? {});
    }
}
