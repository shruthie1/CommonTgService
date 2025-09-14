import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BotsController } from './bots.controller';
import { BotsService } from './bots.service';
import { Bot, BotSchema } from './schemas/bot.schema';
import { setBotsServiceInstance } from '../../utils/bot.service.instance';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Bot.name, schema: BotSchema }])
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
