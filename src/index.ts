/**
 * @module common-tg-service
 * Common Telegram Service - A comprehensive NestJS service for Telegram functionality
 */

// Core exports
export { AppModule } from './app.module';
export { AppController } from './app.controller';
export { MemoryCleanerService } from './memory-cleanup.service';

// Component exports
export * from './components';

// Utility exports
export * from './utils';
export * from './middlewares';
export * from './guards';
export * from './interceptors';
export * from './decorators';

// Type definitions
export * from './interfaces/telegram';
export * from './IMap/IMap';

// Feature exports
export * from './features/clients';
export * from './features/stats';
export * from './features/telegram';