import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from './components/users/users.module';
import { UserDataModule } from './components/user-data/user-data.module';
import { ClientModule } from './components/clients/client.module';
import { TelegramModule } from './components/Telegram/Telegram.module';
import { BufferClientModule } from './components/buffer-clients/buffer-client.module';
import { ActiveChannelsModule } from './components/activechannels/activechannels.module';
import { ArchivedClientModule } from './components/archived-clients/archived-client.module';
import { initModule } from './components/ConfigurationInit/init.module';
import { ChannelsModule } from './components/channels/channels.module';

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
    ChannelsModule
  ],
  exports:[
    TelegramModule,
    ActiveChannelsModule,
    ClientModule,
    UserDataModule,
    UsersModule,
    BufferClientModule,
    ArchivedClientModule,
    ChannelsModule
  ]
})
export class AppModule { }