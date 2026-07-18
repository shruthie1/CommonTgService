import { Module, DynamicModule, Provider } from '@nestjs/common';
import { FileController } from './file.controller';
import { FileService } from './file.service';
import { MulterModule } from '@nestjs/platform-express';
import { FILE_CONFIG } from './config/file.config';
import {
  FileModuleOptions,
  FILE_MODULE_OPTIONS,
} from './file.module.interface';

@Module({})
export class FileModule {
  /**
   * Register the FileModule with default configuration
   */
  static register(): DynamicModule {
    return {
      module: FileModule,
      imports: [
        MulterModule.register({
          dest: FILE_CONFIG.STORAGE_PATH,
        }),
      ],
      controllers: [FileController],
      providers: [FileService],
      exports: [FileService],
    };
  }

  /**
   * Register the FileModule with custom configuration
   * @param options Configuration options for the file module
   */
  static forRoot(options: FileModuleOptions = {}): DynamicModule {
    const providers: Provider[] = [
      {
        provide: FILE_MODULE_OPTIONS,
        useValue: {
          storagePath: options.storagePath || FILE_CONFIG.STORAGE_PATH,
          maxFileSize: options.maxFileSize || FILE_CONFIG.MAX_FILE_SIZE,
          allowedFileTypes:
            options.allowedFileTypes || FILE_CONFIG.ALLOWED_FILE_TYPES,
        },
      },
      FileService,
    ];

    return {
      module: FileModule,
      imports: [
        MulterModule.register({
          dest: options.storagePath || FILE_CONFIG.STORAGE_PATH,
        }),
      ],
      controllers: [FileController],
      providers: providers,
      exports: [FileService],
    };
  }

  /**
   * Register the FileModule as a global module with custom configuration
   * @param options Configuration options for the file module
   */
  static forRootGlobal(options: FileModuleOptions = {}): DynamicModule {
    const module = this.forRoot(options);
    return {
      ...module,
      global: true,
    };
  }
}
