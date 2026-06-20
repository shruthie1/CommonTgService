import { BadRequestException } from '@nestjs/common';
import { UsersController } from '../users.controller';

function makeStub() {
    return {
        create: jest.fn().mockResolvedValue('created'),
        search: jest.fn().mockResolvedValue([]),
        topRelationships: jest.fn().mockResolvedValue('topRel'),
        top: jest.fn().mockResolvedValue('top'),
        leaderboard: jest.fn().mockResolvedValue('lb'),
        summary: jest.fn().mockResolvedValue('summary'),
        paginated: jest.fn().mockResolvedValue('paginated'),
        findAllSorted: jest.fn().mockResolvedValue('all'),
        getUserRelationships: jest.fn().mockResolvedValue('rel'),
        aggregateSort: jest.fn().mockResolvedValue('agg'),
        compositeRank: jest.fn().mockResolvedValue('composite'),
        computeRelationshipScore: jest.fn().mockResolvedValue('computed'),
        findOne: jest.fn().mockResolvedValue('one'),
        update: jest.fn().mockResolvedValue(1),
        toggleStar: jest.fn().mockResolvedValue({ mobile: 'm', starred: true }),
        delete: jest.fn().mockResolvedValue('deleted'),
        executeQuery: jest.fn().mockResolvedValue('queryResult'),
    };
}

describe('UsersController', () => {
    let stub: ReturnType<typeof makeStub>;
    let controller: UsersController;

    beforeEach(() => {
        stub = makeStub();
        controller = new UsersController(stub as any);
    });

    describe('create', () => {
        it('delegates to service.create', async () => {
            const dto = { mobile: '123' } as any;
            await expect(controller.create(dto)).resolves.toBe('created');
            expect(stub.create).toHaveBeenCalledWith(dto);
        });
    });

    describe('search', () => {
        it('delegates with queryParams', async () => {
            const q = { tgId: '1' } as any;
            await expect(controller.search(q)).resolves.toEqual([]);
            expect(stub.search).toHaveBeenCalledWith(q);
        });
    });

    describe('topRelationships', () => {
        it('parses provided params and excludeTwoFA true', async () => {
            await expect(controller.topRelationships('2', '10', '5.5', 'male', 'true')).resolves.toBe('topRel');
            expect(stub.topRelationships).toHaveBeenCalledWith({
                page: 2,
                limit: 10,
                minScore: 5.5,
                gender: 'male',
                excludeTwoFA: true,
            });
        });

        it('handles undefined params and excludeTwoFA not true', async () => {
            await controller.topRelationships(undefined, undefined, undefined, undefined, 'false');
            expect(stub.topRelationships).toHaveBeenCalledWith({
                page: undefined,
                limit: undefined,
                minScore: undefined,
                gender: undefined,
                excludeTwoFA: false,
            });
        });

        it('rejects non-numeric minScore instead of passing NaN into the query', async () => {
            // parseFloat("abc")=NaN flowed into {bestScore:{$gt:NaN}} -> matched nothing ->
            // silently empty leaderboard with no error. Must 400 like the sibling endpoint does.
            await expect(controller.topRelationships(undefined, undefined, 'abc', undefined, undefined))
                .rejects.toThrow(BadRequestException);
            expect(stub.topRelationships).not.toHaveBeenCalled();
        });

        it('rejects non-numeric page', async () => {
            await expect(controller.topRelationships('abc', undefined, undefined, undefined, undefined))
                .rejects.toThrow(BadRequestException);
        });
    });

    describe('getTopInteractionUsers', () => {
        it('happy path with all valid params', async () => {
            await expect(controller.getTopInteractionUsers(
                '2', '50', '1.5', '3', '4', '5', 'true', 'true', 'female', 'true',
            )).resolves.toBe('top');
            expect(stub.top).toHaveBeenCalledWith({
                page: 2,
                limit: 50,
                minScore: 1.5,
                minCalls: 3,
                minPhotos: 4,
                minVideos: 5,
                excludeTwoFA: true,
                excludeAudited: true,
                gender: 'female',
                starred: true,
            });
        });

        it('maps excludeTwoFA false and starred not-true to undefined', async () => {
            await controller.getTopInteractionUsers(
                undefined, undefined, undefined, undefined, undefined, undefined, 'false', 'false', undefined, 'no',
            );
            expect(stub.top).toHaveBeenCalledWith(expect.objectContaining({
                excludeTwoFA: false,
                excludeAudited: false,
                starred: undefined,
            }));
        });

        it('maps excludeTwoFA undefined to undefined', async () => {
            await controller.getTopInteractionUsers();
            expect(stub.top).toHaveBeenCalledWith(expect.objectContaining({
                excludeTwoFA: undefined,
            }));
        });

        it('throws when page < 1', async () => {
            await expect(controller.getTopInteractionUsers('0')).rejects.toThrow(BadRequestException);
        });

        it('throws when page is NaN', async () => {
            await expect(controller.getTopInteractionUsers('abc')).rejects.toThrow('Page must be a positive integer');
        });

        it('throws when limit < 1', async () => {
            await expect(controller.getTopInteractionUsers('1', '0')).rejects.toThrow('Limit must be between 1 and 100');
        });

        it('throws when limit > 100', async () => {
            await expect(controller.getTopInteractionUsers('1', '101')).rejects.toThrow('Limit must be between 1 and 100');
        });

        it('throws when minScore < 0', async () => {
            await expect(controller.getTopInteractionUsers('1', '10', '-1')).rejects.toThrow('minScore must be a non-negative number');
        });

        it('throws when minCalls < 0', async () => {
            await expect(controller.getTopInteractionUsers('1', '10', '1', '-1')).rejects.toThrow('minCalls must be a non-negative integer');
        });

        it('throws when minPhotos < 0', async () => {
            await expect(controller.getTopInteractionUsers('1', '10', '1', '1', '-1')).rejects.toThrow('minPhotos must be a non-negative integer');
        });

        it('throws when minVideos < 0', async () => {
            await expect(controller.getTopInteractionUsers('1', '10', '1', '1', '1', '-1')).rejects.toThrow('minVideos must be a non-negative integer');
        });
    });

    describe('leaderboard', () => {
        it('throws when aspect missing', async () => {
            await expect(controller.leaderboard(undefined as any)).rejects.toThrow('aspect query parameter is required');
        });

        it('delegates with limit', async () => {
            await expect(controller.leaderboard('msgs', '10')).resolves.toBe('lb');
            expect(stub.leaderboard).toHaveBeenCalledWith({ aspect: 'msgs', limit: 10 });
        });

        it('delegates without limit', async () => {
            await expect(controller.leaderboard('msgs')).resolves.toBe('lb');
            expect(stub.leaderboard).toHaveBeenCalledWith({ aspect: 'msgs', limit: undefined });
        });
    });

    describe('summary', () => {
        it('delegates', async () => {
            await expect(controller.summary()).resolves.toBe('summary');
            expect(stub.summary).toHaveBeenCalled();
        });
    });

    describe('paginated', () => {
        it('parses params with sortOrder asc', async () => {
            await expect(controller.paginated('2', '20', 'msgs', 'asc', 'foo', 'active')).resolves.toBe('paginated');
            expect(stub.paginated).toHaveBeenCalledWith({
                page: 2,
                limit: 20,
                sortBy: 'msgs',
                sortOrder: 'asc',
                search: 'foo',
                filter: 'active',
            });
        });

        it('defaults sortOrder to desc and undefined fields when empty', async () => {
            await controller.paginated(undefined, undefined, '', 'something', '', '');
            expect(stub.paginated).toHaveBeenCalledWith({
                page: undefined,
                limit: undefined,
                sortBy: undefined,
                sortOrder: 'desc',
                search: undefined,
                filter: undefined,
            });
        });
    });

    describe('findAll', () => {
        it('uses default limit 100 and skip 0, sort undefined', async () => {
            await expect(controller.findAll()).resolves.toBe('all');
            expect(stub.findAllSorted).toHaveBeenCalledWith(100, 0, undefined);
        });

        it('builds sort asc when sortBy provided with asc', async () => {
            await expect(controller.findAll('10', '5', 'msgs', 'asc')).resolves.toBe('all');
            expect(stub.findAllSorted).toHaveBeenCalledWith(10, 5, { msgs: 1 });
        });

        it('builds sort desc when sortOrder not asc', async () => {
            await expect(controller.findAll('10', '5', 'msgs', 'desc')).resolves.toBe('all');
            expect(stub.findAllSorted).toHaveBeenCalledWith(10, 5, { msgs: -1 });
        });

        it('throws on invalid limit (NaN)', async () => {
            await expect(controller.findAll('abc')).rejects.toThrow('Limit must be a positive integer');
        });

        it('throws on limit < 1', async () => {
            await expect(controller.findAll('0')).rejects.toThrow('Limit must be a positive integer');
        });

        it('throws on skip < 0', async () => {
            await expect(controller.findAll('10', '-1')).rejects.toThrow('Skip must be a non-negative integer');
        });
    });

    describe('getUserRelationships', () => {
        it('delegates', async () => {
            await expect(controller.getUserRelationships('999')).resolves.toBe('rel');
            expect(stub.getUserRelationships).toHaveBeenCalledWith('999');
        });
    });

    describe('aggregateSort (GET)', () => {
        it('throws when field missing', async () => {
            await expect(controller.aggregateSort(undefined as any)).rejects.toThrow('field is required');
        });

        it('delegates with defaults and desc order', async () => {
            await expect(controller.aggregateSort('intimateTotal')).resolves.toBe('agg');
            expect(stub.aggregateSort).toHaveBeenCalledWith('intimateTotal', -1, 20, 0);
        });

        it('uses asc order and parsed limit/skip', async () => {
            await expect(controller.aggregateSort('intimateTotal', 'asc', '5', '2')).resolves.toBe('agg');
            expect(stub.aggregateSort).toHaveBeenCalledWith('intimateTotal', 1, 5, 2);
        });

        it('throws when limit non-numeric', async () => {
            await expect(controller.aggregateSort('intimateTotal', 'desc', 'abc')).rejects.toThrow('Limit must be a positive integer');
        });

        it('throws when limit negative', async () => {
            await expect(controller.aggregateSort('intimateTotal', 'desc', '-5')).rejects.toThrow('Limit must be a positive integer');
        });

        it('throws when skip non-numeric', async () => {
            await expect(controller.aggregateSort('intimateTotal', 'desc', '10', 'abc')).rejects.toThrow('Skip must be a non-negative integer');
        });

        it('throws when skip negative', async () => {
            await expect(controller.aggregateSort('intimateTotal', 'desc', '10', '-3')).rejects.toThrow('Skip must be a non-negative integer');
        });
    });

    describe('aggregateSortQuery (POST)', () => {
        it('throws when requestBody undefined (field missing)', async () => {
            await expect(controller.aggregateSortQuery(undefined as any)).rejects.toThrow('field is required');
        });

        it('throws when field missing', async () => {
            await expect(controller.aggregateSortQuery({})).rejects.toThrow('field is required');
        });

        it('throws when limit not integer', async () => {
            await expect(controller.aggregateSortQuery({ field: 'f', limit: 1.5 })).rejects.toThrow('Limit must be a positive integer');
        });

        it('throws when limit < 1', async () => {
            await expect(controller.aggregateSortQuery({ field: 'f', limit: 0 })).rejects.toThrow('Limit must be a positive integer');
        });

        it('throws when skip not integer', async () => {
            await expect(controller.aggregateSortQuery({ field: 'f', skip: 1.2 })).rejects.toThrow('Skip must be a non-negative integer');
        });

        it('throws when skip < 0', async () => {
            await expect(controller.aggregateSortQuery({ field: 'f', skip: -1 })).rejects.toThrow('Skip must be a non-negative integer');
        });

        it('delegates with asc order and query passthrough', async () => {
            await expect(controller.aggregateSortQuery({ field: 'f', sortOrder: 'asc', query: { a: 1 }, limit: 5, skip: 2 })).resolves.toBe('agg');
            expect(stub.aggregateSort).toHaveBeenCalledWith('f', 1, 5, 2, { a: 1 });
        });

        it('defaults order desc and limit/skip when undefined', async () => {
            await expect(controller.aggregateSortQuery({ field: 'f' })).resolves.toBe('agg');
            expect(stub.aggregateSort).toHaveBeenCalledWith('f', -1, 20, 0, {});
        });
    });

    describe('compositeRank (POST)', () => {
        it('throws when requestBody undefined (signals missing)', async () => {
            await expect(controller.compositeRank(undefined as any)).rejects.toThrow('signals must be a non-empty array');
        });

        it('throws when signals not array', async () => {
            await expect(controller.compositeRank({ signals: 'x' as any })).rejects.toThrow('signals must be a non-empty array');
        });

        it('throws when signals empty', async () => {
            await expect(controller.compositeRank({ signals: [] })).rejects.toThrow('signals must be a non-empty array');
        });

        it('throws when cleanedSignals empty (no field)', async () => {
            await expect(controller.compositeRank({ signals: [{}] })).rejects.toThrow('signals must each have a field');
        });

        it('throws when limit invalid', async () => {
            await expect(controller.compositeRank({ signals: [{ field: 'msgs' }], limit: 0 })).rejects.toThrow('Limit must be a positive integer');
        });

        it('throws when skip invalid', async () => {
            await expect(controller.compositeRank({ signals: [{ field: 'msgs' }], skip: -1 })).rejects.toThrow('Skip must be a non-negative integer');
        });

        it('delegates cleanedSignals with query', async () => {
            await expect(controller.compositeRank({
                signals: [{ field: 'msgs', weight: 2 }, {} as any],
                query: { starred: true },
                limit: 10,
                skip: 5,
            })).resolves.toBe('composite');
            expect(stub.compositeRank).toHaveBeenCalledWith(
                [{ field: 'msgs', weight: 2 }],
                10,
                5,
                { starred: true },
            );
        });
    });

    describe('recomputeScore', () => {
        it('computes then returns relationships', async () => {
            await expect(controller.recomputeScore('555')).resolves.toBe('rel');
            expect(stub.computeRelationshipScore).toHaveBeenCalledWith('555');
            expect(stub.getUserRelationships).toHaveBeenCalledWith('555');
        });
    });

    describe('findOne', () => {
        it('delegates', async () => {
            await expect(controller.findOne('77')).resolves.toBe('one');
            expect(stub.findOne).toHaveBeenCalledWith('77');
        });
    });

    describe('update', () => {
        it('delegates', async () => {
            const dto = { firstName: 'x' } as any;
            await expect(controller.update('77', dto)).resolves.toBe(1);
            expect(stub.update).toHaveBeenCalledWith('77', dto);
        });
    });

    describe('toggleStar', () => {
        it('delegates', async () => {
            await expect(controller.toggleStar('m1')).resolves.toEqual({ mobile: 'm', starred: true });
            expect(stub.toggleStar).toHaveBeenCalledWith('m1');
        });
    });

    describe('expire', () => {
        it('calls service.delete', async () => {
            await expect(controller.expire('id1')).resolves.toBe('deleted');
            expect(stub.delete).toHaveBeenCalledWith('id1');
        });
    });

    describe('executeQuery', () => {
        it('destructures and delegates', async () => {
            const body = { query: { a: 1 }, sort: { b: -1 }, limit: 10, skip: 2 } as any;
            await expect(controller.executeQuery(body)).resolves.toBe('queryResult');
            expect(stub.executeQuery).toHaveBeenCalledWith({ a: 1 }, { b: -1 }, 10, 2);
        });
    });
});
