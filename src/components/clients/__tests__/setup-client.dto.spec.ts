import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SetupClientQueryDto } from '../dto/setup-client.dto';

describe('SetupClientQueryDto', () => {
    const transform = (query: Record<string, unknown>): SetupClientQueryDto =>
        plainToInstance(SetupClientQueryDto, query, { enableImplicitConversion: true });

    it('preserves explicit false query flags', () => {
        const dto = transform({
            archiveOld: 'false',
            formalities: 'false',
            reason: 'FROZEN_METHOD_INVALID',
        });

        expect(validateSync(dto)).toEqual([]);
        expect(dto.archiveOld).toBe(false);
        expect(dto.formalities).toBe(false);
        expect(dto.reason).toBe('FROZEN_METHOD_INVALID');
    });

    it('keeps true defaults when flags are omitted', () => {
        const dto = transform({});

        expect(validateSync(dto)).toEqual([]);
        expect(dto.archiveOld).toBe(true);
        expect(dto.formalities).toBe(true);
        expect(dto.days).toBe(0);
    });

    it('accepts explicit true query flags', () => {
        const dto = transform({
            archiveOld: 'true',
            formalities: 'true',
        });

        expect(validateSync(dto)).toEqual([]);
        expect(dto.archiveOld).toBe(true);
        expect(dto.formalities).toBe(true);
    });
});
