import { TelegramClientParams } from "telegram/client/telegramBaseClient";
import { RedisClient } from "../../../utils/redisClient";
// Constants
const DEVICE_MODELS = [
  "Pixel 6", "iPhone 13", "Samsung Galaxy S22", "Redmi Note 12", 
  "OnePlus 9", "Desktop", "MacBook Pro", "iPad Pro"
];

const SYSTEM_VERSIONS = [
  "Android 13", "iOS 16.6", "Windows 10", "Windows 11", 
  "macOS 13.5", "Ubuntu 22.04", "Arch Linux"
];

const APP_VERSIONS = ["1.0.0", "2.1.3", "3.5.7", "4.0.2", "5.0.0"];

// Helper
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generates or fetches a persistent TG config per mobile.
 * 
 * @param mobile - Mobile number or unique identifier for the client.
 */
export async function generateTGConfig(mobile: string): Promise<TelegramClientParams> {
  const redisKey = `tg:config:${mobile}`;

  // Try to fetch from Redis
  const cached = await RedisClient.getObject<TelegramClientParams>(redisKey);
  if (cached) {
    return cached;
  }

  // Otherwise generate a new config
  const config: TelegramClientParams = {
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
    // Optional flags:
    // useWSS: false,
    // useIPV6: false,
  };

  // Store in Redis with no expiry (or set TTL if desired)
  await RedisClient.set(redisKey, config);

  return config;
}
