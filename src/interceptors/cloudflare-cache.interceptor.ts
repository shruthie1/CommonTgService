// cloudflare-cache.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { CLOUDFLARE_CACHE_KEY } from '../decorators';

@Injectable()
export class CloudflareCacheInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const cacheConfig = this.reflector.get<{ edge: number; browser: number }>(
      CLOUDFLARE_CACHE_KEY,
      context.getHandler(),
    );

    if (cacheConfig) {
      const res = context.switchToHttp().getResponse();
      res.setHeader(
        'Cache-Control',
        `public, max-age=${cacheConfig.browser}, s-maxage=${cacheConfig.edge}`,
      );
    }

    return next.handle();
  }
}
