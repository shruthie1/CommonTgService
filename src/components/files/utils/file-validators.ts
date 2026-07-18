import { Injectable } from '@nestjs/common';
import { FileValidator } from '@nestjs/common';

@Injectable()
export class CustomFileValidator extends FileValidator<{
  fileTypes: string[];
}> {
  constructor(options: { fileTypes: string[] }) {
    super(options);
  }

  isValid(file?: Express.Multer.File): boolean {
    if (!file) {
      return false;
    }

    return this.validationOptions.fileTypes.includes(file.mimetype);
  }

  buildErrorMessage(): string {
    return `File type must be one of: ${this.validationOptions.fileTypes.join(', ')}`;
  }
}

@Injectable()
export class FileSizeValidator extends FileValidator<{ maxSize: number }> {
  constructor(options: { maxSize: number }) {
    super(options);
  }

  isValid(file?: Express.Multer.File): boolean {
    if (!file) {
      return false;
    }

    return file.size <= this.validationOptions.maxSize;
  }

  buildErrorMessage(): string {
    return `File size must not exceed ${this.validationOptions.maxSize / (1024 * 1024)}MB`;
  }
}
