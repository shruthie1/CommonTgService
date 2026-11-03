/** PaymentProofsModule wiring: Nest resolves the controller and service with both models; no index is created. */
import { Test } from '@nestjs/testing';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PaymentProofsModule } from '../payment-proofs.module';
import { PaymentProofsController } from '../payment-proofs.controller';
import { PaymentProofsService } from '../payment-proofs.service';

describe('PaymentProofsModule', () => {
    let mongod: MongoMemoryServer;
    beforeAll(async () => { mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } }); }, 120_000);
    afterAll(async () => { await mongod.stop(); });

    it('resolves its providers and does not create the paymentProofs collection', async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [MongooseModule.forRoot(mongod.getUri(), { dbName: 'payment-proofs-module' }), PaymentProofsModule],
        }).compile();
        await moduleRef.init();
        expect(moduleRef.get(PaymentProofsController)).toBeInstanceOf(PaymentProofsController);
        expect(moduleRef.get(PaymentProofsService)).toBeInstanceOf(PaymentProofsService);
        const conn = moduleRef.get<Connection>(getConnectionToken());
        await new Promise((r) => setTimeout(r, 200));
        const names = (await conn.db!.listCollections().toArray()).map((c) => c.name);
        expect(names).not.toContain('paymentProofs');
        await moduleRef.close();
    }, 60_000);
});
