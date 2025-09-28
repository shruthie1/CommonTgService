"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTGConfig = generateTGConfig;
const redisClient_1 = require("../../../utils/redisClient");
const logger_1 = require("../../../utils/logger");
const logger = new logger_1.Logger(__filename);
const DEVICE_MODELS = [
    "Pixel 6", "iPhone 13", "Samsung Galaxy S22", "Redmi Note 12",
    "OnePlus 9", "Desktop", "MacBook Pro", "iPad Pro"
];
const SYSTEM_VERSIONS = [
    "Android 13", "iOS 16.6", "Windows 10", "Windows 11",
    "macOS 13.5", "Ubuntu 22.04", "Arch Linux"
];
const APP_VERSIONS = ["1.0.0", "2.1.3", "3.5.7", "4.0.2", "5.0.0"];
function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
async function generateTGConfig(mobile) {
    const redisKey = `tg:config:${mobile}`;
    const cached = await redisClient_1.RedisClient.getObject(redisKey);
    if (cached) {
        return cached;
    }
    const config = {
        connectionRetries: 10,
        requestRetries: 5,
        retryDelay: 1000,
        timeout: 10,
        autoReconnect: true,
        maxConcurrentDownloads: 3,
        downloadRetries: 5,
        deviceModel: `${pickRandom(DEVICE_MODELS)}-ssk`,
        systemVersion: pickRandom(SYSTEM_VERSIONS),
        appVersion: pickRandom(APP_VERSIONS),
    };
    logger.log(`[generateTGConfig] Storing config in Redis for ${mobile}`);
    await redisClient_1.RedisClient.set(redisKey, config);
    return config;
}
//# sourceMappingURL=generateTGConfig.js.map