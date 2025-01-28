import {
    Controller,
    Get,
    Post,
    Put,
    Param,
    Body,
    HttpException,
    HttpStatus,
  } from '@nestjs/common';
  import { NpointService } from './npoint.service';
  import {
    ApiTags,
    ApiOperation,
    ApiParam,
    ApiBody,
    ApiResponse,
  } from '@nestjs/swagger';
  
  @ApiTags('NPoint API') // Group endpoints under "NPoint API" in Swagger UI
  @Controller('npoint')
  export class NpointController {
    constructor(private readonly npointService: NpointService) {}
  
    @Get('documents/:id')
    @ApiOperation({ summary: 'Fetch a document by ID' }) // Description of the endpoint
    @ApiParam({ name: 'id', description: 'The ID of the document to fetch' }) // Document the parameter
    @ApiResponse({
      status: 200,
      description: 'Document fetched successfully',
    })
    @ApiResponse({ status: 404, description: 'Document not found' })
    async fetchDocument(@Param('id') id: string) {
      try {
        return await this.npointService.fetchDocument(id);
      } catch (error) {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
    }
  
    @Post('documents')
    @ApiOperation({ summary: 'Post a new document' })
    @ApiBody({
      description: 'The document to post',
      schema: {
        example: {
          title: 'My Document',
          content: 'This is the content of the document.',
        },
      },
    })
    @ApiResponse({
      status: 201,
      description: 'Document posted successfully',
    })
    @ApiResponse({ status: 400, description: 'Invalid input' })
    async postDocument(@Body() document: any) {
      try {
        return await this.npointService.postDocument(document);
      } catch (error) {
        throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
      }
    }

    @Get('documents')
    @ApiOperation({ summary: 'Fetch all documents' })
    @ApiResponse({
      status: 200,
      description: 'List of all documents fetched successfully',
    })
    @ApiResponse({ status: 500, description: 'Internal server error' })
    async fetchAllDocuments() {
      try {
        return await this.npointService.fetchAllDocuments();
      } catch (error) {
        throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }  
  
    @Put('documents/:id')
    @ApiOperation({ summary: 'Update a document by ID' })
    @ApiParam({ name: 'id', description: 'The ID of the document to update' })
    @ApiBody({
      description: 'The updated document',
      schema: {
        example: {
          title: 'Updated Document',
          content: 'This is the updated content of the document.',
        },
      },
    })
    @ApiResponse({
      status: 200,
      description: 'Document updated successfully',
    })
    @ApiResponse({ status: 404, description: 'Document not found' })
    async updateDocument(@Param('id') id: string, @Body() updatedDocument: any) {
      try {
        return await this.npointService.updateDocument(id, updatedDocument);
      } catch (error) {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
    }
  }