/**
 * channelId normalization contract for the CMS channel services.
 *
 * activeChannels/channels are SHARED with tg-platform (tg-aut + promote-clients). Those apps
 * normalize every channelId through the canonical normalizer before reading or writing. CMS used
 * to pass the caller's raw string straight through, so `-100123`, `-123`, `123` and `" 123 "` could
 * key four different documents for one chat — each with independent banned / canSendMsgs /
 * availableMsgs state — and a normalized write from one service was invisible to a raw read here.
 *
 * These tests pin the key derivation at both write and read boundaries.
 */
import { ActiveChannelsService } from '../active-channels.service';
import { ChannelsService } from '../../channels/channels.service';
import { setBotsServiceInstance } from '../../../utils';

// ChannelsService.remove() emits a PROM_LOGS2 notification via the global bots-service singleton,
// which throws when uninitialized. Register a no-op so the test can reach the delete call.
beforeAll(() => {
    setBotsServiceInstance({ sendMessageByCategory: jest.fn() } as any);
});

describe('CMS channelId normalization', () => {
    describe('ActiveChannelsService', () => {
        function makeService() {
            const bulkWrite = jest.fn(async () => ({ modifiedCount: 1 }));
            const updateOne = jest.fn(async () => ({ modifiedCount: 1 }));
            const findOne = jest.fn(() => ({ lean: () => ({ exec: async () => null }), exec: async () => null }));
            const findOneAndDelete = jest.fn(() => ({ exec: async () => null }));
            const model: any = { bulkWrite, updateOne, findOne, findOneAndDelete };
            const service = new ActiveChannelsService(model, {} as any, {} as any);
            return { service, bulkWrite, updateOne, findOne, findOneAndDelete };
        }

        it.each([
            ['-100123456', '123456', 'strips the -100 channel prefix'],
            ['-123456', '123456', 'strips a bare leading minus (basic-group form)'],
            ['  123456  ', '123456', 'trims padding'],
            ['123456', '123456', 'leaves an already-normalized id untouched'],
        ])('createMultiple keys %s as %s (%s)', async (input, expected) => {
            const { service, bulkWrite } = makeService();
            await service.createMultiple([{ channelId: input, title: 't' } as any]);
            const op = (bulkWrite.mock.calls as any)[0][0][0].updateOne;
            expect(op.filter).toEqual({ channelId: expected });
        });

        it('normalizes the read key on findOne', async () => {
            const { service, findOne } = makeService();
            await service.findOne('-100999');
            expect(findOne).toHaveBeenCalledWith({ channelId: '999' });
        });

        it('normalizes the key on incrementClientsJoined', async () => {
            const { service, updateOne } = makeService();
            await service.incrementClientsJoined('-100777');
            expect(updateOne).toHaveBeenCalledWith({ channelId: '777' }, expect.anything());
        });

        it('NEVER blanks a non-numeric id (normalizeTelegramChannelId is a strict validator)', async () => {
            // The shared helper returns '' for anything that is not a plain positive integer.
            // Adopting that blindly would retarget the write at a different/empty document, so the
            // service falls back to the prefix-stripped raw value instead.
            const { service, bulkWrite } = makeService();
            await service.createMultiple([{ channelId: 'legacy-id-1', title: 't' } as any]);
            const op = (bulkWrite.mock.calls as any)[0][0][0].updateOne;
            expect(op.filter).toEqual({ channelId: 'legacy-id-1' });
        });
    });

    describe('ChannelsService', () => {
        function makeService() {
            const bulkWrite = jest.fn(async () => ({ modifiedCount: 1 }));
            const findOne = jest.fn(() => ({ exec: async () => null, lean: () => ({ exec: async () => null }) }));
            const findOneAndDelete = jest.fn(() => ({ exec: async () => null }));
            const model: any = { bulkWrite, findOne, findOneAndDelete };
            const service = new ChannelsService(model, {} as any);
            return { service, bulkWrite, findOne, findOneAndDelete };
        }

        it('normalizes the key on createMultiple', async () => {
            const { service, bulkWrite } = makeService();
            await service.createMultiple([{ channelId: '-100555', title: 't' } as any]);
            const op = (bulkWrite.mock.calls as any)[0][0][0].updateOne;
            expect(op.filter).toEqual({ channelId: '555' });
        });

        it('normalizes the read key on findOne', async () => {
            const { service, findOne } = makeService();
            await service.findOne('-100444');
            expect(findOne).toHaveBeenCalledWith({ channelId: '444' });
        });

        it('normalizes the key on remove', async () => {
            const { service, findOneAndDelete } = makeService();
            await service.remove('-100333');
            expect(findOneAndDelete).toHaveBeenCalledWith({ channelId: '333' });
        });

        it('update() bounds the $set to writable fields (no _id/channelId/unknown keys)', async () => {
            // update() used to raw-$set the whole DTO, so a caller could rewrite the document's own
            // identity (channelId) out from under the filter on an upsert, or accumulate stray keys.
            const findOneAndUpdate = jest.fn(() => ({ exec: async () => ({}) }));
            const findOne = jest.fn(() => ({ lean: () => ({ exec: async () => null }) }));
            const service = new ChannelsService({ findOne, findOneAndUpdate } as any, {} as any);

            await service.update('-100222', {
                title: 'ok',
                canSendMsgs: true,
                _id: 'HACK',
                channelId: 'HIJACKED',
                bogusField: 'nope',
            } as any);

            const [filter, update] = (findOneAndUpdate.mock.calls as any)[0];
            expect(filter).toEqual({ channelId: '222' });
            expect(update.$set).toEqual({ title: 'ok', canSendMsgs: true });
            expect(update.$set).not.toHaveProperty('_id');
            expect(update.$set).not.toHaveProperty('channelId');
            expect(update.$set).not.toHaveProperty('bogusField');
        });
    });
});
