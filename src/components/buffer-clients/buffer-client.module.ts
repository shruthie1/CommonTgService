import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BufferClientService } from './buffer-client.service';
import { BufferClientController } from './buffer-client.controller';
import { BufferClientSchema } from './schemas/buffer-client.schema';
import { TelegramModule } from '../Telegram/Telegram.module';
import { ActiveChannelsModule } from '../activechannels/activechannels.module';
import { UsersModule } from '../users/users.module';
import { ClientModule } from '../clients/client.module';
import { initModule } from '../ConfigurationInit/init.module';

@Module({
  imports: [
    initModule,
    MongooseModule.forFeature([{ name: 'bufferClientModule', schema: BufferClientSchema, collection: 'bufferClients' }]),
    forwardRef(() => TelegramModule),
    forwardRef(() => UsersModule),
    forwardRef(() => ActiveChannelsModule),
    forwardRef(() => ClientModule)],
  controllers: [BufferClientController],
  providers: [BufferClientService],
  exports: [BufferClientService]
})
export class BufferClientModule { }
