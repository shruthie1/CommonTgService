import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserSchema } from './schemas/user.schema';
import { TelegramModule } from '../Telegram/Telegram.module';
import { ClientModule } from '../clients/client.module';
import { InitModule } from '../ConfigurationInit/init.module';

@Module({
  imports: [
    InitModule,
    MongooseModule.forFeature([{ name: 'userModule', schema: UserSchema, collection: 'users' }]),
    forwardRef(() => TelegramModule),
    forwardRef(() => ClientModule)
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService]
})
export class UsersModule { }
