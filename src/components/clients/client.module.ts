import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Client, ClientSchema } from './schemas/client.schema';
import { ClientService } from './client.service';
import { ClientController } from './client.controller';
import { TelegramModule } from '../Telegram/Telegram.module';
import { BufferClientModule } from '../buffer-clients/buffer-client.module';
import { UsersModule } from '../users/users.module';
import { ArchivedClientModule } from '../archived-clients/archived-client.module';
import { initModule } from '../ConfigurationInit/init.module';

@Module({
  imports: [
    initModule,
    MongooseModule.forFeature([{ name: Client.name, schema: ClientSchema }]),
    forwardRef(()=>TelegramModule),
    forwardRef(()=>BufferClientModule),
    forwardRef(()=>UsersModule),
    forwardRef(()=>ArchivedClientModule),
  ],
  controllers: [ClientController],
  providers: [ClientService],
  exports: [ClientService]
})
export class ClientModule { }
