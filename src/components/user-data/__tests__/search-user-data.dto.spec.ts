/**
 * ValidationPipe-parity test for the user-data SearchDto (@Query()).
 * enableImplicitConversion coerces a bare `: boolean` prop via Boolean(value),
 * and Boolean("false") === true — inverting `?paidReply=false` etc.
 */
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { SearchDto } from '../dto/search-user-data.dto';

const toDto = (q: Record<string, any>) =>
    plainToInstance(SearchDto, q, { enableImplicitConversion: true });

describe('user-data SearchDto query boolean coercion (ValidationPipe parity)', () => {
    for (const field of ['paidReply', 'demoGiven', 'secondShow']) {
        it(`${field}="false" stays false (not inverted)`, () => {
            expect((toDto({ [field]: 'false' }) as any)[field]).toBe(false);
        });
        it(`${field}="true" -> true`, () => {
            expect((toDto({ [field]: 'true' }) as any)[field]).toBe(true);
        });
    }
    it('absent boolean stays undefined', () => {
        expect((toDto({}) as any).paidReply).toBeUndefined();
    });

    it('coerces picsSent to the canonical numeric counter', () => {
        expect(toDto({ picsSent: '2' }).picsSent).toBe(2);
    });
});
