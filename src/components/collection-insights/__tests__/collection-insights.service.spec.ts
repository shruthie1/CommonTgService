import { BadRequestException } from '@nestjs/common';
import { CollectionInsightsService } from '../collection-insights.service';

function makeCursor(documents: any[]) {
    return {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn(async () => documents),
    };
}

function makeConnection(documents: any[] = [{ chatId: '1', totalCount: 2 }]) {
    const cursor = makeCursor(documents);
    const collection = {
        collectionName: 'userData',
        find: jest.fn(() => cursor),
        estimatedDocumentCount: jest.fn(async () => documents.length),
        indexes: jest.fn(async () => [{ name: '_id_' }]),
    };
    return {
        cursor,
        collection,
        connection: {
            db: {
                listCollections: jest.fn(() => ({ toArray: jest.fn(async () => [{ name: 'userData' }]) })),
                collection: jest.fn(() => collection),
                command: jest.fn(async () => ({ count: documents.length, size: 100 })),
            },
        } as any,
    };
}

describe('CollectionInsightsService', () => {
    test('lists existing non-system collections with estimated counts', async () => {
        const { connection } = makeConnection();
        connection.db.listCollections = jest.fn(() => ({
            toArray: jest.fn(async () => [{ name: 'system.profile' }, { name: 'userData' }]),
        }));
        const service = new CollectionInsightsService(connection);

        await expect(service.listCollections()).resolves.toEqual({
            collections: [{ name: 'userData', estimatedCount: 1 }],
        });
    });

    test('rejects dangerous query operators', async () => {
        const { connection } = makeConnection();
        const service = new CollectionInsightsService(connection);

        await expect(service.readCollection('userData', {
            filter: { $where: 'return true' } as any,
        })).rejects.toBeInstanceOf(BadRequestException);
    });

    test('reads documents with capped limit and validated sort field', async () => {
        const { connection, collection, cursor } = makeConnection();
        const service = new CollectionInsightsService(connection);

        const result = await service.readCollection('userData', {
            filter: JSON.stringify({ totalCount: { $gte: 1 } }),
            sortBy: 'totalCount',
            sortOrder: 'desc',
            limit: '9999',
        });

        expect(collection.find).toHaveBeenCalledWith({ totalCount: { $gte: 1 } }, undefined);
        expect(cursor.sort).toHaveBeenCalledWith({ totalCount: -1 });
        expect(cursor.limit).toHaveBeenCalledWith(500);
        expect(result.returned).toBe(1);
    });

    test('returns field analytics from a bounded sample', async () => {
        const { connection } = makeConnection([{ chatId: '1', totalCount: 2, paidReply: true }]);
        const service = new CollectionInsightsService(connection);

        const result = await service.getCollectionAnalytics('userData', 20);

        expect(result.fields).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'chatId', present: 1 }),
            expect.objectContaining({
                field: 'totalCount',
                numeric: expect.objectContaining({ count: 1, min: 2, max: 2, avg: 2 }),
            }),
            expect.objectContaining({
                field: 'paidReply',
                boolean: { true: 1, false: 0 },
            }),
        ]));
    });
});
