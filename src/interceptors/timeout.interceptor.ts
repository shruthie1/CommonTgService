import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly defaultTimeout: number = 120000) {} // default = 120s

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      timeout(this.defaultTimeout),
      catchError((err) => {
        if (err.name === 'TimeoutError') {
          return throwError(() => new RequestTimeoutException('Request timed out'));
        }
        return throwError(() => err);
      }),
    );
  }
}
