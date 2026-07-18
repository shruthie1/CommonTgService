import { DynamicModule } from '@nestjs/common';
import { FileModuleOptions } from './file.module.interface';
export declare class FileModule {
    static register(): DynamicModule;
    static forRoot(options?: FileModuleOptions): DynamicModule;
    static forRootGlobal(options?: FileModuleOptions): DynamicModule;
}
