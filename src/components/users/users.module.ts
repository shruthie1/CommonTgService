import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserSchema } from './schemas/user.schema';
import { TelegramModule } from '../Telegram/Telegram.module';
import { ClientModule } from '../clients/client.module';
import { initModule } from '../../init.module';

@Module({
  imports: [
    initModule,
    MongooseModule.forFeature([{ name: 'userModule', schema: UserSchema, collection: 'users' }]),
    forwardRef(() => TelegramModule),
    forwardRef(() => ClientModule)
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService]
})
export class UsersModule { }
