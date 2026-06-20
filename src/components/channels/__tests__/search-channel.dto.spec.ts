/**
 * Reproduces the global ValidationPipe behaviour for SearchChannelDto.
 *
 * main.ts configures `new ValidationPipe({ transform: true,
 * transformOptions: { enableImplicitConversion: true } })`. With implicit
 * conversion, a `boolean`-typed property is coerced via `Boolean(value)` — and
 * `Boolean("false") === true`. So `?canSendMsgs=false` would arrive as `true`
 * and Model.find({ canSendMsgs: true }) returns the LOGICAL OPPOSITE.
 *
 * The fix mirrors SearchUserDto's @Transform(value === 'true').
 */
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { SearchChannelDto } from '../dto/search-channel.dto';

// Mirror main.ts transform options.
const toDto = (query: Record<string, any>) =>
    plainToInstance(SearchChannelDto, query, { enableImplicitConversion: true });

describe('SearchChannelDto query coercion (ValidationPipe parity)', () => {
    it('coerces canSendMsgs="true" to boolean true', () => {
        expect(toDto({ canSendMsgs: 'true' }).canSendMsgs).toBe(true);
    });

    it('coerces canSendMsgs="false" to boolean FALSE (not inverted)', () => {
        // The bug: implicit Boolean("false") === true. A search for non-sendable
        // channels must NOT silently flip to sendable.
        expect(toDto({ canSendMsgs: 'false' }).canSendMsgs).toBe(false);
    });

    it('leaves canSendMsgs undefined when the param is absent', () => {
        expect(toDto({}).canSendMsgs).toBeUndefined();
    });
});
