import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { UsersModule } from './components/users/users.module';
import { UserDataModule } from './components/user-data/user-data.module';
import { ClientModule } from './components/clients/client.module';
import { TelegramModule } from './components/Telegram/Telegram.module';
import { BufferClientModule } from './components/buffer-clients/buffer-client.module';
import { ActiveChannelsModule } from './components/active-channels/active-channels.module';
import { ArchivedClientModule } from './components/archived-clients/archived-client.module';
import { initModule } from './components/ConfigurationInit/init.module';
import { ChannelsModule } from './components/channels/channels.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggerMiddleware } from './middlewares/logger.middleware';
import { BuildModule } from './components/builds/build.module';
import { UpiIdModule } from './components/upi-ids/upi-ids.module';
import { PromoteMsgModule } from './components/promote-msgs/promote-msgs.module';
import { StatModule } from './components/stats/stat.module';
import { Stat2Module } from './components/stats2/stat2.module';
import { PromoteStatModule } from './components/promote-stats/promote-stat.module';
import { PromoteClientModule } from './components/promote-clients/promote-client.module';

@Module({
  imports: [
    initModule,
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
    Stat2Module
  ],
  controllers:[AppController],
  providers:[AppService],
  exports:[
    TelegramModule,
    ActiveChannelsModule,
    ClientModule,
    UserDataModule,
    UsersModule,
    BufferClientModule,
    ArchivedClientModule,
    ChannelsModule,
    PromoteClientModule
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}