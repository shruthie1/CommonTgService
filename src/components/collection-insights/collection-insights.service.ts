import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { CollectionQueryDto } from './dto/collection-query.dto';

type MongoFilter = Record<string, unknown>;
type MongoProjection = Record<string, 0 | 1 | boolean>;
type MongoSort = Record<string, 1 | -1>;
interface FieldStats {
    field: string;
    present: number;
    types: Record<string, number>;
    numeric: { count: number; min: number | null; max: number | null; sum: number };
    boolean: { true: number; false: number };
    array: { count: number; totalLength: number };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const DEFAULT_ANALYTICS_SAMPLE_SIZE = 500;
const MAX_ANALYTICS_SAMPLE_SIZE = 1000;
const SAFE_OPERATORS = new Set([
    '$and',
    '$or',
    '$nor',
    '$eq',
    '$ne',
    '$gt',
    '$gte',
    '$lt',
    '$lte',
    '$in',
    '$nin',
    '$exists',
    '$regex',
    '$options',
    '$elemMatch',
]);

@Injectable()
export class CollectionInsightsService {
    constructor(@InjectConnection() private readonly connection: Connection) {}

    async listCollections() {
        const names = await this.getCollectionNames();
        const collections = await Promise.all(names.map(async (name) => ({
            name,
            estimatedCount: await this.safeEstimatedCount(name),
        })));
        return { collections };
    }

    async readCollection(collectionName: string, options: CollectionQueryDto = {}) {
        const collection = await this.getCollection(collectionName);
        const filter = this.normalizeFilter(options.filter);
        const projection = this.normalizeProjection(options.projection);
        const sort = this.normalizeSort(options.sort, options.sortBy, options.sortOrder);
        const limit = this.normalizePositiveInt(options.limit, DEFAULT_LIMIT, MAX_LIMIT);
        const skip = this.normalizeNonNegativeInt(options.skip, 0);

        const cursor = collection.find(filter, projection ? { projection } : undefined);
        if (Object.keys(sort).length > 0) cursor.sort(sort);
        if (skip > 0) cursor.skip(skip);
        cursor.limit(limit);

        const documents = await cursor.toArray();
        return {
            collection: collection.collectionName,
            filter,
            sort,
            limit,
            skip,
            returned: documents.length,
            documents,
        };
    }

    async getCollectionStats(collectionName: string) {
        const collection = await this.getCollection(collectionName);
        const [estimatedCount, indexes, collStats] = await Promise.all([
            this.safeEstimatedCount(collection.collectionName),
            collection.indexes().catch(() => []),
            this.safeCollStats(collection.collectionName),
        ]);

        return {
            collection: collection.collectionName,
            estimatedCount,
            indexes,
            storage: collStats ? {
                count: collStats.count,
                size: collStats.size,
                avgObjSize: collStats.avgObjSize,
                storageSize: collStats.storageSize,
                totalIndexSize: collStats.totalIndexSize,
            } : null,
        };
    }

    async getCollectionAnalytics(collectionName: string, sampleSizeInput?: number | string) {
        const collection = await this.getCollection(collectionName);
        const sampleSize = this.normalizePositiveInt(sampleSizeInput, DEFAULT_ANALYTICS_SAMPLE_SIZE, MAX_ANALYTICS_SAMPLE_SIZE);
        const [estimatedCount, sample] = await Promise.all([
            this.safeEstimatedCount(collection.collectionName),
            collection.find({}).limit(sampleSize).toArray(),
        ]);

        return {
            collection: collection.collectionName,
            estimatedCount,
            sampleSize: sample.length,
            fields: this.computeFieldAnalytics(sample),
        };
    }

    private async getCollection(collectionName: string) {
        const name = this.normalizeCollectionName(collectionName);
        const names = await this.getCollectionNames();
        if (!names.includes(name)) {
            throw new NotFoundException(`Collection "${name}" not found`);
        }
        return this.connection.db.collection(name);
    }

    private async getCollectionNames(): Promise<string[]> {
        if (!this.connection.db) throw new BadRequestException('MongoDB connection is not ready');
        const collections = await this.connection.db.listCollections({}, { nameOnly: true }).toArray();
        return collections
            .map((item) => item.name)
            .filter((name) => typeof name === 'string' && name.length > 0 && !name.startsWith('system.'))
            .sort((a, b) => a.localeCompare(b));
    }

    private normalizeCollectionName(input: unknown): string {
        const name = String(input || '').trim();
        if (!/^[A-Za-z0-9_.-]+$/.test(name) || name.startsWith('system.')) {
            throw new BadRequestException('Invalid collection name');
        }
        return name;
    }

    private normalizeFilter(input: unknown): MongoFilter {
        const filter = this.parseObject(input, 'filter');
        this.assertSafeQueryObject(filter);
        return filter;
    }

    private normalizeProjection(input: unknown): MongoProjection | null {
        const projection = this.parseObject(input, 'projection');
        if (Object.keys(projection).length === 0) return null;
        for (const [key, value] of Object.entries(projection)) {
            this.assertSafeFieldName(key, 'projection');
            if (![0, 1, true, false].includes(value as 0 | 1 | boolean)) {
                throw new BadRequestException('projection values must be 0, 1, true, or false');
            }
        }
        return projection as MongoProjection;
    }

    private normalizeSort(sortInput: unknown, sortByInput?: unknown, sortOrderInput?: unknown): MongoSort {
        const sort = this.parseObject(sortInput, 'sort');
        if (Object.keys(sort).length > 0) {
            const normalized: MongoSort = {};
            for (const [key, value] of Object.entries(sort)) {
                this.assertSafeFieldName(key, 'sort');
                normalized[key] = value === -1 || value === 'desc' ? -1 : 1;
            }
            return normalized;
        }

        if (sortByInput === undefined || sortByInput === null || String(sortByInput).trim() === '') return {};
        const sortBy = String(sortByInput).trim();
        this.assertSafeFieldName(sortBy, 'sortBy');
        return { [sortBy]: sortOrderInput === 'asc' ? 1 : -1 };
    }

    private parseObject(input: unknown, field: string): MongoFilter {
        if (input === undefined || input === null || input === '') return {};
        if (typeof input === 'string') {
            try {
                const parsed = JSON.parse(input);
                if (this.isPlainObject(parsed)) return parsed;
            } catch {
                throw new BadRequestException(`${field} must be valid JSON`);
            }
            throw new BadRequestException(`${field} must be an object`);
        }
        if (this.isPlainObject(input)) return input as MongoFilter;
        throw new BadRequestException(`${field} must be an object`);
    }

    private assertSafeQueryObject(input: unknown): void {
        if (Array.isArray(input)) {
            input.forEach((item) => this.assertSafeQueryObject(item));
            return;
        }
        if (!this.isPlainObject(input)) return;
        for (const [key, value] of Object.entries(input)) {
            if (key.startsWith('$') && !SAFE_OPERATORS.has(key)) {
                throw new BadRequestException(`Unsupported query operator: ${key}`);
            }
            if (!key.startsWith('$')) {
                this.assertSafeFieldName(key, 'filter');
            }
            this.assertSafeQueryObject(value);
        }
    }

    private assertSafeFieldName(field: string, context: string): void {
        if (!field || field.includes('\0') || field.includes('$') || !/^[A-Za-z0-9_.-]+$/.test(field)) {
            throw new BadRequestException(`Invalid ${context} field: ${field}`);
        }
    }

    private normalizePositiveInt(input: unknown, fallback: number, max: number): number {
        const parsed = Number(input);
        if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
        return Math.min(Math.floor(parsed), max);
    }

    private normalizeNonNegativeInt(input: unknown, fallback: number): number {
        const parsed = Number(input);
        if (!Number.isFinite(parsed) || parsed < 0) return fallback;
        return Math.floor(parsed);
    }

    private async safeEstimatedCount(collectionName: string): Promise<number | null> {
        try {
            return await this.connection.db.collection(collectionName).estimatedDocumentCount();
        } catch {
            return null;
        }
    }

    private async safeCollStats(collectionName: string): Promise<Record<string, any> | null> {
        try {
            return await this.connection.db.command({ collStats: collectionName });
        } catch {
            return null;
        }
    }

    private computeFieldAnalytics(documents: Record<string, unknown>[]) {
        const fields = new Map<string, FieldStats>();
        for (const document of documents) {
            const flattened = this.flattenDocument(document);
            for (const [field, value] of Object.entries(flattened)) {
                if (field === '_id') continue;
                const stats = fields.get(field) ?? this.createEmptyFieldStats(field);
                fields.set(field, stats);
                stats.present += 1;
                const type = this.valueType(value);
                stats.types[type] = (stats.types[type] ?? 0) + 1;
                if (typeof value === 'number' && Number.isFinite(value)) {
                    stats.numeric.count += 1;
                    stats.numeric.min = stats.numeric.min === null ? value : Math.min(stats.numeric.min, value);
                    stats.numeric.max = stats.numeric.max === null ? value : Math.max(stats.numeric.max, value);
                    stats.numeric.sum += value;
                } else if (typeof value === 'boolean') {
                    if (value) stats.boolean.true += 1;
                    else stats.boolean.false += 1;
                } else if (Array.isArray(value)) {
                    stats.array.count += 1;
                    stats.array.totalLength += value.length;
                }
            }
        }

        return Array.from(fields.values())
            .map((stats) => ({
                field: stats.field,
                present: stats.present,
                coverage: documents.length > 0 ? stats.present / documents.length : 0,
                types: stats.types,
                numeric: stats.numeric.count > 0 ? {
                    count: stats.numeric.count,
                    min: stats.numeric.min,
                    max: stats.numeric.max,
                    avg: stats.numeric.sum / stats.numeric.count,
                } : undefined,
                boolean: stats.boolean.true + stats.boolean.false > 0 ? stats.boolean : undefined,
                array: stats.array.count > 0 ? {
                    count: stats.array.count,
                    avgLength: stats.array.totalLength / stats.array.count,
                } : undefined,
            }))
            .sort((a, b) => b.present - a.present || a.field.localeCompare(b.field));
    }

    private createEmptyFieldStats(field: string): FieldStats {
        return {
            field,
            present: 0,
            types: {} as Record<string, number>,
            numeric: { count: 0, min: null as number | null, max: null as number | null, sum: 0 },
            boolean: { true: 0, false: 0 },
            array: { count: 0, totalLength: 0 },
        };
    }

    private flattenDocument(document: Record<string, unknown>, prefix = '', output: Record<string, unknown> = {}) {
        for (const [key, value] of Object.entries(document)) {
            const path = prefix ? `${prefix}.${key}` : key;
            if (this.isPlainObject(value) && !(value instanceof Date)) {
                this.flattenDocument(value as Record<string, unknown>, path, output);
            } else {
                output[path] = value;
            }
        }
        return output;
    }

    private valueType(value: unknown): string {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        if (value instanceof Date) return 'date';
        return typeof value;
    }

    private isPlainObject(input: unknown): input is Record<string, unknown> {
        return input !== null && typeof input === 'object' && !Array.isArray(input) && !(input instanceof Date);
    }
}
