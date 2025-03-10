import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BuildService } from './build.service';
import { BuildController } from './build.controller';
import { BuildSchema } from './builds.schema';
import { NpointModule } from '../n-point/npoint.module';

@Global()
@Module({
  imports: [
    BuildModule,
    MongooseModule.forFeature([{ name: 'buildModule', collection: 'builds', schema: BuildSchema }]),
    NpointModule,
  ],
  providers: [BuildService],
  controllers: [BuildController],
  exports: [BuildModule],
})
export class BuildModule { }