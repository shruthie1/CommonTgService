import { FileValidator } from '@nestjs/common';
export declare class CustomFileValidator extends FileValidator<{
    fileTypes: string[];
}> {
    constructor(options: {
        fileTypes: string[];
    });
    isValid(file?: Express.Multer.File): boolean;
    buildErrorMessage(): string;
}
export declare class FileSizeValidator extends FileValidator<{
    maxSize: number;
}> {
    constructor(options: {
        maxSize: number;
    });
    isValid(file?: Express.Multer.File): boolean;
    buildErrorMessage(): string;
}
