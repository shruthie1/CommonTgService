import { FileController } from '../file.controller';
import { FileModule } from '../file.module';
import { FileService } from '../file.service';

describe('FileModule', () => {
  it('registers the controller and service with the default storage configuration', () => {
    const module = FileModule.register();

    expect(module.module).toBe(FileModule);
    expect(module.controllers).toEqual([FileController]);
    expect(module.providers).toEqual([FileService]);
    expect(module.exports).toEqual([FileService]);
  });

  it('enforces configured file type and size limits', () => {
    const service = new FileService({
      storagePath: '/tmp/common-tg-service-file-test',
      allowedFileTypes: ['text/plain'],
      maxFileSize: 8,
    });

    expect(service.validateFileType({ mimetype: 'text/plain' } as Express.Multer.File)).toBe(true);
    expect(service.validateFileType({ mimetype: 'image/png' } as Express.Multer.File)).toBe(false);
    expect(service.validateFileSize({ size: 8 } as Express.Multer.File)).toBe(true);
    expect(service.validateFileSize({ size: 9 } as Express.Multer.File)).toBe(false);
  });
});
