import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PromoteClientModule } from '../components/promote-clients/promote-client.module';
import { ClientModule } from '../components/clients/client.module';

/**
 * Migration Module
 * 
 * This module provides all the necessary imports and dependencies
 * for running migration scripts in a standalone context.
 */
@Module({
  imports: [
    PromoteClientModule,
    ClientModule,
  ],
  exports: [
    PromoteClientModule,
    ClientModule,
  ],
})
export class MigrationModule {}
