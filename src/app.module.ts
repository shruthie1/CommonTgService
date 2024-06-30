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
    BuildModule,
    UpiIdModule
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
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}