import { SetMetadata } from '@nestjs/common';

export const CLOUDFLARE_CACHE_KEY = 'cloudflare-cache-seconds';

/**
 * @param edgeSeconds Cloudflare edge cache duration in seconds
 * @param browserSeconds Browser cache duration in seconds (default: 0)
 */
export const CloudflareCache = (edgeSeconds: number, browserSeconds = 0) =>
  SetMetadata(CLOUDFLARE_CACHE_KEY, {
    edge: edgeSeconds,
    browser: browserSeconds,
  });
