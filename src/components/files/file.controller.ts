import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UploadedFiles,
  UseInterceptors,
  Res,
  Logger,
  DefaultValuePipe,
  ParseIntPipe,
  Injectable,
  ParseFilePipe,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import {
  CustomFileValidator,
  FileSizeValidator,
} from './utils/file-validators';
import { FILE_CONFIG } from './config/file.config';
import { Response, Request } from 'express';
import { FileService } from './file.service';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { existsSync, mkdirSync } from 'fs';
import { basename, join, resolve, sep } from 'path';
import {
  CreateFolderDto,
  MoveFileDto,
  MoveFolderDto,
  RenameFolderDto,
  CopyFileDto,
  UpdateFileMetadataDto,
} from './dto/requests.dto';
import {
  FileMetadataResponse,
  FolderResponse,
  FolderDetailsResponse,
  ShareableLinkResponse,
  FileVersionResponse,
  FolderTreeResponse,
  ErrorResponse,
  JsonFileResponse,
  JsonValueResponse,
  FileOperationMetricsResponse,
} from './dto/responses.dto';
import { JsonPathParams } from './dto/requests.dto';
import { FileOperationMonitor } from './utils/file-operation-monitor';
import { UploadByUrlDto } from './dto/upload-by-url.dto';

const MAX_FILE_SIZE = 1024 * 1024 * 100; // 100MB
const UPLOADS_BASE = join(process.cwd(), 'uploads');

function getSafePath(...segments: string[]): string {
  const filePath = join(...segments);
  const resolvedPath = resolve(filePath);
  const uploadsPath = resolve(UPLOADS_BASE);
  if (
    resolvedPath !== uploadsPath &&
    !resolvedPath.startsWith(`${uploadsPath}${sep}`)
  ) {
    throw new Error(`Invalid path detected: ${resolvedPath}`);
  }
  return resolvedPath;
}

function safeUploadFilename(value: string): string {
  const filename = basename(value);
  if (
    !filename ||
    filename === '.' ||
    filename === '..' ||
    filename !== value ||
    value.includes('\\') ||
    filename.includes('\0')
  ) {
    throw new BadRequestException('Invalid upload filename');
  }
  return filename;
}
//@ApiTags('Folders & Files')
@Injectable()
@Controller()
export class FileController {
  private readonly logger = new Logger(FileController.name);
  private readonly fileService: FileService;

  constructor(fileService: FileService) {
    if (!fileService) {
      throw new Error('FileService is required');
    }
    this.fileService = fileService;
  }

  @Post('folders/:folder/files')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: (req, file, cb) => {
          try {
            const folderName = req.params.folder as string;
            const folderPath = getSafePath(UPLOADS_BASE, folderName);
            if (!existsSync(folderPath)) {
              mkdirSync(folderPath, { recursive: true });
              console.log(`Created folder: ${folderPath}`);
            }
            cb(null, folderPath);
          } catch (error) {
            console.error(`Error setting destination: ${error.message}`);
            cb(error, null);
          }
        },
        filename: (req, file, cb) => {
          try {
            const filenameQuery = req.query.filename as string;
            const originalname = safeUploadFilename(file.originalname);
            const extension = originalname.substring(
              originalname.lastIndexOf('.'),
            );

            // Initialize the fileCounter in the request object if not exists
            if (!(req as any).fileCounter) {
              (req as any).fileCounter = 0;
            }
            (req as any).fileCounter++;

            let finalFilename = originalname;
            if (filenameQuery) {
              const safeBaseName = safeUploadFilename(filenameQuery);
              const currentCount = (req as any).fileCounter;
              finalFilename = `${safeBaseName}${currentCount}${extension}`;
            }

            console.log(`Saving file as: ${finalFilename}`);
            cb(null, finalFilename);
          } catch (error) {
            console.error(`Error setting filename: ${error.message}`);
            cb(error, null);
          }
        },
      }),
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  @ApiOperation({
    summary: 'Upload files to a folder',
    description: 'Upload single or multiple files to a specified folder',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'Files to upload',
        },
      },
    },
  })
  @ApiParam({ name: 'folder', description: 'Target folder name' })
  @ApiQuery({
    name: 'filename',
    required: false,
    description: 'Optional custom filename for single file upload',
  })
  async uploadFiles(
    @Param('folder') folder: string,
    @UploadedFiles(
      new ParseFilePipe({
        validators: [
          new CustomFileValidator({
            fileTypes: FILE_CONFIG.ALLOWED_FILE_TYPES,
          }),
          new FileSizeValidator({ maxSize: FILE_CONFIG.MAX_FILE_SIZE }),
        ],
        errorHttpStatusCode: 400,
      }),
    )
    files: Express.Multer.File[],
  ) {
    if (!files?.length) {
      throw new BadRequestException('No files provided');
    }

    return this.fileService.uploadFiles(folder, files);
  }

  // =====================================================

  // Folder Endpoints
  // =====================================================

  //@ApiTags('Folder Management')
  @Get('folders')
  @ApiOperation({ summary: 'List all folders' })
  @ApiResponse({
    status: 200,
    description: 'Folders listed successfully',
    type: FolderResponse,
  })
  @ApiResponse({
    status: 500,
    description: 'Server error while listing folders',
    type: ErrorResponse,
  })
  listFolders(): Promise<FolderResponse> {
    return this.fileService.listFolders();
  }

  @Get('folders/:folder')
  @ApiOperation({ summary: 'Get folder details and list files' })
  @ApiResponse({
    status: 200,
    description: 'Folder details retrieved successfully',
    type: FolderDetailsResponse,
  })
  @ApiResponse({
    status: 404,
    description: 'Folder not found',
  })
  @ApiParam({ name: 'folder', description: 'Folder name' })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number for pagination',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of files per page',
  })
  getFolderDetails(
    @Param('folder') folder: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<FolderDetailsResponse> {
    return this.fileService.getFolderDetails(folder, page, limit);
  }

  @Get('stream/:folder/:file')
  @ApiParam({ name: 'folder', required: true, description: 'Folder containing the file' })
  @ApiParam({ name: 'file', required: true, description: 'Name of the video file' })
  async stream(
    @Param('file') file: string,
    @Param('folder') folder: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.fileService.stream(file, folder, req, res);
  }

  @Post('uploadFromUrl')
  @ApiBody({ type: UploadByUrlDto })
  async uploadFromUrl(@Body() body: UploadByUrlDto) {
    return this.fileService.uploadFromUrl(body.files, body.folder);
  }

  //@ApiTags('Folder Management')
  @Post('folders')
  @ApiOperation({ summary: 'Create a new folder' })
  @ApiResponse({
    status: 201,
    description: 'Folder created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid folder name',
  })
  @ApiBody({
    schema: { type: 'object', properties: { folderName: { type: 'string' } } },
  })
  createFolder(@Body() createFolderDto: CreateFolderDto) {
    return this.fileService.createFolder(createFolderDto.folderName);
  }

  //@ApiTags('Folder Management')
  @Delete('folders/:folder')
  @ApiOperation({ summary: 'Delete a folder and all its contents' })
  @ApiParam({ name: 'folder', description: 'Folder to delete' })
  deleteFolder(@Param('folder') folder: string) {
    return this.fileService.deleteFolder(folder);
  }

  // =====================================================

  // File Endpoints (Nested under folders)
  // =====================================================

  //@ApiTags('File Operations')
  @Get('folders/:folder/files/:filename/download')
  @ApiOperation({ summary: 'Download a file from a folder' })
  @ApiParam({ name: 'folder', description: 'Folder name' })
  @ApiParam({ name: 'filename', description: 'File name' })
  downloadFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    return this.fileService.downloadFile(folder, filename, res);
  }

  //@ApiTags('File Metadata')
  @Get('folders/:folder/files/:filename/metadata')
  @ApiOperation({ summary: 'Get metadata of a file' })
  @ApiResponse({
    status: 200,
    description: 'File metadata retrieved successfully',
    type: FileMetadataResponse,
  })
  @ApiResponse({
    status: 404,
    description: 'File not found',
  })
  @ApiParam({ name: 'folder', description: 'Folder name' })
  @ApiParam({ name: 'filename', description: 'File name' })
  getFileMetadata(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
  ): Promise<FileMetadataResponse> {
    return this.fileService.getFileMetadata(folder, filename);
  }

  @Put('folders/:folder/files/:filename/move')
  @ApiOperation({ summary: 'Move or rename a file' })
  @ApiResponse({
    status: 200,
    description: 'File moved successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid destination',
  })
  @ApiResponse({
    status: 404,
    description: 'File not found',
  })
  @ApiParam({ name: 'folder', description: 'Current folder of the file' })
  @ApiParam({ name: 'filename', description: 'Current file name' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        newFolder: { type: 'string' },
        newFilename: { type: 'string' },
      },
    },
  })
  moveFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Body() moveFileDto: MoveFileDto,
  ) {
    return this.fileService.moveFile(folder, filename, moveFileDto);
  }

  @Post('folders/:folder/files/:filename/copy')
  @ApiOperation({ summary: 'Copy a file to another location' })
  @ApiResponse({ status: 201, description: 'File copied successfully' })
  @ApiResponse({ status: 400, description: 'Invalid destination' })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiParam({ name: 'folder', description: 'Source folder' })
  @ApiParam({ name: 'filename', description: 'File to copy' })
  @ApiBody({
    schema: { type: 'object', properties: { newFolder: { type: 'string' } } },
  })
  copyFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Body() copyFileDto: CopyFileDto,
  ) {
    return this.fileService.copyFile(folder, filename, copyFileDto);
  }

  @Get('folders/:folder/files/download-all')
  @ApiOperation({ summary: 'Download all files in a folder as a ZIP archive' })
  @ApiParam({ name: 'folder', description: 'Folder name' })
  async downloadAllFiles(
    @Param('folder') folder: string,
    @Res() res: Response,
  ) {
    return this.fileService.downloadAllFiles(folder, res);
  }

  @Get('folders/:folder/files/temp-links')
  @ApiOperation({
    summary: 'Get temporary access links for all files in a folder',
  })
  @ApiParam({ name: 'folder', description: 'Folder name' })
  getTemporaryLinks(@Param('folder') folder: string) {
    return this.fileService.getTemporaryLinks(folder);
  }

  //@ApiTags('File Sharing')
  @Get('folders/:folder/files/:filename/temp-link')
  @ApiOperation({ summary: 'Generate a temporary access link for a file' })
  @ApiParam({ name: 'folder', description: 'Folder name' })
  @ApiParam({ name: 'filename', description: 'File name' })
  getTemporaryFileLink(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
  ) {
    return this.fileService.getTemporaryFileLink(folder, filename);
  }

  //@ApiTags('Search & Browse')
  @Get('folders/:folder/files/search')
  @ApiOperation({ summary: 'Search for files by name in a folder' })
  @ApiParam({ name: 'folder', description: 'Folder name' })
  @ApiQuery({
    name: 'pattern',
    description: 'Regex pattern for matching filenames',
  })
  searchFiles(
    @Param('folder') folder: string,
    @Query('pattern') pattern: string,
  ) {
    return this.fileService.searchFiles(folder, pattern);
  }

  // =====================================================

  // JSON File Endpoints (with dedicated "json" prefix)
  // =====================================================

  //@ApiTags('JSON Operations')
  @Get('json/folders/:folder/files/:filename')
  @ApiOperation({
    summary: 'Retrieve the entire JSON file',
    description: 'Returns the complete contents of a JSON file',
  })
  @ApiResponse({
    status: 200,
    description: 'JSON file contents retrieved successfully',
    type: JsonFileResponse,
  })
  @ApiResponse({
    status: 404,
    description: 'JSON file not found',
    type: ErrorResponse,
  })
  @ApiResponse({
    status: 500,
    description: 'Error parsing JSON file',
    type: ErrorResponse,
  })
  getJsonFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
  ) {
    return this.fileService.getJsonFile(folder, filename);
  }

  //@ApiTags('JSON Operations')
  @Get('json/folders/:folder/files/:filename/*path')
  @ApiOperation({
    summary: 'Retrieve a nested value from a JSON file by key path',
    description:
      'Returns a specific value from a JSON file using a path with / as separator',
  })
  @ApiResponse({
    status: 200,
    description: 'JSON value retrieved successfully',
    type: JsonValueResponse,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid path or key not found',
    type: ErrorResponse,
  })
  @ApiResponse({
    status: 404,
    description: 'JSON file not found',
    type: ErrorResponse,
  })
  @ApiParam({
    name: 'path',
    description: 'Path to the nested value (e.g., user/profile/name)',
    type: String,
  })
  getNestedJsonValue(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Param() pathParams: JsonPathParams,
  ) {
    return this.fileService.getNestedJsonValue(folder, filename, pathParams);
  }

  //@ApiTags('JSON Operations')
  @Get('json/folders/:folder/files/:filename/query')
  @ApiOperation({
    summary: 'Query a JSON file using dot notation',
    description:
      'Query JSON data using dot notation and array indices. Example: users[0].profile.name',
  })
  @ApiResponse({
    status: 200,
    description: 'JSON value retrieved successfully',
    type: JsonValueResponse,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid query format or path not found',
    type: ErrorResponse,
  })
  @ApiResponse({
    status: 404,
    description: 'JSON file not found',
    type: ErrorResponse,
  })
  @ApiQuery({
    name: 'query',
    description:
      'JSON path query using dot notation (e.g., users[0].profile.name)',
    required: true,
    type: String,
  })
  queryJsonFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Query('query') query: string,
  ) {
    return this.fileService.queryJsonFile(folder, filename, query);
  }

  // =====================================================

  // Additional File Endpoints
  // =====================================================

  //@ApiTags('File Operations')
  @Delete('folders/:folder/files/:filename')
  @ApiOperation({ summary: 'Delete a file from a folder' })
  @ApiParam({ name: 'folder', description: 'Folder name' })
  @ApiParam({ name: 'filename', description: 'File name' })
  deleteFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
  ) {
    return this.fileService.deleteFile(folder, filename);
  }

  //@ApiTags('File Metadata')
  @Put('folders/:folder/files/:filename/metadata')
  @ApiOperation({ summary: 'Update file metadata' })
  @ApiResponse({
    status: 200,
    description: 'File metadata updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid metadata' })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiParam({ name: 'folder', description: 'Folder name' })
  @ApiParam({ name: 'filename', description: 'File name' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        newFilename: { type: 'string', description: 'New filename' },
        newFolder: { type: 'string', description: 'New folder' },
      },
    },
  })
  updateFileMetadata(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Body() updateFileMetadataDto: UpdateFileMetadataDto,
  ) {
    return this.fileService.updateFileMetadata(
      folder,
      filename,
      updateFileMetadataDto,
    );
  }

  @Get('folders/:folder/size')
  @ApiOperation({ summary: 'Get the total size of a folder' })
  @ApiParam({ name: 'folder', description: 'Folder name' })
  getFolderSize(@Param('folder') folder: string) {
    return this.fileService.getFolderSize(folder);
  }

  @Get('folders/:folder/files')
  @ApiOperation({ summary: 'List all files in a folder' })
  @ApiParam({ name: 'folder', description: 'Folder name' })
  listFiles(@Param('folder') folder: string) {
    return this.fileService.listFiles(folder);
  }

  @Get('folders/:folder/files/:filename/thumbnail')
  @ApiOperation({ summary: 'Get a thumbnail of an image or video file' })
  @ApiParam({ name: 'folder', description: 'Folder name' })
  @ApiParam({ name: 'filename', description: 'File name' })
  getThumbnail(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    return this.fileService.getThumbnail(folder, filename, res);
  }

  // =====================================================

  // File Retrieval Endpoint (Catch-all for file serving)
  // =====================================================

  //@ApiTags('File Operations')
  @Get('folders/:folder/files/:filename')
  @ApiOperation({ summary: 'Retrieve a file from a folder' })
  @ApiParam({ name: 'folder', description: 'Folder name' })
  @ApiParam({ name: 'filename', description: 'File name' })
  getFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    return this.fileService.getFile(folder, filename, res);
  }

  // =====================================================

  // Additional Folder Endpoints
  // =====================================================

  //@ApiTags('Folder Management')
  @Put('folders/:folder/rename')
  @ApiOperation({ summary: 'Rename a folder' })
  @ApiResponse({ status: 200, description: 'Folder renamed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid folder name' })
  @ApiResponse({ status: 404, description: 'Folder not found' })
  @ApiParam({ name: 'folder', description: 'Current folder name' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { newFolderName: { type: 'string' } },
    },
  })
  renameFolder(
    @Param('folder') folder: string,
    @Body() renameFolderDto: RenameFolderDto,
  ) {
    return this.fileService.renameFolder(folder, renameFolderDto.newFolderName);
  }

  //@ApiTags('Folder Management')
  @Put('folders/:folder/move')
  @ApiOperation({ summary: 'Move a folder to a different location' })
  @ApiResponse({ status: 200, description: 'Folder moved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid destination' })
  @ApiResponse({ status: 404, description: 'Folder not found' })
  @ApiParam({ name: 'folder', description: 'Current folder name' })
  @ApiBody({
    schema: { type: 'object', properties: { newLocation: { type: 'string' } } },
  })
  moveFolder(
    @Param('folder') folder: string,
    @Body() moveFolderDto: MoveFolderDto,
  ) {
    return this.fileService.moveFolder(folder, moveFolderDto.newLocation);
  }

  @Get('folders/:folder/files/:filename/preview')
  @ApiOperation({ summary: 'Get a preview of a file' })
  @ApiParam({ name: 'folder', description: 'Folder name' })
  @ApiParam({ name: 'filename', description: 'File name' })
  getFilePreview(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.fileService.getFilePreview(folder, filename, req, res);
  }

  //@ApiTags('Search & Browse')
  @Get('folders/tree')
  @ApiOperation({
    summary: 'Get a hierarchical tree structure of folders and files',
  })
  @ApiResponse({
    status: 200,
    description: 'Folder tree retrieved successfully',
    type: FolderTreeResponse,
  })
  getFolderTree(): Promise<FolderTreeResponse> {
    return this.fileService.getFolderTree();
  }

  //@ApiTags('File Sharing')
  @Post('folders/:folder/files/:filename/share')
  @ApiOperation({ summary: 'Generate a shareable link for a file' })
  @ApiResponse({
    status: 200,
    description: 'Shareable link generated',
    type: ShareableLinkResponse,
  })
  @ApiResponse({
    status: 404,
    description: 'File not found',
  })
  @ApiParam({ name: 'folder', description: 'Folder name' })
  @ApiParam({ name: 'filename', description: 'File name' })
  generateShareableLink(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
  ): Promise<ShareableLinkResponse> {
    return this.fileService.generateShareableLink(folder, filename);
  }

  //@ApiTags('File Locking')
  @Put('folders/:folder/files/:filename/lock')
  @ApiOperation({ summary: 'Lock a file for editing' })
  @ApiParam({ name: 'folder', description: 'Folder name' })
  @ApiParam({ name: 'filename', description: 'File name' })
  @ApiResponse({
    status: 400,
    description: 'File is already locked',
    type: ErrorResponse,
  })
  @ApiResponse({
    status: 404,
    description: 'File not found',
    type: ErrorResponse,
  })
  @ApiResponse({
    status: 500,
    description: 'Error locking file',
    type: ErrorResponse,
  })
  lockFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
  ) {
    return this.fileService.lockFile(folder, filename);
  }

  //@ApiTags('File Locking')
  @Put('folders/:folder/files/:filename/unlock')
  @ApiOperation({ summary: 'Unlock a file for editing' })
  @ApiParam({ name: 'folder', description: 'Folder name' })
  @ApiParam({ name: 'filename', description: 'File name' })
  unlockFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
  ) {
    return this.fileService.unlockFile(folder, filename);
  }

  //@ApiTags('Search & Browse')
  @Get('files/recent')
  @ApiOperation({ summary: 'Get a list of recently modified files' })
  getRecentFiles() {
    return this.fileService.getRecentFiles();
  }

  //@ApiTags('File Versions')
  @Get('folders/:folder/files/:filename/versions')
  @ApiOperation({ summary: 'Get different versions of a file' })
  @ApiResponse({
    status: 200,
    description: 'File versions retrieved successfully',
    type: FileVersionResponse,
  })
  @ApiResponse({
    status: 404,
    description: 'File not found',
  })
  @ApiParam({ name: 'folder', description: 'Folder name' })
  @ApiParam({ name: 'filename', description: 'File name' })
  getFileVersions(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
  ): Promise<FileVersionResponse> {
    return this.fileService.getFileVersions(folder, filename);
  }

  @Get('metrics/file-operations')
  @ApiOperation({
    summary: 'Get file operation metrics',
    description:
      'Retrieve metrics about recent file operations including success rate and performance data',
  })
  @ApiResponse({
    status: 200,
    description: 'File operation metrics retrieved successfully',
    type: FileOperationMetricsResponse,
  })
  @ApiQuery({
    name: 'timeWindow',
    required: false,
    description: 'Time window in milliseconds for failure rate calculation',
    type: Number,
    example: 3600000,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum number of metrics to return',
    type: Number,
    example: 100,
  })
  getFileOperationMetrics(
    @Query('timeWindow', new DefaultValuePipe(3600000), ParseIntPipe)
    timeWindow: number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ): FileOperationMetricsResponse {
    const metrics = FileOperationMonitor.getMetrics(limit);
    const failureRate = FileOperationMonitor.getFailureRate(timeWindow);

    return {
      metrics,
      failureRate,
      timeWindow,
      totalOperations: metrics.length,
    };
  }

  //@ApiTags('Folder Management')
  @Post('folders/:folder/copy')
  @ApiOperation({
    summary: 'Copy a folder to a new location',
    description:
      'Creates a copy of a folder and all its contents at a new location',
  })
  @ApiResponse({
    status: 201,
    description: 'Folder copied successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        sourceFolder: { type: 'string' },
        destinationFolder: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid destination or destination already exists',
  })
  @ApiResponse({
    status: 404,
    description: 'Source folder not found',
  })
  @ApiParam({
    name: 'folder',
    description: 'Source folder name to copy',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['destinationFolder'],
      properties: {
        destinationFolder: {
          type: 'string',
          description:
            'Name of the destination folder where the copy will be created',
        },
      },
    },
  })
  async copyFolder(
    @Param('folder') folder: string,
    @Body('destinationFolder') destinationFolder: string,
  ) {
    return this.fileService.copyFolder(folder, destinationFolder);
  }
}
