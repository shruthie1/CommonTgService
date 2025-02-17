import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

const requestTimestamps = new Map<string, number>(); // Stores timestamps per route

@Injectable()
export class ThrottleMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const key = `${req.method}:${req.url}`; // Unique key per route
    const now = Date.now();
    const lastCall = requestTimestamps.get(key) || 0;
    const THROTTLE_TIME = 1000; // 5 seconds

    if (now - lastCall < THROTTLE_TIME) {
        console.error(`Too many requests for ${key}. Please wait.`);
        return res.status(429).json({ message: 'Too many requests. Please wait.' });
    }

    requestTimestamps.set(key, now);
    next();
  }
}
