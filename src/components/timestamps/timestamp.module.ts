import { Module, Global, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TimestampService } from './timestamp.service';
import { TimestampController } from './timestamp.controller';
import { TimestampSchema } from './timestamps.schema';
import { ClientModule } from '../clients/client.module';
import { InitModule } from '../ConfigurationInit';

@Global()
@Module({
  imports: [
    InitModule,
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