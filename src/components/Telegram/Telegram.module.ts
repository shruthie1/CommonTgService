import { Module, forwardRef } from '@nestjs/common';
import { TelegramController } from './Telegram.controller';
import { UsersModule } from '../users/users.module';
import { BufferClientModule } from '../buffer-clients/buffer-client.module';
import { TelegramService } from './Telegram.service';

@Module({
    imports: [
        forwardRef(()=>UsersModule),
        BufferClientModule],
    controllers: [TelegramController],
    providers: [TelegramService],
    exports: [TelegramService]
})
export class TelegramModule { }
