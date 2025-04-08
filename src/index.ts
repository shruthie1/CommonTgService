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

// Telegram Core
export * from './components/Telegram/Telegram.module';
export * from './components/Telegram/Telegram.service';
export * from './components/Telegram/TelegramManager';
export * from './components/Telegram/utils/connection-manager';
export * from './components/Telegram/utils/telegram-logger';
export * from './components/Telegram/dto';
export * from './components/TgSignup/TgSignup.module';
export * from './components/TgSignup/TgSignup.service';
export * from './components/TgSignup/dto/tg-signup.dto';

// Client Management
export * from './components/clients/client.module';
export * from './components/clients/client.service';
export * from './components/clients/dto/create-client.dto';
export * from './components/clients/dto/update-client.dto';
export * from './components/clients/dto/search-client.dto';
export * from './components/clients/dto/setup-client.dto';
export * from './components/clients/schemas/client.schema';

// Active Channels
export * from './components/active-channels/active-channels.module';
export * from './components/active-channels/active-channels.service';
export * from './components/active-channels/dto/create-active-channel.dto';
export * from './components/active-channels/dto/update-active-channel.dto';
export * from './components/active-channels/schemas/active-channel.schema';

// Buffer Clients
export * from './components/buffer-clients/buffer-client.module';
export * from './components/buffer-clients/buffer-client.service';
export * from './components/buffer-clients/dto/create-buffer-client.dto';
export * from './components/buffer-clients/dto/update-buffer-client.dto';
export * from './components/buffer-clients/dto/search-buffer- client.dto';
export * from './components/buffer-clients/schemas/buffer-client.schema';

// Archived Clients
export * from './components/archived-clients/archived-client.module';
export * from './components/archived-clients/archived-client.service';

// Channel Management
export * from './components/channels/channels.module';
export * from './components/channels/channels.service';
export * from './components/channels/dto/create-channel.dto';
export * from './components/channels/dto/update-channel.dto';
export * from './components/channels/dto/search-channel.dto';
export * from './components/channels/schemas/channel.schema';

// User Management
export * from './components/users/users.module';
export * from './components/users/users.service';
export * from './components/users/schemas/user.schema';
export * from './components/users/dto/create-user.dto';
export * from './components/users/dto/search-user.dto';
export * from './components/user-data/user-data.module';
export * from './components/user-data/user-data.service';
export * from './components/user-data/dto/create-user-data.dto';
export * from './components/user-data/dto/search-user-data.dto';
export * from './components/user-data/dto/update-user-data.dto';

// Stats & Analytics
export * from './components/stats/stat.module';
export * from './components/stats/stat.service';
export * from './components/stats/stat.schema';
export * from './components/stats/create-stat.dto';
export * from './components/stats/update-stat.dto';
export * from './components/stats2/stat2.module';
export * from './components/stats2/stat2.service';
export { Stat2, Stat2Document, StatSchema as Stat2Schema } from './components/stats2/stat2.schema';
export { CreateStatDto as CreateStat2Dto } from './components/stats2/create-stat2.dto';
export { UpdateStatDto as UpdateStat2Dto } from './components/stats2/update-stat2.dto';
export * from './components/promote-stats/promote-stat.module';
export * from './components/promote-stats/promote-stat.service';
export * from './components/promote-stats/schemas/promote-stat.schema';
export * from './components/promote-stats/dto/create-promote-stat.dto';
export * from './components/promote-stats/dto/update-promote-stat.dto';

// Promotion System
export * from './components/promote-clients/promote-client.module';
export * from './components/promote-clients/promote-client.service';
export * from './components/promote-clients/dto/create-promote-client.dto';
export * from './components/promote-clients/dto/update-promote-client.dto';
export * from './components/promote-clients/dto/search-promote-client.dto';
export * from './components/promote-clients/schemas/promote-client.schema';
export * from './components/promote-msgs/promote-msgs.module';
export * from './components/promote-msgs/promote-msgs.service';
export * from './components/promote-msgs/promote-msgs.schema';

// Transactions & Payments
export * from './components/transactions/transaction.module';
export * from './components/transactions/transaction.service';
export * from './components/transactions/dto/create-transaction.dto';
export * from './components/transactions/dto/update-transaction.dto';
export * from './components/transactions/schemas/transaction.schema';
export * from './components/upi-ids/upi-ids.module';
export * from './components/upi-ids/upi-ids.service';
export * from './components/upi-ids/upi-ids.schema';

// Configuration & Infrastructure
export * from './components/ConfigurationInit/init.module';
export * from './components/ConfigurationInit/init.service';
export * from './components/ConfigurationInit/configuration.schema';
export * from './components/builds/build.module';
export * from './components/builds/build.service';
export * from './components/builds/builds.schema';
export * from './components/timestamps/timestamp.module';
export * from './components/timestamps/timestamp.service';
export * from './components/timestamps/timestamps.schema';
export * from './components/n-point/npoint.module';
export * from './components/n-point/npoint.service';

// Utils & Types
export * from './utils';
export * from './utils/fetchWithTimeout';
export * from './utils/parseError';
export * from './utils/logbots';
export * from './IMap/IMap';
export * from './interfaces/telegram';

// Shared
export * from './components/shared/dto/execute-request.dto';