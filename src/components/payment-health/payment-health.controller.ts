import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PaymentHealthService } from './payment-health.service';

/** Read-only view of the daily payment health report (the 09:00 IST job sends the same report to the ops channel). */
@ApiTags('payment-proofs')
@Controller('payment-health')
export class PaymentHealthController {
    constructor(private readonly service: PaymentHealthService) {}

    @Get('report')
    @ApiOperation({
        summary: 'Payment health of one IST day (default yesterday): credited proofs vs payment_event rows (missing / extra / voided), ' +
            'possible double credits, holds and fake flags by reason, tg-aut processes not on the newest build. Read-only; never sends.',
    })
    @ApiQuery({ name: 'day', required: false, description: 'IST day YYYY-MM-DD (paymentProofs keeps 7 days)' })
    report(@Query('day') day?: string) {
        return this.service.compute(day);
    }
}
