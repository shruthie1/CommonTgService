import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PromoteClientService } from './promote-client.service';
import { PromoteClientController } from './promote-client.controller';
import { PromoteClientSchema } from './schemas/promote-client.schema';
import { TelegramModule } from '../Telegram/Telegram.module';
import { ActiveChannelsModule } from '../active-channels/active-channels.module';
import { UsersModule } from '../users/users.module';
import { ClientModule } from '../clients/client.module';
import { InitModule } from '../ConfigurationInit/init.module';
import { ChannelsModule } from '../channels/channels.module';
import { BufferClientModule } from '../buffer-clients/buffer-client.module';
import { SessionModule } from '../session-manager';

@Module({
  imports: [
    InitModule,
    MongooseModule.forFeature([{ name: 'PromoteClient', schema: PromoteClientSchema, collection: 'promoteClients' }]),
    forwardRef(() => TelegramModule),
    forwardRef(() => UsersModule),
    forwardRef(() => ActiveChannelsModule),
    forwardRef(() => ClientModule),
    forwardRef(() => ChannelsModule),
    forwardRef(() => BufferClientModule),
    forwardRef(() => SessionModule)
 ],
  controllers: [PromoteClientController],
  providers: [PromoteClientService],
  exports: [PromoteClientService]
})
export class PromoteClientModule { }
