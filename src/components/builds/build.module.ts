import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BuildService } from './build.service';
import { BuildController } from './build.controller';
import { BuildSchema } from './builds.schema';

@Global()
@Module({
  imports: [
    BuildModule,
    MongooseModule.forFeature([{ name: 'userModule', schema: BuildSchema, collection: 'users' }]),
  ],
  providers: [BuildService],
  controllers: [BuildController],
  exports: [MongooseModule],
})
export class BuildModule { }