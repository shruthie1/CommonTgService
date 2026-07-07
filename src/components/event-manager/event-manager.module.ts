import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventManagerController } from './event-manager.controller';
import { EventManagerService } from './event-manager.service';
import { Event, EventSchema } from './schemas/event.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Event.name, schema: EventSchema }]),
  ],
  controllers: [EventManagerController],
  providers: [EventManagerService],
  exports: [EventManagerService],
})
export class EventManagerModule {}
