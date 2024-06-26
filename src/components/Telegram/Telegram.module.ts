import { Module, forwardRef } from '@nestjs/common';
import { TelegramController } from './Telegram.controller';
import { UsersModule } from '../users/users.module';
import { BufferClientModule } from '../buffer-clients/buffer-client.module';
import { TelegramService } from './Telegram.service';
import { ActiveChannelsModule } from '../active-channels/active-channels.module';
import { ChannelsModule } from '../channels/channels.module';

@Module({
    imports: [
        forwardRef(() => UsersModule),
        BufferClientModule,
        forwardRef(() => ActiveChannelsModule),
        forwardRef(() => ChannelsModule)],
    controllers: [TelegramController],
    providers: [TelegramService],
    exports: [TelegramService]
})
export class TelegramModule { }
