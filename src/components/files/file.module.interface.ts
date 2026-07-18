export interface FileModuleOptions {
  storagePath?: string;
  maxFileSize?: number;
  allowedFileTypes?: string[];
}

export const FILE_MODULE_OPTIONS = 'FILE_MODULE_OPTIONS';
