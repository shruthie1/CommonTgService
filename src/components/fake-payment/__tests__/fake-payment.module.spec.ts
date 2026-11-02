/** FakePaymentModule wiring: Nest resolves the controller, the service, the userData model and the shared AnalyticsPgReader. */
import { Test } from '@nestjs/testing';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { FakePaymentModule } from '../fake-payment.module';
import { FakePaymentController } from '../fake-payment.controller';
import { FakePaymentService } from '../fake-payment.service';
import { AnalyticsPgReader } from '../../daily-analytics/analytics-pg.reader';

describe('FakePaymentModule', () => {
    let mongod: MongoMemoryServer;
    beforeAll(async () => { mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } }); }, 120_000);
    afterAll(async () => { await mongod.stop(); });

    it('resolves its providers with the reader exported by DailyAnalyticsModule', async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [MongooseModule.forRoot(mongod.getUri(), { dbName: 'fake-payment-module' }), FakePaymentModule],
        }).compile();
        expect(moduleRef.get(FakePaymentController)).toBeInstanceOf(FakePaymentController);
        expect(moduleRef.get(FakePaymentService)).toBeInstanceOf(FakePaymentService);
        expect(moduleRef.get(AnalyticsPgReader, { strict: false })).toBeInstanceOf(AnalyticsPgReader);
        await moduleRef.close();
    }, 60_000);
});
