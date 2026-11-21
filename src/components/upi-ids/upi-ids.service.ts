import { Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UpiId } from './upi-ids.schema';
import { Logger } from '../../utils';

/** Error text with anything id-shaped (contains "@") replaced, so a log line never carries a payee id. */
function maskIds(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error);
    return text.replace(/\S*@\S*/g, '<id>');
}

@Injectable()
export class UpiIdService implements OnModuleDestroy, OnModuleInit {
    private readonly logger = new Logger(UpiIdService.name);
    private checkInterval: NodeJS.Timeout | null = null;
    private upiIds: any = null;
    private isInitialized = false;
    /**
     * Bumped by every PATCH. A DB read that started before a PATCH must not publish its older document over the
     * PATCHed cache (PATCH persists since batch 7, so the old payee would come back through GET until the next refresh).
     */
    private cacheGeneration = 0;
    /** PATCH serialisation: every update() chains on this tail (see update()). */
    private updateTail: Promise<void> = Promise.resolve();
    private updatesInFlight = 0;
    private readonly REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY = 1000; // 1 second

    constructor(
        @InjectModel('UpiIdModule') private readonly upiIdModel: Model<UpiId>,
    ) {}

    async onModuleInit(): Promise<void> {
        // this.logger.log('UPI ID Service initializing...');
        try {
            await this.initializeService();
            // this.logger.log('UPI ID Service initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize UPI ID Service', error.stack);
            throw error;
        }
    }

    onModuleDestroy(): void {
        // this.logger.log('UPI ID Service shutting down...');
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        // this.logger.log('UPI ID Service shutdown complete');
    }

    private async initializeService(): Promise<void> {
        try {
            // Load initial data
            await this.refreshUPIs();
            
            // Start the periodic check
            this.startPeriodicCheck();
            this.isInitialized = true;
        } catch (error) {
            this.logger.error('Service initialization failed', error.stack);
            throw new Error('UPI ID Service initialization failed');
        }
    }

    private startPeriodicCheck(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }

        this.checkInterval = setInterval(async () => {
            try {
                await this.refreshUPIs();
            } catch (error) {
                this.logger.error('Error during periodic check', error.stack);
            }
        }, this.REFRESH_INTERVAL);
    }

    /** False (and one kind= line) when a PATCH landed while this read ran: its document is older than the cache. */
    private readIsCurrent(generation: number, path: string): boolean {
        if (generation === this.cacheGeneration) return true;
        this.logger.warn(`[upi-ids] kind=stale_read_skipped path=${path}: a PATCH landed during the read, cache kept`);
        return false;
    }

    async refreshUPIs(): Promise<void> {
        try {
            const generation = this.cacheGeneration;
            const result = await this.executeWithRetry(async () => {
                return await this.upiIdModel.findOne({}).lean().exec();
            });

            if (result && !this.readIsCurrent(generation, 'refresh')) {
                return;
            }
            if (result) {
                this.upiIds = { ...result }; // Create a copy to avoid mutation
                // this.logger.debug('UPIs refreshed successfully');
            } else {
                this.logger.warn('[upi-ids] kind=no_doc path=refresh: no upi-ids document, cache kept');
            }
        } catch (error) {
            this.logger.error('Failed to refresh UPIs', error.stack);
            throw error;
        }
    }

    async findOne(): Promise<any> {
        if (!this.isInitialized) {
            throw new Error('Service not initialized. Please wait for initialization to complete.');
        }

        try {
            // Return cached data if available
            if (this.upiIds && Object.keys(this.upiIds).length > 0) {
                return { ...this.upiIds }; // Return a copy to prevent mutation
            }

            // Fallback to database query
            this.logger.debug('Cache miss, fetching from database...');
            const generation = this.cacheGeneration;
            const result = await this.executeWithRetry(async () => {
                return await this.upiIdModel.findOne({}).lean().exec();
            });

            // A PATCH landed during the read: its cached doc is newer than this read (null included), so return it.
            if (!this.readIsCurrent(generation, 'read_through') && this.upiIds) {
                return { ...this.upiIds };
            }

            if (!result) {
                this.logger.warn('[upi-ids] kind=no_doc path=read_through: no upi-ids document');
                return null;
            }

            this.upiIds = { ...result };
            this.logger.debug('UPIs fetched and cached');
            return { ...result };
            
        } catch (error) {
            this.logger.error('Error finding UPI data', error.stack);
            throw error;
        }
    }

    /**
     * PATCHes run one at a time. Two overlapping PATCHes could otherwise publish their Mongo post-images to the cache
     * in response order, not apply order, and put the older payee back until the next refresh (Codex batch 7 r3).
     * One at a time, each PATCH applies and publishes before the next one starts, so the cache ends on the last one.
     */
    async update(updateClientDto: any): Promise<any> {
        if (!updateClientDto || typeof updateClientDto !== 'object') {
            throw new Error('Invalid update data provided');
        }
        if (this.updatesInFlight > 0) {
            this.logger.log(`[upi-ids] kind=update_queued ahead=${this.updatesInFlight}: waits for the earlier PATCH`);
        }
        this.updatesInFlight += 1;
        const run = this.updateTail.then(() => this.applyUpdate(updateClientDto));
        // The next PATCH waits for this one whether it succeeds or fails.
        this.updateTail = run.then(
            () => undefined,
            () => undefined,
        );
        try {
            return await run;
        } finally {
            this.updatesInFlight -= 1;
        }
    }

    private async applyUpdate(updateClientDto: any): Promise<any> {
        try {
            // Create a clean copy without _id
            const updateData = { ...updateClientDto };
            delete updateData._id;

            this.logger.debug('Updating UPI data...');

            const updatedUser = await this.executeWithRetry(async () => {
                return await this.upiIdModel.findOneAndUpdate(
                    {},
                    {
                        $set: {
                            ...updateData,
                            updatedAt: new Date() // Add timestamp
                        }
                    },
                    {
                        returnDocument: 'after',
                        upsert: true,
                        lean: true,
                        runValidators: true // Ensure schema validation
                    }
                ).exec();
            });

            if (!updatedUser) {
                throw new NotFoundException('Failed to update UPI data');
            }

            // Update cache
            this.cacheGeneration += 1;
            this.upiIds = { ...updatedUser };
            // Key names are counted, never printed with values: no payee id in a log line.
            this.logger.log(`[upi-ids] kind=updated keys=${Object.keys(updateData).length}`);

            return { ...updatedUser };

        } catch (error) {
            this.logger.error(`[upi-ids] kind=update_failed reason=${maskIds(error)}: cache kept`);
            throw error;
        }
    }

    private async executeWithRetry<T>(
        operation: () => Promise<T>,
        retries: number = this.MAX_RETRIES
    ): Promise<T> {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                this.logger.warn(`Operation failed on attempt ${attempt}/${retries}`, maskIds(error));
                
                if (attempt === retries) {
                    throw error;
                }
                
                // Exponential backoff
                const delay = this.RETRY_DELAY * Math.pow(2, attempt - 1);
                await this.sleep(delay);
            }
        }

        /* istanbul ignore next -- unreachable: loop always returns or throws on the final attempt */
        throw new Error('All retry attempts failed');
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Health check method for monitoring
    getServiceStatus(): { isInitialized: boolean; hasCachedData: boolean; lastUpdate?: Date } {
        return {
            isInitialized: this.isInitialized,
            hasCachedData: this.upiIds !== null && Object.keys(this.upiIds).length > 0,
            lastUpdate: this.upiIds?.updatedAt
        };
    }
}
