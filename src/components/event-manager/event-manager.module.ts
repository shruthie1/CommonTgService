import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventManagerController } from './event-manager.controller';
import { EventManagerService } from './event-manager.service';
import { Event, EventSchema } from './schemas/event.schema';
import { ClientModule } from '../clients/client.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Event.name, schema: EventSchema }]),
    forwardRef(() => ClientModule),
  ],
  controllers: [EventManagerController],
  providers: [EventManagerService],
  exports: [EventManagerService],
})
export class EventManagerModule {}
