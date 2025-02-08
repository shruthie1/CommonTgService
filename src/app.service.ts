import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { diskStorage, File as MulterFile } from 'multer';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
}
