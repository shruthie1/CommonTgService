import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { CLOUDFLARE_CACHE_KEY } from '../decorators';
import { NO_CACHE_KEY } from '../decorators';

@Injectable()
export class CloudflareCacheInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const res = context.switchToHttp().getResponse();
    const noCache = this.reflector.get<boolean>(NO_CACHE_KEY, context.getHandler());

    if (noCache) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return next.handle();
    }

    const cacheConfig = this.reflector.get<{ edge: number; browser: number }>(
      CLOUDFLARE_CACHE_KEY,
      context.getHandler(),
    );

    if (cacheConfig) {
      res.setHeader(
        'Cache-Control',
        `public, max-age=${cacheConfig.browser}, s-maxage=${cacheConfig.edge}`,
      );
    }

    return next.handle();
  }
}
