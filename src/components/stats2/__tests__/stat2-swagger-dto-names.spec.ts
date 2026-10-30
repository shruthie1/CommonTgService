import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { StatController } from '../../stats/stat.controller';
import { StatService } from '../../stats/stat.service';
import { Stat2Controller } from '../stat2.controller';
import { Stat2Service } from '../stat2.service';

// Swagger keys request-body schemas by class name. stats and stats2 used to both
// declare CreateStatDto/UpdateStatDto, which logged "Duplicate DTO detected" on
// every boot and left one of the two schemas wrong in /apim.
describe('stats + stats2 Swagger DTO names', () => {
    it('generates the document without duplicate DTO names', async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [StatController, Stat2Controller],
            providers: [
                { provide: StatService, useValue: {} },
                { provide: Stat2Service, useValue: {} },
            ],
        }).compile();
        const app = moduleRef.createNestApplication({ logger: false });
        await app.init();

        const warn = jest.spyOn(Logger, 'warn').mockImplementation(() => undefined);
        try {
            const doc = SwaggerModule.createDocument(app, new DocumentBuilder().build());
            const duplicates = warn.mock.calls.filter(([msg]) => String(msg).includes('Duplicate DTO'));
            expect(duplicates).toEqual([]);
            expect(Object.keys(doc.components?.schemas ?? {})).toEqual(
                expect.arrayContaining(['CreateStatDto', 'UpdateStatDto', 'CreateStat2Dto', 'UpdateStat2Dto']),
            );
        } finally {
            warn.mockRestore();
            await app.close();
        }
    });
});
