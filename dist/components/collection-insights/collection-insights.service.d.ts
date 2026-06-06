import { Connection } from 'mongoose';
import { CollectionQueryDto } from './dto/collection-query.dto';
type MongoFilter = Record<string, unknown>;
type MongoSort = Record<string, 1 | -1>;
export declare class CollectionInsightsService {
    private readonly connection;
    constructor(connection: Connection);
    listCollections(): Promise<{
        collections: {
            name: string;
            estimatedCount: number;
        }[];
    }>;
    readCollection(collectionName: string, options?: CollectionQueryDto): Promise<{
        collection: string;
        filter: MongoFilter;
        sort: MongoSort;
        limit: number;
        skip: number;
        returned: number;
        documents: import("mongodb").WithId<import("bson").Document>[];
    }>;
    getCollectionStats(collectionName: string): Promise<{
        collection: string;
        estimatedCount: number;
        indexes: any[] | import("mongodb").IndexDescriptionInfo[];
        storage: {
            count: any;
            size: any;
            avgObjSize: any;
            storageSize: any;
            totalIndexSize: any;
        };
    }>;
    getCollectionAnalytics(collectionName: string, sampleSizeInput?: number | string): Promise<{
        collection: string;
        estimatedCount: number;
        sampleSize: number;
        fields: {
            field: string;
            present: number;
            coverage: number;
            types: Record<string, number>;
            numeric: {
                count: number;
                min: number;
                max: number;
                avg: number;
            };
            boolean: {
                true: number;
                false: number;
            };
            array: {
                count: number;
                avgLength: number;
            };
        }[];
    }>;
    private getCollection;
    private getCollectionNames;
    private normalizeCollectionName;
    private normalizeFilter;
    private normalizeProjection;
    private normalizeSort;
    private parseObject;
    private assertSafeQueryObject;
    private assertSafeFieldName;
    private normalizePositiveInt;
    private normalizeNonNegativeInt;
    private safeEstimatedCount;
    private safeCollStats;
    private computeFieldAnalytics;
    private createEmptyFieldStats;
    private flattenDocument;
    private valueType;
    private isPlainObject;
}
export {};
