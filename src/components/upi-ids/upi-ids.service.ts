import { Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UpiId } from './upi-ids.schema';
import { NpointService } from '../n-point/npoint.service';
import { Logger } from '../../utils';

@Injectable()
export class UpiIdService implements OnModuleDestroy, OnModuleInit {
    private readonly logger = new Logger(UpiIdService.name);
    private checkInterval: NodeJS.Timeout | null = null;
    private upiIds: any = null;
    private isInitialized = false;
    private readonly REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY = 1000; // 1 second

    constructor(
        @InjectModel('UpiIdModule') private readonly upiIdModel: Model<UpiId>,
        private readonly npointService: NpointService
    ) {}

    async onModuleInit(): Promise<void> {
        this.logger.log('UPI ID Service initializing...');
        try {
            await this.initializeService();
            this.logger.log('UPI ID Service initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize UPI ID Service', error.stack);
            throw error;
        }
    }

    onModuleDestroy(): void {
        this.logger.log('UPI ID Service shutting down...');
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.logger.log('UPI ID Service shutdown complete');
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
                await Promise.all([
                    this.refreshUPIs(),
                    this.checkNpoint()
                ]);
            } catch (error) {
                this.logger.error('Error during periodic check', error.stack);
            }
        }, this.REFRESH_INTERVAL);
    }

    async refreshUPIs(): Promise<void> {
        try {            
            const result = await this.executeWithRetry(async () => {
                return await this.upiIdModel.findOne({}).lean().exec();
            });

            if (result) {
                this.upiIds = { ...result }; // Create a copy to avoid mutation
                // this.logger.debug('UPIs refreshed successfully');
            } else {
                this.logger.warn('No UPI data found in database');
            }
        } catch (error) {
            this.logger.error('Failed to refresh UPIs', error.stack);
            throw error;
        }
    }

    async checkNpoint(): Promise<void> {
        try {
            // Uncomment and implement when needed
            /*
            const upiIds = await this.executeWithRetry(async () => {
                const response = await axios.get('https://api.npoint.io/54baf762fd873c55c6b1', {
                    timeout: 10000, // 10 second timeout
                    headers: {
                        'User-Agent': 'UpiIdService/1.0'
                    }
                });
                return response.data;
            });

            const existingUpiIds = await this.findOne();
            
            if (existingUpiIds && areJsonsNotSame(upiIds, existingUpiIds)) {
                this.logger.log('UPI data mismatch detected, updating npoint...');
                await this.npointService.updateDocument("54baf762fd873c55c6b1", existingUpiIds);
                this.logger.log('Npoint updated successfully');
            }
            */
        } catch (error) {
            this.logger.error('Error checking npoint', error.stack);
            // Don't throw - this is a background task
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
            const result = await this.executeWithRetry(async () => {
                return await this.upiIdModel.findOne({}).lean().exec();
            });

            if (!result) {
                this.logger.warn('No UPI data found');
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

    async update(updateClientDto: any): Promise<any> {
        if (!updateClientDto || typeof updateClientDto !== 'object') {
            throw new Error('Invalid update data provided');
        }

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
                        new: true, 
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
            this.upiIds = { ...updatedUser };
            this.logger.log('UPI data updated successfully');
            
            return { ...updatedUser };

        } catch (error) {
            this.logger.error('Error updating UPI data', error.stack);
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
                this.logger.warn(`Operation failed on attempt ${attempt}/${retries}`, error.message);
                
                if (attempt === retries) {
                    throw error;
                }
                
                // Exponential backoff
                const delay = this.RETRY_DELAY * Math.pow(2, attempt - 1);
                await this.sleep(delay);
            }
        }
        
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