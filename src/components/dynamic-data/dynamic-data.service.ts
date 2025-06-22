import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession } from 'mongoose';
import { DynamicData, DynamicDataDocument } from './dynamic-data.schema';
import { CreateDynamicDataDto } from './dto/create-dynamic-data.dto';
import { UpdateDynamicDataDto, ArrayOperationType } from './dto/update-dynamic-data.dto';
import { get, set, unset, has } from 'lodash';
import { InjectConnection } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { parseError } from '../../utils';

@Injectable()
export class DynamicDataService {
    private readonly logger = new Logger(DynamicDataService.name);

    constructor(
        @InjectModel(DynamicData.name)
        private dynamicDataModel: Model<DynamicDataDocument>,
        @InjectConnection() private readonly connection: mongoose.Connection,
    ) {}

    async create(createDto: CreateDynamicDataDto): Promise<DynamicData> {
        this.logger.debug(`Creating dynamic data with configKey: ${createDto.configKey}`);
        const session = await this.connection.startSession();
        try {
            await session.startTransaction();
            this.logger.debug('Started transaction for create operation');

            const exists = await this.dynamicDataModel.findOne({ configKey: createDto.configKey }).session(session);
            if (exists) {
                this.logger.warn(`Attempted to create duplicate configKey: ${createDto.configKey}`);
                throw new ConflictException(`Document with configKey ${createDto.configKey} already exists`);
            }

            const created = new this.dynamicDataModel(createDto);
            await created.save({ session });
            this.logger.debug(`Successfully created dynamic data for configKey: ${createDto.configKey}`);

            await session.commitTransaction();
            this.logger.debug('Transaction committed successfully');
            return created.toJSON().data;
        } catch (error) {
            await session.abortTransaction();
            parseError(error, 'Failed to create dynamic data: ', true);
            this.logger.error(`Failed to create dynamic data: ${error.message}`, error.stack);
            if (error instanceof ConflictException) {
                throw error;
            }
            throw new BadRequestException('Failed to create dynamic data');
        } finally {
            await session.endSession();
        }
    }

    async findOne(configKey: string, path?: string): Promise<any> {
        this.logger.debug(`Finding dynamic data with configKey: ${configKey}${path ? `, path: ${path}` : ''}`);
        const doc = await this.dynamicDataModel.findOne({ configKey });
        if (!doc) {
            this.logger.warn(`Document not found with configKey: ${configKey}`);
            throw new NotFoundException(`Document with configKey ${configKey} not found`);
        }

        if (path) {
            if (!has(doc.data, path)) {
                this.logger.warn(`Path ${path} not found in document with configKey: ${configKey}`);
                throw new NotFoundException(`Path ${path} not found in document`);
            }
            this.logger.debug(`Successfully retrieved data at path: ${path}`);
            return get(doc.data, path);
        }

        this.logger.debug(`Successfully retrieved full document for configKey: ${configKey}`);
        return doc.toJSON().data;
    }

    async update(
        configKey: string,
        updateDto: UpdateDynamicDataDto,
        session?: ClientSession,
    ): Promise<DynamicData> {
        this.logger.debug(`Updating dynamic data for configKey: ${configKey}`);
        const useSession = session || await this.connection.startSession();
        let shouldEndSession = false;

        try {
            if (!session) {
                shouldEndSession = true;
                await useSession.startTransaction();
                this.logger.debug('Started new transaction for update operation');
            }

            const doc = await this.dynamicDataModel.findOne({ configKey }).session(useSession);
            if (!doc) {
                this.logger.warn(`Document not found with configKey: ${configKey}`);
                throw new NotFoundException(`Document with configKey ${configKey} not found`);
            }

            if (updateDto.arrayOperation) {
                if (!updateDto.path) {
                    this.logger.error('Attempted array operation without specifying path');
                    throw new BadRequestException('Path is required for array operations');
                }
                this.logger.debug(`Performing array operation: ${updateDto.arrayOperation.type} on path: ${updateDto.path}`);
                await this.handleArrayOperation(doc, updateDto, useSession);
            } else if (updateDto.path) {
                if (!has(doc.data, updateDto.path)) {
                    this.logger.warn(`Path ${updateDto.path} not found in document with configKey: ${configKey}`);
                    throw new NotFoundException(`Path ${updateDto.path} not found in document`);
                }
                this.logger.debug(`Updating value at path: ${updateDto.path}`);
                set(doc.data, updateDto.path, updateDto.value);
            } else {
                this.logger.debug('Performing full data update');
                doc.data = updateDto.value;
            }

            await doc.save({ session: useSession });
            this.logger.debug(`Successfully updated document with configKey: ${configKey}`);

            if (shouldEndSession) {
                await useSession.commitTransaction();
                this.logger.debug('Transaction committed successfully');
            }

            return doc.toJSON();
        } catch (error) {
            if (shouldEndSession) {
                await useSession.abortTransaction();
                this.logger.error('Transaction aborted due to error');
            }
            parseError(error, 'Failed to update dynamic data: ', true);
            this.logger.error(`Failed to update dynamic data: ${error.message}`, error.stack);
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
        this.logger.debug(`Handling array operation: ${updateDto.arrayOperation.type} at path: ${updateDto.path}`);
        const array = get(doc.data, updateDto.path);
        if (!Array.isArray(array)) {
            this.logger.error(`Path ${updateDto.path} is not an array`);
            throw new BadRequestException(`Path ${updateDto.path} is not an array`);
        }

        const { type, index } = updateDto.arrayOperation;
        try {
            switch (type) {
                case ArrayOperationType.PUSH:
                    this.logger.debug(`Pushing new value to array at path: ${updateDto.path}`);
                    array.push(updateDto.value);
                    break;
                case ArrayOperationType.POP:
                    this.logger.debug(`Popping value from array at path: ${updateDto.path}`);
                    array.pop();
                    break;
                case ArrayOperationType.INSERT:
                    if (index === undefined || index < 0 || index > array.length) {
                        this.logger.error(`Invalid index ${index} for INSERT operation`);
                        throw new BadRequestException('Invalid array index for INSERT operation');
                    }
                    this.logger.debug(`Inserting value at index ${index} in array at path: ${updateDto.path}`);
                    array.splice(index, 0, updateDto.value);
                    break;
                case ArrayOperationType.REMOVE:
                    if (index === undefined || index < 0 || index >= array.length) {
                        this.logger.error(`Invalid index ${index} for REMOVE operation`);
                        throw new BadRequestException('Invalid array index for REMOVE operation');
                    }
                    this.logger.debug(`Removing value at index ${index} from array at path: ${updateDto.path}`);
                    array.splice(index, 1);
                    break;
                case ArrayOperationType.UPDATE:
                    if (index === undefined || index < 0 || index >= array.length) {
                        this.logger.error(`Invalid index ${index} for UPDATE operation`);
                        throw new BadRequestException('Invalid array index for UPDATE operation');
                    }
                    this.logger.debug(`Updating value at index ${index} in array at path: ${updateDto.path}`);
                    array[index] = updateDto.value;
                    break;
                default:
                    this.logger.error(`Invalid array operation type: ${type}`);
                    throw new BadRequestException('Invalid array operation type');
            }

            set(doc.data, updateDto.path, array);
            await doc.save({ session });
            this.logger.debug('Array operation completed successfully');
        } catch (error) {
            this.logger.error(`Array operation failed: ${error.message}`, error.stack);
            throw error;
        }
    }

    async remove(configKey: string, path?: string): Promise<void> {
        this.logger.debug(`Removing dynamic data for configKey: ${configKey}${path ? `, path: ${path}` : ''}`);
        const session = await this.connection.startSession();
        try {
            await session.startTransaction();
            this.logger.debug('Started transaction for remove operation');

            const doc = await this.dynamicDataModel.findOne({ configKey }).session(session);
            if (!doc) {
                this.logger.warn(`Document not found with configKey: ${configKey}`);
                throw new NotFoundException(`Document with configKey ${configKey} not found`);
            }

            if (path) {
                if (!has(doc.data, path)) {
                    this.logger.warn(`Path ${path} not found in document with configKey: ${configKey}`);
                    throw new NotFoundException(`Path ${path} not found in document`);
                }
                this.logger.debug(`Removing data at path: ${path}`);
                unset(doc.data, path);
                await doc.save({ session });
            } else {
                this.logger.debug(`Deleting entire document with configKey: ${configKey}`);
                await this.dynamicDataModel.deleteOne({ configKey }).session(session);
            }

            await session.commitTransaction();
            this.logger.debug('Transaction committed successfully');
        } catch (error) {
            await session.abortTransaction();
            parseError(error, 'Failed to remove dynamic data: ', true);
            this.logger.error(`Failed to remove dynamic data: ${error.message}`, error.stack);
            throw error;
        } finally {
            await session.endSession();
        }
    }
}
