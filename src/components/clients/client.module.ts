import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Client, ClientSchema } from './schemas/client.schema';
import { ClientService } from './client.service';
import { ClientController } from './client.controller';
import { TelegramModule } from '../Telegram/Telegram.module';
import { BufferClientModule } from '../buffer-clients/buffer-client.module';
import { UsersModule } from '../users/users.module';
import { InitModule } from '../ConfigurationInit/init.module';
import { NpointModule } from '../n-point/npoint.module';
import { TimestampModule } from '../timestamps/timestamp.module';
import { SessionModule } from '../session-manager';
import { PromoteClientModule } from '../promote-clients/promote-client.module';
import { PromoteClient, PromoteClientSchema } from '../promote-clients';

@Module({
  imports: [
    InitModule,
    MongooseModule.forFeature([{ name: Client.name, schema: ClientSchema }]),
    MongooseModule.forFeature([{ name: PromoteClient.name, schema: PromoteClientSchema, collection: 'promoteClients' }]),
    forwardRef(() => TelegramModule),
    forwardRef(() => BufferClientModule),
    forwardRef(() => UsersModule),
    forwardRef(() => SessionModule),
    forwardRef(() => TimestampModule),
    forwardRef(() => PromoteClientModule),
    NpointModule
  ],
  controllers: [ClientController],
  providers: [ClientService],
  exports: [ClientService, MongooseModule]
})
export class ClientModule {}
