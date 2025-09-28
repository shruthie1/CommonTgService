import { RedisClient } from "./redisClient";
import { Logger } from "./logger";

const logger = new Logger(__filename);
export interface ITelegramCredentials {
  apiId: number;
  apiHash: string;
}

const API_CREDENTIALS: ITelegramCredentials[] = [
  { apiId: 27919939, apiHash: "5ed3834e741b57a560076a1d38d2fa94" },
  { apiId: 25328268, apiHash: "b4e654dd2a051930d0a30bb2add80d09" },
  { apiId: 12777557, apiHash: "05054fc7885dcfa18eb7432865ea3500" },
  { apiId: 27565391, apiHash: "a3a0a2e895f893e2067dae111b20f2d9" },
  { apiId: 27586636, apiHash: "f020539b6bb5b945186d39b3ff1dd998" },
  { apiId: 29210552, apiHash: "f3dbae7e628b312c829e1bd341f1e9a9" }
];

/**
 * Picks a random set of credentials.
 */
function pickRandomCredentials(): ITelegramCredentials {
  return API_CREDENTIALS[Math.floor(Math.random() * API_CREDENTIALS.length)];
}

/**
 * Gets credentials for a mobile, reusing cached ones if present.
 *
 * @param mobile - Unique identifier (e.g., phone number).
 */
export async function getCredentialsForMobile(
  mobile: string,
  ttl: number = 24 * 60 * 60 * 60
): Promise<ITelegramCredentials> {
  const redisKey = `tg:credentials:${mobile}`;
  // Try cache first
  const cached = await RedisClient.getObject<ITelegramCredentials>(redisKey);
  if (cached) {
    return cached;
  }
  const creds = pickRandomCredentials();
  logger.log(`[getCredentialsForMobile] Storing credentials in Redis for ${mobile}`);
  await RedisClient.set(redisKey, creds, ttl);

  return creds;
}
