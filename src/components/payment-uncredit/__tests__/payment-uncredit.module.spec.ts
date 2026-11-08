/** PaymentUncreditModule wiring: Nest resolves the controller, the service (with the review cache) and the shared reader; routes sit on payment-proofs. */
import { Test } from '@nestjs/testing';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PATH_METADATA } from '@nestjs/common/constants';
import { PaymentUncreditModule } from '../payment-uncredit.module';
import { PaymentUncreditController } from '../payment-uncredit.controller';
import { PaymentUncreditService } from '../payment-uncredit.service';
import { PaymentProofsService } from '../../payment-proofs/payment-proofs.service';

describe('PaymentUncreditModule', () => {
    let mongod: MongoMemoryServer;
    beforeAll(async () => { mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } }); }, 120_000);
    afterAll(async () => { await mongod.stop(); });

    it('resolves its providers; the service gets PaymentProofsService for the cache patch', async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [MongooseModule.forRoot(mongod.getUri(), { dbName: 'payment-uncredit-module' }), PaymentUncreditModule],
        }).compile();
        expect(moduleRef.get(PaymentUncreditController)).toBeInstanceOf(PaymentUncreditController);
        const service = moduleRef.get(PaymentUncreditService);
        expect(service).toBeInstanceOf(PaymentUncreditService);
        expect((service as any).paymentProofs).toBeInstanceOf(PaymentProofsService);
        await moduleRef.close();
    }, 60_000);

    it('routes: POST payment-proofs/:proofId/uncredit and /recredit', () => {
        expect(Reflect.getMetadata(PATH_METADATA, PaymentUncreditController)).toBe('payment-proofs');
        const proto = PaymentUncreditController.prototype;
        expect(Reflect.getMetadata(PATH_METADATA, proto.uncredit)).toBe(':proofId/uncredit');
        expect(Reflect.getMetadata(PATH_METADATA, proto.recredit)).toBe(':proofId/recredit');
    });
});
