// no-cache.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const NO_CACHE_KEY = 'NO_CACHE';
export const NoCache = () => SetMetadata(NO_CACHE_KEY, true);
