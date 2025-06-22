import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { UsersModule } from './components/users/users.module';
import { UserDataModule } from './components/user-data/user-data.module';
import { ClientModule } from './components/clients/client.module';
import { TelegramModule } from './components/Telegram/Telegram.module';
import { BufferClientModule } from './components/buffer-clients/buffer-client.module';
import { ActiveChannelsModule } from './components/active-channels/active-channels.module';
import { ArchivedClientModule } from './components/archived-clients/archived-client.module';
import { InitModule } from './components/ConfigurationInit/init.module';
import { ChannelsModule } from './components/channels/channels.module';
import { AppController } from './app.controller';
import { LoggerMiddleware } from './middlewares/logger.middleware';
import { BuildModule } from './components/builds/build.module';
import { UpiIdModule } from './components/upi-ids/upi-ids.module';
import { PromoteMsgModule } from './components/promote-msgs/promote-msgs.module';
import { StatModule } from './components/stats/stat.module';
import { Stat2Module } from './components/stats2/stat2.module';
import { PromoteStatModule } from './components/promote-stats/promote-stat.module';
import { PromoteClientModule } from './components/promote-clients/promote-client.module';
import { TgSignupModule } from './components/TgSignup/tg-signup.module';
import { TransactionModule } from './components/transactions/transaction.module';
import { NpointModule } from './components/n-point/npoint.module';
import { TimestampModule } from './components/timestamps/timestamp.module';
import { DynamicDataModule } from './components/dynamic-data/dynamic-data.module';
import { MemoryCleanerService } from './memory-cleanup.service';

@Module({
  imports: [
    InitModule,
    TelegramModule,
    ActiveChannelsModule,
    ClientModule,
    UserDataModule,
    UsersModule,
    BufferClientModule,
    ArchivedClientModule,
    ChannelsModule,
    PromoteClientModule,
    BuildModule,
    UpiIdModule,
    PromoteMsgModule,
    PromoteStatModule,
    StatModule,
    Stat2Module,
    TgSignupModule,
    TransactionModule,
    NpointModule,
    TimestampModule,
    DynamicDataModule,
  ],
  providers: [MemoryCleanerService],
  controllers: [AppController],
  exports: [
    TelegramModule,
    ActiveChannelsModule,
    ClientModule,
    UserDataModule,
    UsersModule,
    BufferClientModule,
    ArchivedClientModule,
    ChannelsModule,
    PromoteClientModule,
    TgSignupModule,
    TransactionModule,
    TimestampModule,
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}