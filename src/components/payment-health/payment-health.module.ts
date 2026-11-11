import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RedisClient } from '../../utils/redisClient';
import { DailyAnalyticsModule } from '../daily-analytics/daily-analytics.module';
import { PAYMENT_PROOF_COLLECTION, PAYMENT_PROOF_MODEL, PaymentProofSchema } from '../payment-proofs/schemas/payment-proof.schema';
import { PaymentHealthController } from './payment-health.controller';
import { PAYMENT_HEALTH_REDIS, PaymentHealthRedis, PaymentHealthService } from './payment-health.service';

/**
 * Daily payment health report (owner 2026-11-11). Read-only: paymentProofs (Mongo), payment_event (Postgres, the shared
 * AnalyticsPgReader pool), tg-aut heartbeats (Redis SMEMBERS + MGET only). Exported for the CMS scheduler.
 */
@Module({
    imports: [
        DailyAnalyticsModule,
        MongooseModule.forFeature([{ name: PAYMENT_PROOF_MODEL, schema: PaymentProofSchema, collection: PAYMENT_PROOF_COLLECTION }]),
    ],
    controllers: [PaymentHealthController],
    providers: [
        PaymentHealthService,
        {
            provide: PAYMENT_HEALTH_REDIS,
            useFactory: (): PaymentHealthRedis => ({
                smembers: (key) => RedisClient.getClient().smembers(key),
                mget: (keys) => RedisClient.getClient().mget(keys),
            }),
        },
    ],
    exports: [PaymentHealthService],
})
export class PaymentHealthModule {}
