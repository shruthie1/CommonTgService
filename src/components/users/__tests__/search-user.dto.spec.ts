/**
 * Reproduces the global ValidationPipe behaviour for SearchUserDto (a @Query() DTO).
 *
 * With main.ts's `enableImplicitConversion`, a `boolean`-typed property is coerced via
 * Boolean(value) — and Boolean("false") === true — which OVERRIDES the @Transform and
 * inverts `?twoFA=false` / `?expired=false` / `?starred=false`, returning the opposite set.
 */
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { SearchUserDto } from '../dto/search-user.dto';

const toDto = (query: Record<string, any>) =>
    plainToInstance(SearchUserDto, query, { enableImplicitConversion: true });

describe('SearchUserDto query boolean coercion (ValidationPipe parity)', () => {
    it('twoFA="false" stays false (not inverted)', () => {
        expect(toDto({ twoFA: 'false' }).twoFA).toBe(false);
    });
    it('twoFA="true" -> true', () => {
        expect(toDto({ twoFA: 'true' }).twoFA).toBe(true);
    });
    it('expired="false" stays false', () => {
        expect(toDto({ expired: 'false' }).expired).toBe(false);
    });
    it('starred="false" stays false', () => {
        expect(toDto({ starred: 'false' }).starred).toBe(false);
    });
    it('demoGiven="false" stays false', () => {
        expect(toDto({ demoGiven: 'false' }).demoGiven).toBe(false);
    });
    it('absent boolean stays undefined', () => {
        expect(toDto({}).twoFA).toBeUndefined();
    });
});
