import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserData, UserDataSchema } from './schemas/user-data.schema';
import { UserDataService } from './user-data.service';
import { UserDataController } from './user-data.controller';
import { InitModule } from '../ConfigurationInit/init.module';

@Module({
  imports: [
    InitModule,
    MongooseModule.forFeature([{ name: UserData.name, schema: UserDataSchema, collection: "userData" }])],
  controllers: [UserDataController],
  providers: [UserDataService],
  exports: [UserDataService]
})
export class UserDataModule { }
