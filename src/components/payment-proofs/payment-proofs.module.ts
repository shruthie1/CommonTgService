import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserData, UserDataSchema } from '../user-data/schemas/user-data.schema';
import { PAYMENT_PROOF_COLLECTION, PAYMENT_PROOF_MODEL, PaymentProofSchema } from './schemas/payment-proof.schema';
import { PaymentProofsController } from './payment-proofs.controller';
import { PaymentProofsService } from './payment-proofs.service';

/** Payments review: reads tg-aut's paymentProofs (no index or collection changes) + userData + clients. */
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: PAYMENT_PROOF_MODEL, schema: PaymentProofSchema, collection: PAYMENT_PROOF_COLLECTION },
            { name: UserData.name, schema: UserDataSchema, collection: 'userData' },
        ]),
    ],
    controllers: [PaymentProofsController],
    providers: [PaymentProofsService],
})
export class PaymentProofsModule {}
