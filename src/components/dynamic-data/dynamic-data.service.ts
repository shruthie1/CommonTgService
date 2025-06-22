import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession } from 'mongoose';
import { DynamicData, DynamicDataDocument } from './dynamic-data.schema';
import { CreateDynamicDataDto } from './dto/create-dynamic-data.dto';
import { UpdateDynamicDataDto, ArrayOperationType } from './dto/update-dynamic-data.dto';
import { get, set, unset, has } from 'lodash';
import { InjectConnection } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';

@Injectable()
export class DynamicDataService {
  constructor(
    @InjectModel(DynamicData.name)
    private dynamicDataModel: Model<DynamicDataDocument>,
    @InjectConnection() private readonly connection: mongoose.Connection,
  ) {}

  async create(createDto: CreateDynamicDataDto): Promise<DynamicData> {
    const session = await this.connection.startSession();
    try {
      await session.startTransaction();

      const exists = await this.dynamicDataModel.findOne({ configKey: createDto.configKey }).session(session);
      if (exists) {
        throw new ConflictException(`Document with configKey ${createDto.configKey} already exists`);
      }

      const created = new this.dynamicDataModel(createDto);
      await created.save({ session });

      await session.commitTransaction();
      return created.toJSON();
    } catch (error) {
      await session.abortTransaction();
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new BadRequestException('Failed to create dynamic data');
    } finally {
      await session.endSession();
    }
  }

  async findOne(configKey: string, path?: string): Promise<any> {
    const doc = await this.dynamicDataModel.findOne({ configKey });
    if (!doc) {
      throw new NotFoundException(`Document with configKey ${configKey} not found`);
    }

    if (path) {
      if (!has(doc.data, path)) {
        throw new NotFoundException(`Path ${path} not found in document`);
      }
      return get(doc.data, path);
    }

    return doc.toJSON().data;
  }

  async update(
    configKey: string,
    updateDto: UpdateDynamicDataDto,
    session?: ClientSession,
  ): Promise<DynamicData> {
    const useSession = session || await this.connection.startSession();
    let shouldEndSession = false;

    try {
      if (!session) {
        shouldEndSession = true;
        await useSession.startTransaction();
      }

      const doc = await this.dynamicDataModel.findOne({ configKey }).session(useSession);
      if (!doc) {
        throw new NotFoundException(`Document with configKey ${configKey} not found`);
      }      if (updateDto.arrayOperation) {
        if (!updateDto.path) {
          throw new BadRequestException('Path is required for array operations');
        }
        await this.handleArrayOperation(doc, updateDto, useSession);
      } else if (updateDto.path) {
        // Path-based update
        if (!has(doc.data, updateDto.path)) {
          throw new NotFoundException(`Path ${updateDto.path} not found in document`);
        }
        set(doc.data, updateDto.path, updateDto.value);
      } else {
        // Full data update
        doc.data = updateDto.value;
      }
      
      await doc.save({ session: useSession });

      if (shouldEndSession) {
        await useSession.commitTransaction();
      }

      return doc.toJSON();
    } catch (error) {
      if (shouldEndSession) {
        await useSession.abortTransaction();
      }
      throw error;
    } finally {
      if (shouldEndSession) {
        await useSession.endSession();
      }
    }
  }

  private async handleArrayOperation(
    doc: DynamicDataDocument,
    updateDto: UpdateDynamicDataDto,
    session: ClientSession,
  ): Promise<void> {
    const array = get(doc.data, updateDto.path);
    if (!Array.isArray(array)) {
      throw new BadRequestException(`Path ${updateDto.path} is not an array`);
    }

    const { type, index } = updateDto.arrayOperation;
    switch (type) {
      case ArrayOperationType.PUSH:
        array.push(updateDto.value);
        break;
      case ArrayOperationType.POP:
        array.pop();
        break;
      case ArrayOperationType.INSERT:
        if (index === undefined || index < 0 || index > array.length) {
          throw new BadRequestException('Invalid array index for INSERT operation');
        }
        array.splice(index, 0, updateDto.value);
        break;
      case ArrayOperationType.REMOVE:
        if (index === undefined || index < 0 || index >= array.length) {
          throw new BadRequestException('Invalid array index for REMOVE operation');
        }
        array.splice(index, 1);
        break;
      case ArrayOperationType.UPDATE:
        if (index === undefined || index < 0 || index >= array.length) {
          throw new BadRequestException('Invalid array index for UPDATE operation');
        }
        array[index] = updateDto.value;
        break;
      default:
        throw new BadRequestException('Invalid array operation type');
    }

    set(doc.data, updateDto.path, array);
    await doc.save({ session });
  }

  async remove(configKey: string, path?: string): Promise<void> {
    const session = await this.connection.startSession();
    try {
      await session.startTransaction();

      const doc = await this.dynamicDataModel.findOne({ configKey }).session(session);
      if (!doc) {
        throw new NotFoundException(`Document with configKey ${configKey} not found`);
      }

      if (path) {
        if (!has(doc.data, path)) {
          throw new NotFoundException(`Path ${path} not found in document`);
        }
        unset(doc.data, path);
        await doc.save({ session });
      } else {
        await this.dynamicDataModel.deleteOne({ configKey }).session(session);
      }

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
