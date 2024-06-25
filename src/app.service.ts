import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    const rootPath = process.cwd();
    console.log(rootPath)
    return 'Hello World!';
  }
}
