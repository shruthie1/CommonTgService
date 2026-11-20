import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateStat2Dto } from './create-stat2.dto';
import { UpdateStat2Dto } from './update-stat2.dto';
import { Stat2, Stat2Document } from './stat2.schema';

/**
 * Single-row reads and writes match the full row key {chatId, profile, client} (unique index
 * chatId_1_profile_1_client_1). Two sibling clients share a persona, so {chatId, profile} alone could
 * read, update or delete the other client's row (stats2 audit A4, 2026-11-20).
 */
@Injectable()
export class Stat2Service {
  private readonly logger = new Logger(Stat2Service.name);

  constructor(@InjectModel("Stats2Module") private statModel: Model<Stat2Document>) {}

  /**
   * stats2.payAmount is PAID TODAY: only tg-aut's credit path (markDailyPaid) raises it, and nothing lowers it
   * within the day (owner 2026-11-20). The HTTP routes may create a row with 0 and never set it afterwards.
   * The global ValidationPipe does not whitelist (src/main.ts), so a body can carry anything, update operators
   * included: each write is built from the named DTO fields only, and a `$` key is refused (Codex r2).
   */
  private static readonly WRITABLE = [
    'chatId', 'count', 'demoGiven', 'demoGivenToday', 'newUser', 'paidReply', 'name', 'secondShow',
    'client', 'profile', 'paymentAttributionCreditedAt',
  ] as const;

  private writableFields(op: 'create' | 'update', dto: Record<string, unknown> | undefined): Record<string, unknown> {
    const body = dto ?? {};
    const operator = Object.keys(body).find((key) => key.startsWith('$'));
    if (operator) {
      this.logger.warn(`stats2-payamount kind=cms-write-refused op=${op} reason=operator`);
      throw new BadRequestException(`update operators are not accepted (${operator})`);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'payAmount') && !(op === 'create' && Number(body.payAmount) === 0)) {
      this.logger.warn(`stats2-payamount kind=cms-write-refused op=${op}`);
      throw new BadRequestException('stats2.payAmount is paid-today and is set only by a credit');
    }
    const fields: Record<string, unknown> = {};
    for (const key of Stat2Service.WRITABLE) {
      if (body[key] !== undefined) fields[key] = body[key];
    }
    return fields;
  }

  async create(createStatDto: CreateStat2Dto): Promise<Stat2> {
    const fields = this.writableFields('create', createStatDto as unknown as Record<string, unknown>);
    const createdStat = new this.statModel({ ...fields, payAmount: 0 });
    return createdStat.save();
  }

  async findByChatIdAndProfile(chatId: string, profile: string, client: string): Promise<Stat2> {
    const stat = await this.statModel.findOne({ chatId, profile, client }).exec();
    if (!stat) {
      throw new NotFoundException(`Stat not found for chatId ${chatId}, profile ${profile} and client ${client}`);
    }
    return stat;
  }

  async update(chatId: string, profile: string, client: string, updateStatDto: UpdateStat2Dto): Promise<Stat2> {
    const fields = this.writableFields('update', updateStatDto as unknown as Record<string, unknown>);
    const stat = await this.statModel.findOneAndUpdate({ chatId, profile, client }, { $set: fields }, { returnDocument: 'after' }).exec();
    if (!stat) {
      throw new NotFoundException(`Stat not found for chatId ${chatId}, profile ${profile} and client ${client}`);
    }
    return stat;
  }

  async findAll(): Promise<Stat2[]> {
    const stats = await this.statModel.find().exec();
    return stats;
  }

  async deleteOne(chatId: string, profile: string, client: string): Promise<void> {
    const result = await this.statModel.deleteOne({ chatId, profile, client }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Stat not found for chatId ${chatId}, profile ${profile} and client ${client}`);
    }
  }

  async deleteAll(): Promise<void> {
    await this.statModel.deleteMany({}).exec();
  }
}
