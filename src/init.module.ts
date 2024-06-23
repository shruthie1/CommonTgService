// core.module.ts
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot(),
    MongooseModule.forRootAsync({
      useFactory: async () => ({
        uri: process.env.mongouri,
      }),
    }),
  ],
  exports: [ConfigModule, MongooseModule], // Export for other modules to use
})
export class initModule {}
