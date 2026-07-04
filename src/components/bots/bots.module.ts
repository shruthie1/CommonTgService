import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BotsController } from './bots.controller';
import { BotsService } from './bots.service';
import { Bot, BotSchema } from './schemas/bot.schema';
import { setBotsServiceInstance } from '../../utils/bot.service.instance';
import { TelegramModule } from '../Telegram/Telegram.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Bot.name, schema: BotSchema }]),
    forwardRef(() => TelegramModule),
    forwardRef(() => UsersModule),
  ],
  controllers: [BotsController],
  providers: [BotsService],
  exports: [BotsService]
})
export class BotsModule implements OnModuleInit {
  constructor(private readonly botsService: BotsService) {}

  onModuleInit() {
    // Set the BotsService instance for global access
    setBotsServiceInstance(this.botsService);
  }
}
