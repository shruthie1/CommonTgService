import mongoose from 'mongoose';

/**
 * Mongoose query debug prints every query, including live Telegram session strings and the
 * users.insertOne password field, into the PM2 logs. Opt-in only: MONGOOSE_DEBUG=true.
 */
export function configureMongooseDebug(env: NodeJS.ProcessEnv = process.env): void {
    if (env.MONGOOSE_DEBUG === 'true') mongoose.set('debug', true);
}
