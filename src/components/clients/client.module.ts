import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Client, ClientSchema } from './schemas/client.schema';
import { ClientService } from './client.service';
import { ClientController } from './client.controller';
import { TelegramModule } from '../Telegram/Telegram.module';
import { BufferClientModule } from '../buffer-clients/buffer-client.module';
import { UsersModule } from '../users/users.module';
import { InitModule } from '../ConfigurationInit/init.module';
import { TimestampModule } from '../timestamps/timestamp.module';
import { SessionModule } from '../session-manager';

@Module({
  imports: [
    InitModule,
    MongooseModule.forFeature([{ name: Client.name, schema: ClientSchema }]),
    forwardRef(() => TelegramModule),
    forwardRef(() => BufferClientModule),
    forwardRef(() => UsersModule),
    forwardRef(() => SessionModule),
    forwardRef(() => TimestampModule),
  ],
  controllers: [ClientController],
  providers: [ClientService],
  exports: [ClientService, MongooseModule]
})
export class ClientModule {}
