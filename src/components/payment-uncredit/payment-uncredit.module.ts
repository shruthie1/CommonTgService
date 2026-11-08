import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserData, UserDataSchema } from '../user-data/schemas/user-data.schema';
import { DailyAnalyticsModule } from '../daily-analytics/daily-analytics.module';
import { PaymentProofsModule } from '../payment-proofs/payment-proofs.module';
import { PAYMENT_PROOF_COLLECTION, PAYMENT_PROOF_MODEL, PaymentProofSchema } from '../payment-proofs/schemas/payment-proof.schema';
import { PaymentUncreditController } from './payment-uncredit.controller';
import { PaymentUncreditService } from './payment-uncredit.service';

/** Uncredit / Recredit one payment (owner 2026-11-08): paymentProofs journal + userData + stats2 + Postgres payment_void. */
@Module({
    imports: [
        DailyAnalyticsModule,
        PaymentProofsModule,
        MongooseModule.forFeature([
            { name: PAYMENT_PROOF_MODEL, schema: PaymentProofSchema, collection: PAYMENT_PROOF_COLLECTION },
            { name: UserData.name, schema: UserDataSchema, collection: 'userData' },
        ]),
    ],
    controllers: [PaymentUncreditController],
    providers: [PaymentUncreditService],
})
export class PaymentUncreditModule {}
