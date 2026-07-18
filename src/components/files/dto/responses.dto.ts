import { ApiProperty } from '@nestjs/swagger';

export class FileMetadataResponse {
  @ApiProperty({ example: 'document.pdf', description: 'Name of the file' })
  filename: string;

  @ApiProperty({ example: 1024, description: 'Size of file in bytes' })
  size: number;

  @ApiProperty({
    example: '2024-02-20T10:00:00.000Z',
    description: 'Creation timestamp',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2024-02-20T11:30:00.000Z',
    description: 'Last modification timestamp',
  })
  modifiedAt: Date;
}

export class FolderResponse {
  @ApiProperty({
    example: ['folder1', 'folder2'],
    description: 'List of folder names',
  })
  folders: string[];
}

export class FolderDetailsResponse {
  @ApiProperty({ example: 'documents', description: 'Name of the folder' })
  folder: string;

  @ApiProperty({
    example: ['file1.pdf', 'file2.jpg'],
    description: 'List of files in the folder',
  })
  files: string[];

  @ApiProperty({ example: 100, description: 'Total number of files in folder' })
  totalFiles: number;

  @ApiProperty({ example: 1, description: 'Current page number' })
  page: number;

  @ApiProperty({ example: 10, description: 'Number of items per page' })
  limit: number;
}

export class ShareableLinkResponse {
  @ApiProperty({
    example:
      'https://promoteClients2.glitch.me/folders/docs/files/example.pdf?share=true',
    description: 'Generated shareable link for the file',
  })
  shareableLink: string;
}

export class FileVersionResponse {
  @ApiProperty({
    example: 'document.pdf',
    description: 'Name of the original file',
  })
  filename: string;

  @ApiProperty({
    example: [
      { version: '1', filename: 'document.pdf.v1' },
      { version: '2', filename: 'document.pdf.v2' },
    ],
    description: 'List of available versions',
  })
  versions: Array<{ version: string; filename: string }>;
}

export class FolderTreeResponse {
  @ApiProperty({ example: 'root', description: 'Name of the current node' })
  name: string;

  @ApiProperty({
    example: [{ name: 'folder1', children: [] }, { name: 'file1.pdf' }],
    description: 'Child nodes (folders and files)',
  })
  children: Array<{ name: string; children?: any[] }>;
}

export class ErrorResponse {
  @ApiProperty({ example: 400, description: 'HTTP status code' })
  statusCode: number;

  @ApiProperty({ example: 'File not found', description: 'Error message' })
  message: string;

  @ApiProperty({ example: 'Bad Request', description: 'Error type' })
  error: string;
}

export class JsonFileResponse {
  @ApiProperty({
    example: {
      key: 'value',
      name: 'example',
      age: 30,
      nested: {
        key: 'value',
      },
    },
    description: 'JSON file content',
  })
  content: any;
}

export class JsonValueResponse {
  @ApiProperty({
    example: 'value',
    description: 'Value at the specified path in the JSON file',
  })
  value: any;
}

export class FileOperationMetricDto {
  @ApiProperty({
    example: 'createFolder',
    description: 'Name of the file operation',
  })
  operation: string;

  @ApiProperty({
    example: true,
    description: 'Whether the operation succeeded',
  })
  success: boolean;

  @ApiProperty({
    example: 123,
    description: 'Duration of operation in milliseconds',
  })
  duration: number;

  @ApiProperty({
    example: 1645564789123,
    description: 'Timestamp of the operation',
  })
  timestamp: number;

  @ApiProperty({
    example: '/uploads/docs',
    required: false,
    description: 'Path involved in the operation',
  })
  path?: string;

  @ApiProperty({
    required: false,
    description: 'Error message if operation failed',
  })
  error?: string;
}

export class FileOperationMetricsResponse {
  @ApiProperty({
    type: [FileOperationMetricDto],
    description: 'Recent file operation metrics',
  })
  metrics: FileOperationMetricDto[];

  @ApiProperty({
    example: 0.05,
    description: 'Rate of failed operations in the time window',
  })
  failureRate: number;

  @ApiProperty({ example: 3600000, description: 'Time window in milliseconds' })
  timeWindow: number;

  @ApiProperty({
    example: 100,
    description: 'Total number of operations recorded',
  })
  totalOperations: number;
}
