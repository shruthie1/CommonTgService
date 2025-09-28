"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCredentialsForMobile = getCredentialsForMobile;
const redisClient_1 = require("./redisClient");
const logger_1 = require("./logger");
const logger = new logger_1.Logger(__filename);
const API_CREDENTIALS = [
    { apiId: 27919939, apiHash: "5ed3834e741b57a560076a1d38d2fa94" },
    { apiId: 25328268, apiHash: "b4e654dd2a051930d0a30bb2add80d09" },
    { apiId: 12777557, apiHash: "05054fc7885dcfa18eb7432865ea3500" },
    { apiId: 27565391, apiHash: "a3a0a2e895f893e2067dae111b20f2d9" },
    { apiId: 27586636, apiHash: "f020539b6bb5b945186d39b3ff1dd998" },
    { apiId: 29210552, apiHash: "f3dbae7e628b312c829e1bd341f1e9a9" }
];
function pickRandomCredentials() {
    return API_CREDENTIALS[Math.floor(Math.random() * API_CREDENTIALS.length)];
}
async function getCredentialsForMobile(mobile, ttl = 24 * 60 * 60 * 60) {
    const redisKey = `tg:credentials:${mobile}`;
    const cached = await redisClient_1.RedisClient.getObject(redisKey);
    if (cached) {
        return cached;
    }
    const creds = pickRandomCredentials();
    logger.log(`[getCredentialsForMobile] Storing credentials in Redis for ${mobile}`);
    await redisClient_1.RedisClient.set(redisKey, creds, ttl);
    return creds;
}
//# sourceMappingURL=tg-apps.js.map