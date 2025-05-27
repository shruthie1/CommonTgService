import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BufferClientService } from './buffer-client.service';
import { BufferClientController } from './buffer-client.controller';
import { BufferClientSchema } from './schemas/buffer-client.schema';
import { TelegramModule } from '../Telegram/Telegram.module';
import { ActiveChannelsModule } from '../active-channels/active-channels.module';
import { UsersModule } from '../users/users.module';
import { ClientModule } from '../clients/client.module';
import { initModule } from '../ConfigurationInit/init.module';
import { ChannelsModule } from '../channels/channels.module';
import { PromoteClientModule } from '../promote-clients/promote-client.module';

@Module({
  imports: [
    initModule.forRoot(),
    MongooseModule.forFeature([{ name: 'bufferClientModule', schema: BufferClientSchema, collection: 'bufferClients' }]),
    forwardRef(() => TelegramModule),
    forwardRef(() => UsersModule),
    forwardRef(() => ActiveChannelsModule),
    forwardRef(() => ClientModule),
    forwardRef(() => ChannelsModule),
    forwardRef(() => PromoteClientModule)
 ],
  controllers: [BufferClientController],
  providers: [BufferClientService],
  exports: [BufferClientService]
})
export class BufferClientModule { }
