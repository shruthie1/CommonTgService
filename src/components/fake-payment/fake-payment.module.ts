import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserData, UserDataSchema } from '../user-data/schemas/user-data.schema';
import { DailyAnalyticsModule } from '../daily-analytics/daily-analytics.module';
import { FakePaymentController } from './fake-payment.controller';
import { FakePaymentService } from './fake-payment.service';

/** Operator fake-payment mark (owner 2026-11-02): Mongo userData fields + Postgres payment_event.is_fake (no new table or collection). */
@Module({
    imports: [
        DailyAnalyticsModule,
        MongooseModule.forFeature([{ name: UserData.name, schema: UserDataSchema, collection: 'userData' }]),
    ],
    controllers: [FakePaymentController],
    providers: [FakePaymentService],
})
export class FakePaymentModule {}
