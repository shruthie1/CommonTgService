/**
 * Main package exports
 * @module common-tg-service
 */

// Core modules
export * from './app.module';
export * from './middlewares/logger.middleware';

// Feature domains
export * from './features/telegram';
export * from './features/clients';
export * from './features/stats';

// Channel management
export * from './components/channels/channels.module';
export * from './components/channels/channels.service';

// User management
export * from './components/users/users.module';
export * from './components/users/users.service';
export * from './components/user-data/user-data.module';
export * from './components/user-data/user-data.service';
export { SearchDto as UserDataSearchDto } from './components/user-data/dto/search-user-data.dto';

// Transactions
export * from './components/transactions/transaction.module';
export * from './components/transactions/transaction.service';
export * from './components/transactions/dto/create-transaction.dto';
export * from './components/transactions/dto/update-transaction.dto';

// Promotions
export * from './components/promote-msgs/promote-msgs.module';
export * from './components/promote-msgs/promote-msgs.service';

// UPI Integration
export * from './components/upi-ids/upi-ids.module';
export * from './components/upi-ids/upi-ids.service';

// Build management
export * from './components/builds/build.module';
export * from './components/builds/build.service';

// NPoint Integration
export * from './components/n-point/npoint.module';
export * from './components/n-point/npoint.service';

// Utility exports
export * from './utils';
export * from './IMap/IMap';

// Type exports
export type { GroupOptions, ChatStatistics, ContentFilter, MessageScheduleOptions, ChannelInfo } from './interfaces/telegram';
export type { PromoteMsg } from './components/promote-msgs/promote-msgs.schema';
export type { Build } from './components/builds/builds.schema';
export type { Configuration } from './components/ConfigurationInit/configuration.schema';