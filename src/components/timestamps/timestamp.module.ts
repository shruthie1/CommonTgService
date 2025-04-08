import { Module, Global, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TimestampService } from './timestamp.service';
import { TimestampController } from './timestamp.controller';
import { TimestampSchema } from './timestamps.schema';
import { ClientModule } from '../clients/client.module';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ 
      name: 'timestampModule', 
      collection: 'timestamps', 
      schema: TimestampSchema 
    }]),
    forwardRef(() => ClientModule),
  ],
  providers: [TimestampService],
  controllers: [TimestampController],
  exports: [TimestampService],
})
export class TimestampModule {}