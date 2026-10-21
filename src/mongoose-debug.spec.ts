import mongoose from 'mongoose';
import { configureMongooseDebug } from './mongoose-debug';

// mongoose debug prints every query, including live Telegram session strings and users.insertOne
// passwords, into the PM2 logs. It must be opt-in only.
describe('configureMongooseDebug', () => {
    let setSpy: jest.SpyInstance;

    beforeEach(() => { setSpy = jest.spyOn(mongoose, 'set'); });
    afterEach(() => { setSpy.mockRestore(); mongoose.set('debug', false); });

    const debugOnCalls = () => setSpy.mock.calls.filter(([key, value]) => key === 'debug' && value === true);

    it('leaves query debug off when MONGOOSE_DEBUG is unset', () => {
        configureMongooseDebug({});
        expect(debugOnCalls()).toHaveLength(0);
    });

    it('leaves query debug off for any value other than "true"', () => {
        for (const value of ['', 'false', '1', 'TRUE ', 'yes']) configureMongooseDebug({ MONGOOSE_DEBUG: value });
        expect(debugOnCalls()).toHaveLength(0);
    });

    it('turns query debug on only for MONGOOSE_DEBUG=true', () => {
        configureMongooseDebug({ MONGOOSE_DEBUG: 'true' });
        expect(debugOnCalls()).toHaveLength(1);
    });
});
