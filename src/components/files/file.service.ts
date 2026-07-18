import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  Inject,
  Optional,
} from '@nestjs/common';
import { Response, Request } from 'express';
import path, { join, resolve, sep } from 'path';
import * as fs from 'fs';
import archiver from 'archiver';
import axios from 'axios';
import { FILE_CONFIG } from './config/file.config';
import { VIEW_CONFIG } from './config/view.config';
import { createReadStream } from 'fs';
import { lookup } from 'mime-types';
import {
  FileMetadataResponse,
  FolderResponse,
  FolderDetailsResponse,
  ShareableLinkResponse,
  FileVersionResponse,
  FolderTreeResponse,
  JsonFileResponse,
  JsonValueResponse,
} from './dto/responses.dto';
import {
  JsonPathValidator,
  JsonPathValidationError,
} from './utils/json-path.validator';
import {
  FileOperationError,
  FileErrorCodes,
} from './utils/file-operation-error';
import { withFileOperation } from './utils/file-operation-wrapper';
import {
  FILE_MODULE_OPTIONS,
  FileModuleOptions,
} from './file.module.interface';
import mime from 'mime';
import { pipeline } from 'stream';
import { finished } from 'stream/promises';
import { promisify } from 'util';
import { getFileExtension, sanitizeFileName } from './utils/helper';
const streamPipeline = promisify(pipeline);

type MimeType =
  | (typeof VIEW_CONFIG.IMAGE_TYPES)[number]
  | (typeof VIEW_CONFIG.PDF_TYPES)[number]
  | (typeof VIEW_CONFIG.TEXT_TYPES)[number];

@Injectable()
export class FileService implements OnModuleInit {
  private readonly logger = new Logger(FileService.name);
  private readonly config: {
    storagePath: string;
    maxFileSize: number;
    allowedFileTypes: string[];
  };

  constructor(
    @Optional()
    @Inject(FILE_MODULE_OPTIONS)
    private options?: FileModuleOptions,
  ) {
    this.config = {
      storagePath: options?.storagePath || FILE_CONFIG.STORAGE_PATH,
      maxFileSize: options?.maxFileSize || FILE_CONFIG.MAX_FILE_SIZE,
      allowedFileTypes:
        options?.allowedFileTypes || FILE_CONFIG.ALLOWED_FILE_TYPES,
    };

    this.logger.log(
      `FileService initialized with storage path: ${this.config.storagePath}`,
    );
  }


  private getSafePath(...segments: string[]): string {
    const filePath = join(...segments);
    const resolvedPath = resolve(filePath);
    const basePath = resolve(this.config.storagePath);

    if (!resolvedPath.startsWith(basePath + sep)) {
      throw new Error(`Invalid or unsafe path access detected: ${resolvedPath}`);
    }

    return resolvedPath; // ✅ return the resolved absolute safe path
  }


  // Method to validate file type
  public validateFileType(file: Express.Multer.File): boolean {
    return this.config.allowedFileTypes.includes(file.mimetype as MimeType);
  }

  // Method to validate file size
  public validateFileSize(file: Express.Multer.File): boolean {
    return file.size <= this.config.maxFileSize;
  }

  async listFolders(): Promise<FolderResponse> {
    const result = await withFileOperation('listFolders', async () => {
      if (!fs.existsSync(this.config.storagePath)) {
        fs.mkdirSync(this.config.storagePath, { recursive: true });
      }
      const folders = fs
        .readdirSync(this.config.storagePath, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);
      return { folders };
    });

    if (!result.success) {
      this.logger.error(`Failed to list folders: ${result.error.message}`);
      throw new InternalServerErrorException('Failed to list folders');
    }

    return result.data;
  }

  async getFolderDetails(
    folder: string,
    page = 1,
    limit = 10,
  ): Promise<FolderDetailsResponse> {
    const folderPath = this.getSafePath(this.config.storagePath, folder);
    if (!fs.existsSync(folderPath)) {
      this.logger.error(`Folder not found: ${folder}`);
      throw new NotFoundException('Folder not found');
    }
    const files = fs.readdirSync(folderPath);
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedFiles = files.slice(startIndex, endIndex);
    return {
      folder,
      files: paginatedFiles,
      totalFiles: files.length,
      page,
      limit,
    };
  }

  async createFolder(folderName: string) {
    const result = await withFileOperation('createFolder', async () => {
      const folderPath = this.getSafePath(this.config.storagePath, folderName);
      if (fs.existsSync(folderPath)) {
        throw new FileOperationError(
          'Folder already exists',
          FileErrorCodes.FOLDER_EXISTS,
          'createFolder',
          { folderName },
        );
      }
      fs.mkdirSync(folderPath, { recursive: true });
      return { message: 'Folder created successfully', folder: folderName };
    });

    if (!result.success) {
      if (result.error.code === FileErrorCodes.FOLDER_EXISTS) {
        throw new BadRequestException(result.error.message);
      }
      this.logger.error(`Failed to create folder: ${result.error.message}`);
      throw new InternalServerErrorException('Failed to create folder');
    }

    return result.data;
  }

  async deleteFolder(folder: string) {
    const result = await withFileOperation('deleteFolder', async () => {
      const folderPath = this.getSafePath(this.config.storagePath, folder);
      if (!fs.existsSync(folderPath)) {
        throw new FileOperationError(
          'Folder not found',
          FileErrorCodes.FILE_NOT_FOUND,
          'deleteFolder',
          { folder },
        );
      }

      const files = fs.readdirSync(folderPath);
      if (files.length > 0) {
        throw new FileOperationError(
          'Cannot delete non-empty folder',
          FileErrorCodes.FOLDER_NOT_EMPTY,
          'deleteFolder',
          { folder, fileCount: files.length },
        );
      }

      fs.rmdirSync(folderPath);
      return { message: 'Folder deleted successfully' };
    });

    if (!result.success) {
      if (result.error.code === FileErrorCodes.FILE_NOT_FOUND) {
        throw new NotFoundException(result.error.message);
      }
      if (result.error.code === FileErrorCodes.FOLDER_NOT_EMPTY) {
        throw new BadRequestException(result.error.message);
      }
      this.logger.error(`Failed to delete folder: ${result.error.message}`);
      throw new InternalServerErrorException('Failed to delete folder');
    }

    return result.data;
  }

  getDestination(req, file, cb) {
    try {
      const folderPath = this.getSafePath(
        this.config.storagePath,
        req.params.folder,
      );
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }
      cb(null, folderPath);
    } catch (error) {
      cb(error, null);
    }
  }

  getFilename(req, file, cb) {
    try {
      const extension = file.originalname.substring(
        file.originalname.lastIndexOf('.'),
      );
      const baseFilename = req.query.filename || 'uploaded_file';

      const files = (req as any).files as Express.Multer.File[];

      let finalFilename: string;

      if (files.length === 1) {
        finalFilename = `${baseFilename}${extension}`;
      } else {
        if (!(req as any)._fileCounter) {
          (req as any)._fileCounter = 0;
        }

        (req as any)._fileCounter++;
        finalFilename = `${baseFilename}${(req as any)._fileCounter}${extension}`;
      }

      cb(null, finalFilename);
    } catch (error) {
      cb(error, null);
    }
  }

  uploadFiles(folder: string, files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      this.logger.error(`No files provided for folder ${folder}`);
      throw new BadRequestException('File upload failed: No files provided');
    }

    const uploadedFiles = files.map((file) => {
      if (!this.validateFileType(file)) {
        this.logger.error(
          `Invalid file type: ${file.mimetype} for ${file.originalname}`,
        );
        throw new BadRequestException(
          `Invalid file type for ${file.originalname}`,
        );
      }
      if (!this.validateFileSize(file)) {
        this.logger.error(`File size exceeds limit: ${file.size} bytes`);
        throw new BadRequestException(
          `File size exceeds limit for ${file.originalname}`,
        );
      }
      this.logger.log(`File uploaded: ${file.filename} to folder: ${folder}`);
      return { filename: file.filename };
    });

    return { message: 'Files uploaded successfully', files: uploadedFiles };
  }

  downloadFile(folder: string, filename: string, res: Response) {
    const filePath = this.getSafePath(
      this.config.storagePath,
      folder,
      filename,
    );
    if (!fs.existsSync(filePath)) {
      this.logger.error(`File not found: ${filename} in folder: ${folder}`);
      throw new NotFoundException('File not found');
    }
    const stats = fs.statSync(filePath);
    const etag = `"${stats.mtimeMs.toString(36)}-${stats.size.toString(36)}"`;
    res.set({
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'ETag': etag,
      'Last-Modified': stats.mtime.toUTCString(),
    });
    return res.download(filePath);
  }

  async getFileMetadata(
    folder: string,
    filename: string,
  ): Promise<FileMetadataResponse> {
    const filePath = this.getSafePath(
      this.config.storagePath,
      folder,
      filename,
    );
    if (!fs.existsSync(filePath)) {
      this.logger.error(`File not found: ${filename} in folder: ${folder}`);
      throw new NotFoundException('File not found');
    }
    try {
      const stats = fs.statSync(filePath);
      return {
        filename,
        size: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
      };
    } catch (error) {
      this.logger.error(
        `Error retrieving metadata for ${filename}: ${error.message}`,
      );
      throw new InternalServerErrorException('Error retrieving file metadata');
    }
  }

  moveFile(
    folder: string,
    filename: string,
    body: { newFolder?: string; newFilename?: string },
  ) {
    const oldPath = this.getSafePath(this.config.storagePath, folder, filename);
    const newFolder = body.newFolder || folder;
    const newFilename = body.newFilename || filename;
    const newFolderPath = this.getSafePath(this.config.storagePath, newFolder);
    if (!fs.existsSync(newFolderPath)) {
      try {
        fs.mkdirSync(newFolderPath, { recursive: true });
        this.logger.log(`Created destination folder: ${newFolder}`);
      } catch (error) {
        this.logger.error(
          `Error creating folder ${newFolder}: ${error.message}`,
        );
        throw new InternalServerErrorException(
          'Failed to create destination folder',
        );
      }
    }
    const newPath = this.getSafePath(newFolderPath, newFilename);
    if (fs.existsSync(newPath)) {
      this.logger.error(`File already exists at destination: ${newPath}`);
      throw new BadRequestException('File already exists at destination');
    }
    try {
      fs.renameSync(oldPath, newPath);
      this.logger.log(`File moved from ${oldPath} to ${newPath}`);
      return { message: 'File moved/renamed successfully', newPath };
    } catch (error) {
      this.logger.error(`Error moving file: ${error.message}`);
      throw new InternalServerErrorException('Error moving file');
    }
  }

  copyFile(folder: string, filename: string, body: { newFolder?: string }) {
    const oldPath = this.getSafePath(this.config.storagePath, folder, filename);
    const newFolder = body.newFolder || folder;
    const newFolderPath = this.getSafePath(this.config.storagePath, newFolder);
    if (!fs.existsSync(oldPath)) {
      this.logger.error(`File not found: ${filename} in folder: ${folder}`);
      throw new NotFoundException('File not found');
    }
    if (!fs.existsSync(newFolderPath)) {
      try {
        fs.mkdirSync(newFolderPath, { recursive: true });
        this.logger.log(`Created destination folder: ${newFolder}`);
      } catch (error) {
        this.logger.error(
          `Error creating folder ${newFolder}: ${error.message}`,
        );
        throw new InternalServerErrorException(
          'Failed to create destination folder',
        );
      }
    }
    const newPath = this.getSafePath(newFolderPath, filename);
    try {
      fs.copyFileSync(oldPath, newPath);
      this.logger.log(`File copied from ${oldPath} to ${newPath}`);
      return { message: 'File copied successfully', newPath };
    } catch (error) {
      this.logger.error(`Error copying file: ${error.message}`);
      throw new InternalServerErrorException('Error copying file');
    }
  }

  async downloadAllFiles(folder: string, res: Response) {
    const folderPath = this.getSafePath(this.config.storagePath, folder);
    if (!fs.existsSync(folderPath)) {
      this.logger.error(`Folder not found: ${folder}`);
      throw new NotFoundException('Folder not found');
    }
    const files = fs.readdirSync(folderPath);
    if (files.length === 0) {
      this.logger.warn(`No files found in folder: ${folder}`);
      throw new BadRequestException('No files available in this folder');
    }
    const archive = archiver('zip', { zlib: { level: 9 } });
    res.attachment(`${folder}.zip`);
    archive.pipe(res);
    files.forEach((file) => {
      try {
        const filePath = this.getSafePath(folderPath, file);
        archive.file(filePath, { name: file });
      } catch (error) {
        this.logger.error(`Error adding file ${file} to ZIP: ${error.message}`);
      }
    });
    try {
      await archive.finalize();
      this.logger.log(`ZIP archive generated for folder: ${folder}`);
    } catch (error) {
      this.logger.error(`Error finalizing ZIP: ${error.message}`);
      throw new InternalServerErrorException('Error generating ZIP archive');
    }
  }

  getTemporaryLinks(folder: string) {
    const folderPath = this.getSafePath(this.config.storagePath, folder);
    if (!fs.existsSync(folderPath)) {
      this.logger.error(`Folder not found: ${folder}`);
      throw new NotFoundException('Folder not found');
    }
    const files = fs.readdirSync(folderPath);
    if (files.length === 0) {
      this.logger.warn(`No files found in folder: ${folder}`);
      throw new BadRequestException('No files available in this folder');
    }
    const fileLinks = files.map((file) => ({
      filename: file,
      url: `${process.env.serviceUrl}/folders/${folder}/files/${file}?temp=true`,
    }));
    return { folder, fileLinks };
  }

  getTemporaryFileLink(folder: string, filename: string) {
    return {
      url: `${process.env.serviceUrl}/folders/${folder}/files/${filename}?temp=true`,
    };
  }

  searchFiles(folder: string, pattern: string) {
    const folderPath = this.getSafePath(this.config.storagePath, folder);
    if (!fs.existsSync(folderPath)) {
      this.logger.error(`Folder not found: ${folder}`);
      throw new NotFoundException('Folder not found');
    }
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, 'i');
    } catch (error) {
      console.log('error', error);
      this.logger.error(`Invalid regex: ${pattern}`);
      throw new BadRequestException('Invalid regular expression');
    }
    const files = fs.readdirSync(folderPath);
    const matchingFiles = files.filter((file) => regex.test(file));
    return { folder, pattern, matchingFiles };
  }

  async getJsonFile(
    folder: string,
    filename: string,
  ): Promise<JsonFileResponse> {
    const filePath = this.getSafePath(
      this.config.storagePath,
      folder,
      `${filename}.json`,
    );
    if (!fs.existsSync(filePath)) {
      this.logger.error(
        `JSON file not found: ${filename}.json in folder ${folder}`,
      );
      throw new NotFoundException('JSON file not found');
    }
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      return { content: JSON.parse(fileContent) };
    } catch (error) {
      this.logger.error(
        `Error parsing JSON file ${filename}.json: ${error.message}`,
      );
      throw new InternalServerErrorException('Error parsing JSON file');
    }
  }

  async getNestedJsonValue(
    folder: string,
    filename: string,
    pathParams: any,
  ): Promise<JsonValueResponse> {
    const wildcardPath = pathParams['path'][0] || '';
    const keys = wildcardPath.split('/').filter((key) => key !== '');

    try {
      JsonPathValidator.validate(keys);

      const filePath = this.getSafePath(
        this.config.storagePath,
        folder,
        `${filename}.json`,
      );
      if (!fs.existsSync(filePath)) {
        this.logger.error(
          `JSON file not found: ${filename}.json in folder ${folder}`,
        );
        throw new NotFoundException('JSON file not found');
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      let result = JSON.parse(fileContent);

      for (const key of keys) {
        if (result[key] === undefined) {
          this.logger.error(`Key '${key}' not found in ${filename}.json`);
          throw new BadRequestException(`Key '${key}' not found`);
        }
        result = result[key];
      }
      return { value: result };
    } catch (error) {
      if (error instanceof JsonPathValidationError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `Error processing JSON file ${filename}.json: ${error.message}`,
      );
      throw new InternalServerErrorException('Error processing JSON file');
    }
  }

  async queryJsonFile(
    folder: string,
    filename: string,
    query: string,
  ): Promise<JsonValueResponse> {
    try {
      JsonPathValidator.validateJsonQuery(query);

      const filePath = this.getSafePath(
        this.config.storagePath,
        folder,
        `${filename}.json`,
      );
      if (!fs.existsSync(filePath)) {
        this.logger.error(
          `JSON file not found: ${filename}.json in folder ${folder}`,
        );
        throw new NotFoundException('JSON file not found');
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const jsonData = JSON.parse(fileContent);

      const segments = query.split('.');
      let result = jsonData;

      for (const segment of segments) {
        const arrayMatch = segment.match(/^(\w+)\[(\d+)\]$/);
        if (arrayMatch) {
          const [, key, index] = arrayMatch;
          result = result[key]?.[parseInt(index, 10)];
        } else {
          result = result[segment];
        }

        if (result === undefined) {
          throw new BadRequestException(`Path '${query}' not found in JSON`);
        }
      }

      return { value: result };
    } catch (error) {
      if (
        error instanceof JsonPathValidationError ||
        error instanceof BadRequestException
      ) {
        throw new BadRequestException(error.message);
      }
      this.logger.error(
        `Error querying JSON file ${filename}.json: ${error.message}`,
      );
      throw new InternalServerErrorException('Error processing JSON file');
    }
  }

  deleteFile(folder: string, filename: string) {
    const filePath = this.getSafePath(
      this.config.storagePath,
      folder,
      filename,
    );
    if (!fs.existsSync(filePath)) {
      this.logger.error(`File not found: ${filename} in folder: ${folder}`);
      throw new NotFoundException('File not found');
    }
    try {
      fs.rmSync(filePath);
      this.logger.log(
        `File deleted successfully: ${filename} from folder: ${folder}`,
      );
      return { message: 'File deleted successfully' };
    } catch (error) {
      this.logger.error(`Error deleting file ${filename}: ${error.message}`);
      throw new InternalServerErrorException('Error deleting file');
    }
  }

  updateFileMetadata(
    folder: string,
    filename: string,
    body: { newFilename?: string; newFolder?: string },
  ) {
    const oldPath = this.getSafePath(this.config.storagePath, folder, filename);
    const newFolder = body.newFolder || folder;
    const newFilename = body.newFilename || filename;
    const newFolderPath = this.getSafePath(this.config.storagePath, newFolder);
    if (!fs.existsSync(newFolderPath)) {
      try {
        fs.mkdirSync(newFolderPath, { recursive: true });
        this.logger.log(`Created destination folder: ${newFolder}`);
      } catch (error) {
        this.logger.error(
          `Error creating folder ${newFolder}: ${error.message}`,
        );
        throw new InternalServerErrorException(
          'Failed to create destination folder',
        );
      }
    }
    const newPath = this.getSafePath(newFolderPath, newFilename);
    if (fs.existsSync(newPath)) {
      this.logger.error(`File already exists at destination: ${newPath}`);
      throw new BadRequestException('File already exists at destination');
    }
    try {
      fs.renameSync(oldPath, newPath);
      this.logger.log(`File metadata updated from ${oldPath} to ${newPath}`);
      return { message: 'File metadata updated successfully', newPath };
    } catch (error) {
      this.logger.error(`Error updating file metadata: ${error.message}`);
      throw new InternalServerErrorException('Error updating file metadata');
    }
  }

  getFolderSize(folder: string) {
    const folderPath = this.getSafePath(this.config.storagePath, folder);
    if (!fs.existsSync(folderPath)) {
      this.logger.error(`Folder not found: ${folder}`);
      throw new NotFoundException('Folder not found');
    }
    const getSize = (dirPath: string): number => {
      const files = fs.readdirSync(dirPath);
      return files.reduce((total, file) => {
        const filePath = this.getSafePath(dirPath, file);
        const stats = fs.statSync(filePath);
        return total + (stats.isDirectory() ? getSize(filePath) : stats.size);
      }, 0);
    };
    const size = getSize(folderPath);
    return { folder, size };
  }

  listFiles(folder: string) {
    const folderPath = this.getSafePath(this.config.storagePath, folder);
    if (!fs.existsSync(folderPath)) {
      this.logger.error(`Folder not found: ${folder}`);
      throw new NotFoundException('Folder not found');
    }
    const files = fs.readdirSync(folderPath);
    return { folder, files };
  }

  getFile(folder: string, filename: string, res: Response) {
    const filePath = this.getSafePath(
      this.config.storagePath,
      folder,
      filename,
    );
    if (!fs.existsSync(filePath)) {
      this.logger.error(`File not found: ${filename} in folder: ${folder}`);
      throw new NotFoundException('File not found');
    }
    const stats = fs.statSync(filePath);
    const etag = `"${stats.mtimeMs.toString(36)}-${stats.size.toString(36)}"`;
    res.set({
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'ETag': etag,
      'Last-Modified': stats.mtime.toUTCString(),
    });
    return res.sendFile(filePath);
  }

  renameFolder(folder: string, newFolderName: string) {
    const oldFolderPath = this.getSafePath(this.config.storagePath, folder);
    const newFolderPath = this.getSafePath(
      this.config.storagePath,
      newFolderName,
    );
    if (!fs.existsSync(oldFolderPath)) {
      this.logger.error(`Folder not found: ${folder}`);
      throw new NotFoundException('Folder not found');
    }
    if (fs.existsSync(newFolderPath)) {
      this.logger.error(`Folder already exists: ${newFolderName}`);
      throw new BadRequestException('Folder already exists');
    }
    try {
      fs.renameSync(oldFolderPath, newFolderPath);
      this.logger.log(`Folder renamed from ${folder} to ${newFolderName}`);
      return { message: 'Folder renamed successfully', newFolderName };
    } catch (error) {
      this.logger.error(`Error renaming folder ${folder}: ${error.message}`);
      throw new InternalServerErrorException('Error renaming folder');
    }
  }

  // Method to move a folder to a different location
  moveFolder(folder: string, newLocation: string) {
    const oldFolderPath = this.getSafePath(this.config.storagePath, folder);
    const newFolderPath = this.getSafePath(
      this.config.storagePath,
      newLocation,
      folder,
    );
    if (!fs.existsSync(oldFolderPath)) {
      this.logger.error(`Folder not found: ${folder}`);
      throw new NotFoundException('Folder not found');
    }
    if (fs.existsSync(newFolderPath)) {
      this.logger.error(
        `Folder already exists at destination: ${newFolderPath}`,
      );
      throw new BadRequestException('Folder already exists at destination');
    }
    try {
      fs.renameSync(oldFolderPath, newFolderPath);
      this.logger.log(`Folder moved from ${oldFolderPath} to ${newFolderPath}`);
      return { message: 'Folder moved successfully', newFolderPath };
    } catch (error) {
      this.logger.error(`Error moving folder ${folder}: ${error.message}`);
      throw new InternalServerErrorException('Error moving folder');
    }
  }

  // Method to get a preview of a file
  async getFilePreview(
    folder: string,
    filename: string,
    req: Request,
    res: Response,
  ) {
    const filePath = this.getSafePath(
      this.config.storagePath,
      folder,
      filename,
    );
    if (!fs.existsSync(filePath)) {
      this.logger.error(`File not found: ${filename} in folder: ${folder}`);
      throw new NotFoundException('File not found');
    }

    const stats = fs.statSync(filePath);
    const mimeType = lookup(filePath) || 'application/octet-stream';
    const etag = `"${stats.mtimeMs.toString(36)}-${stats.size.toString(36)}"`;

    // For large files, only show preview if supported
    if (stats.size > VIEW_CONFIG.PREVIEW_SIZE_LIMIT) {
      if (!this.isPreviewSupported(mimeType)) {
        throw new BadRequestException(
          'Preview not available for this file type or size',
        );
      }
    }

    res.set({
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'ETag': etag,
      'Last-Modified': stats.mtime.toUTCString(),
    });

    try {
      // Handle image previews
      if (VIEW_CONFIG.IMAGE_TYPES.includes(mimeType)) {
        const thumbnail = fs.readFileSync(filePath);

        res.setHeader('Content-Type', mimeType);
        return res.send(thumbnail);
      }

      // Handle video and audio previews - Stream with range support
      if (
        VIEW_CONFIG.VIDEO_TYPES.includes(mimeType) ||
        VIEW_CONFIG.AUDIO_TYPES.includes(mimeType)
      ) {
        const range = req.headers.range;
        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
          const chunkSize = end - start + 1;
          const stream = fs.createReadStream(filePath, { start, end });

          const headers = {
            'Content-Range': `bytes ${start}-${end}/${stats.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': mimeType,
          };

          res.writeHead(206, headers);
          return stream.pipe(res);
        } else {
          const headers = {
            'Content-Length': stats.size,
            'Content-Type': mimeType,
            'Accept-Ranges': 'bytes',
          };
          res.writeHead(200, headers);
          return fs.createReadStream(filePath).pipe(res);
        }
      }

      // Handle text previews
      if (VIEW_CONFIG.TEXT_TYPES.includes(mimeType)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const preview =
          content.substring(0, 1000) + (content.length > 1000 ? '...' : '');
        return { preview, mimeType };
      }

      // Handle PDF previews
      if (VIEW_CONFIG.PDF_TYPES.includes(mimeType)) {
        res.setHeader('Content-Type', mimeType);
        res.setHeader(
          'Content-Range',
          `bytes 0-${Math.min(stats.size, VIEW_CONFIG.PREVIEW_SIZE_LIMIT)}`,
        );
        const stream = createReadStream(filePath, {
          start: 0,
          end: VIEW_CONFIG.PREVIEW_SIZE_LIMIT - 1,
        });
        return stream.pipe(res);
      }

      throw new BadRequestException('Preview not available for this file type');
    } catch (error) {
      this.logger.error(
        `Error generating preview for ${filename}: ${error.message}`,
      );
      throw new InternalServerErrorException('Error generating file preview');
    }
  }

  async getThumbnail(folder: string, filename: string, res: Response) {
    const filePath = this.getSafePath(
      this.config.storagePath,
      folder,
      filename,
    );
    if (!fs.existsSync(filePath)) {
      this.logger.error(`File not found: ${filename} in folder: ${folder}`);
      throw new NotFoundException('File not found');
    }

    const mimeType = lookup(filePath) || 'application/octet-stream';
    const stats = fs.statSync(filePath);
    const etag = `"thumb-${stats.mtimeMs.toString(36)}-${stats.size.toString(36)}"`;

    res.set({
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'ETag': etag,
      'Last-Modified': stats.mtime.toUTCString(),
    });

    try {
      // Handle image thumbnails
      if (VIEW_CONFIG.IMAGE_TYPES.includes(mimeType)) {
        const thumbnail = fs.readFileSync(filePath);

        res.setHeader('Content-Type', 'image/jpeg');
        return res.send(thumbnail);
      }

      // For video types, try to extract frame or generate dynamic thumbnail
      if (VIEW_CONFIG.VIDEO_TYPES.includes(mimeType)) {
        res.setHeader('Content-Type', 'image/jpeg');
        return res.send(undefined);
      }

      throw new BadRequestException(
        'Thumbnail not available for this file type',
      );
    } catch (error) {
      this.logger.error(
        `Error generating thumbnail for ${filename}: ${error.message}`,
      );
      throw new InternalServerErrorException('Error generating thumbnail');
    }
  }

  private isPreviewSupported(mimeType: string): boolean {
    const supportedTypes = [
      ...VIEW_CONFIG.IMAGE_TYPES,
      ...VIEW_CONFIG.PDF_TYPES,
      ...VIEW_CONFIG.TEXT_TYPES,
      ...VIEW_CONFIG.AUDIO_TYPES,
      ...VIEW_CONFIG.VIDEO_TYPES,
    ] as string[];
    return supportedTypes.includes(mimeType);
  }

  // Method to get a hierarchical tree structure of folders and files
  async getFolderTree(): Promise<FolderTreeResponse> {
    const buildTree = (dirPath: string) => {
      const name = dirPath.split('/').pop();
      const item = { name, children: [] };
      const files = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const file of files) {
        if (file.isDirectory()) {
          item.children.push(buildTree(join(dirPath, file.name)));
        } else {
          item.children.push({ name: file.name });
        }
      }
      return item;
    };
    return buildTree(this.config.storagePath);
  }

  // Method to generate a shareable link for a file
  async generateShareableLink(
    folder: string,
    filename: string,
  ): Promise<ShareableLinkResponse> {
    const filePath = this.getSafePath(
      this.config.storagePath,
      folder,
      filename,
    );
    if (!fs.existsSync(filePath)) {
      this.logger.error(`File not found: ${filename} in folder: ${folder}`);
      throw new NotFoundException('File not found');
    }
    const shareableLink = `${process.env.serviceUrl}/folders/${folder}/files/${filename}?share=true`;
    return { shareableLink };
  }

  // Method to lock a file for editing
  lockFile(folder: string, filename: string) {
    const filePath = this.getSafePath(
      this.config.storagePath,
      folder,
      filename,
    );
    if (!fs.existsSync(filePath)) {
      this.logger.error(`File not found: ${filename} in folder: ${folder}`);
      throw new NotFoundException('File not found');
    }
    const lockFilePath = `${filePath}.lock`;
    if (fs.existsSync(lockFilePath)) {
      this.logger.error(`File is already locked: ${filename}`);
      throw new BadRequestException('File is already locked');
    }
    try {
      fs.writeFileSync(lockFilePath, '');
      this.logger.log(`File locked successfully: ${filename}`);
      return { message: 'File locked successfully' };
    } catch (error) {
      this.logger.error(`Error locking file ${filename}: ${error.message}`);
      throw new InternalServerErrorException('Error locking file');
    }
  }

  // Method to unlock a file for editing
  unlockFile(folder: string, filename: string) {
    const filePath = this.getSafePath(
      this.config.storagePath,
      folder,
      filename,
    );
    if (!fs.existsSync(filePath)) {
      this.logger.error(`File not found: ${filename} in folder: ${folder}`);
      throw new NotFoundException('File not found');
    }
    const lockFilePath = `${filePath}.lock`;
    if (!fs.existsSync(lockFilePath)) {
      this.logger.error(`File is not locked: ${filename}`);
      throw new BadRequestException('File is not locked');
    }
    try {
      fs.rmSync(lockFilePath);
      this.logger.log(`File unlocked successfully: ${filename}`);
      return { message: 'File unlocked successfully' };
    } catch (error) {
      this.logger.error(`Error unlocking file ${filename}: ${error.message}`);
      throw new InternalServerErrorException('Error unlocking file');
    }
  }

  // Method to get a list of recently modified files
  getRecentFiles() {
    const getRecentFilesFromDir = (dirPath: string) => {
      const files = fs.readdirSync(dirPath, { withFileTypes: true });
      let recentFiles = [];
      for (const file of files) {
        const filePath = join(dirPath, file.name);
        if (file.isDirectory()) {
          recentFiles = recentFiles.concat(getRecentFilesFromDir(filePath));
        } else {
          const stats = fs.statSync(filePath);
          recentFiles.push({ name: file.name, modifiedAt: stats.mtime });
        }
      }
      return recentFiles;
    };
    const recentFiles = getRecentFilesFromDir(this.config.storagePath);
    recentFiles.sort((a, b) => b.modifiedAt - a.modifiedAt);
    return recentFiles.slice(0, 10);
  }

  // Method to get different versions of a file
  async getFileVersions(
    folder: string,
    filename: string,
  ): Promise<FileVersionResponse> {
    const filePath = this.getSafePath(
      this.config.storagePath,
      folder,
      filename,
    );
    if (!fs.existsSync(filePath)) {
      this.logger.error(`File not found: ${filename} in folder: ${folder}`);
      throw new NotFoundException('File not found');
    }
    const versionFiles = fs
      .readdirSync(this.config.storagePath)
      .filter((file) => file.startsWith(`${filename}.v`))
      .map((file) => ({ version: file.split('.v')[1], filename: file }));
    return { filename, versions: versionFiles };
  }

  onModuleInit() {
    // Create thumbnails directory if it doesn't exist
    const thumbnailsPath = this.getSafePath(
      this.config.storagePath,
      '.thumbnails',
    );
    if (!fs.existsSync(thumbnailsPath)) {
      fs.mkdirSync(thumbnailsPath, { recursive: true });
    }
    // Run initial cleanup when service starts
    // this.cleanupFiles();
  }

  // @Interval(3600000) // Run every hour
  // private async cleanupFiles() {
  //     try {
  //         await FileCleanupUtil.cleanupTempFiles(this.config.storagePath);
  //         await FileCleanupUtil.cleanupEmptyFolders(this.config.storagePath);
  //         this.logger.log('Completed periodic file cleanup');
  //     } catch (error) {
  //         this.logger.error('Error during file cleanup:', error);
  //     }
  // }

  async copyFolder(sourceFolder: string, destinationFolder: string) {
    const sourcePath = this.getSafePath(this.config.storagePath, sourceFolder);
    const destPath = this.getSafePath(
      this.config.storagePath,
      destinationFolder,
    );

    // Validate source folder exists
    if (!fs.existsSync(sourcePath)) {
      this.logger.error(`Source folder not found: ${sourceFolder}`);
      throw new NotFoundException('Source folder not found');
    }

    // Check if destination folder already exists
    if (fs.existsSync(destPath)) {
      this.logger.error(
        `Destination folder already exists: ${destinationFolder}`,
      );
      throw new BadRequestException('Destination folder already exists');
    }

    try {
      // Create destination folder
      fs.mkdirSync(destPath, { recursive: true });

      // Function to recursively copy folder contents
      const copyRecursive = (src: string, dest: string) => {
        const entries = fs.readdirSync(src, { withFileTypes: true });

        for (const entry of entries) {
          const srcPath = join(src, entry.name);
          const destPath = join(dest, entry.name);

          if (entry.isDirectory()) {
            fs.mkdirSync(destPath, { recursive: true });
            copyRecursive(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
        }
      };

      // Start recursive copy
      copyRecursive(sourcePath, destPath);

      this.logger.log(`Folder copied from ${sourcePath} to ${destPath}`);
      return {
        message: 'Folder copied successfully',
        sourceFolder,
        destinationFolder,
      };
    } catch (error) {
      this.logger.error(`Error copying folder: ${error.message}`);
      throw new InternalServerErrorException('Error copying folder');
    }
  }
    async stream(
      filename: string,
      folder: string,
      req: Request,
      res: Response
    ) {
      const requestId = req.headers['x-request-id'] ||
        `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      try {
        const filePath = this.getSafePath(this.config.storagePath, folder, filename);

        if (!fs.existsSync(filePath)) {
          this.logger.warn(`[${requestId}] ❌ File not found: ${filePath}`);
          return res.status(404).json({ error: 'File not found' });
        }

        const stat = await fs.promises.stat(filePath);
        if (!stat.isFile() || stat.size === 0) {
          this.logger.warn(`[${requestId}] ❌ Invalid file`);
          return res.status(400).json({ error: 'Invalid file' });
        }

        const mimeType = mime.lookup(filePath) || 'application/octet-stream';
        const fileSize = stat.size;
        const rangeHeader = req.headers.range;
        const etag = `"${stat.mtime.getTime()}-${stat.size}"`;
        const lastModified = stat.mtime.toUTCString();

        if (req.headers['if-none-match'] === etag) {
          return res.status(304).end();
        }

        if (req.headers['if-modified-since']) {
          const clientDate = new Date(req.headers['if-modified-since']);
          if (clientDate >= new Date(stat.mtime.getTime() - 1000)) {
            return res.status(304).end();
          }
        }

        let start = 0;
        let end = fileSize - 1;
        let statusCode = 200;

        if (rangeHeader) {
          const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
          if (match) {
            start = match[1] ? parseInt(match[1]) : 0;
            end = match[2] ? parseInt(match[2]) : fileSize - 1;

            // Clamp end to 1 MB max chunk if client didn't specify end
            const MAX_CHUNK = 1024 * 1024;
            if (!match[2] && end > start + MAX_CHUNK - 1) {
              end = start + MAX_CHUNK - 1;
            }

            if (start >= fileSize || end >= fileSize || start > end) {
              return res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).json({ error: 'Range not satisfiable' });
            }

            statusCode = 206;
          }
        }

        const contentLength = end - start + 1;

        this.logger.log(`[${requestId}] 📤 Streaming ${filename} [${start}-${end}] (${(contentLength / 1024 / 1024).toFixed(2)} MB)`);

        res.writeHead(statusCode, {
          'Content-Type': mimeType,
          'Content-Length': contentLength.toString(),
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'ETag': etag,
          'Last-Modified': lastModified,
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified, Content-Type',
        });

        const stream = fs.createReadStream(filePath, {
          start,
          end,
          highWaterMark: 1024 * 1024, // 1 MB buffer size
        });

        stream.pipe(res);

        stream.on('end', () => {
          // this.logger.log(`[${requestId}] ✅ Stream finished`);
        });

        stream.on('error', (err) => {
          this.logger.error(`[${requestId}] ❌ Stream error:`, err);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Stream error' });
          } else {
            res.destroy();
          }
        });

        req.on('close', () => {
          // this.logger.warn(`[${requestId}] ⚠️ Client disconnected`);
          stream.destroy();
        });

      } catch (error) {
        this.logger.error(`[${requestId}] ❌ Fatal error:`, error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal server error' });
        } else {
          res.destroy();
        }
      }
    }

  async uploadFromUrl(files: Record<string, string>, folderName: string) {
    const results = [];

    const uploadPath = this.getSafePath(this.config.storagePath, folderName);
    let index = 0;
    for (const [key, url] of Object.entries(files)) {
      index++;
      this.logger.log(`⬇️[${index} / ${Object.keys(files).length}] Starting download: ${key} `);

      try {
        const head = await axios.head(url);
        const contentType = head.headers['content-type'];
        const ext = getFileExtension(contentType, url);
        const safeName = sanitizeFileName(key);
        const finalFileName = `${safeName}.${ext} `;
        const filePath = path.resolve(uploadPath, finalFileName);

        if (fs.existsSync(filePath)) {
          this.logger.log(`✅ Skipped(Already exists): ${finalFileName} `);
          results.push({ file: finalFileName, status: 'skipped', reason: 'Already exists' });
          continue;
        }

        fs.mkdirSync(path.dirname(filePath), { recursive: true });

        const response = await axios.get(url, { responseType: 'stream' });
        await streamPipeline(response.data, fs.createWriteStream(filePath));

        this.logger.log(`🎉 Downloaded: ${finalFileName} `);
        results.push({ file: finalFileName, status: 'success' });
      } catch (err) {
        this.logger.warn(`⚠️ Failed to download ${key}: ${err.message} `);
        results.push({ file: key, status: 'failed', reason: err.message });
      }
    }

    this.logger.log(`📦 Download summary - Total: ${Object.keys(files).length}, Success: ${results.filter(r => r.status === 'success').length}, Skipped: ${results.filter(r => r.status === 'skipped').length}, Failed: ${results.filter(r => r.status === 'failed').length} `);

    return { results };
  }

}
