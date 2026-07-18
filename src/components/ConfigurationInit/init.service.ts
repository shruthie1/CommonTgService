import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Configuration } from './configuration.schema';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { notifbot } from '../../utils/logbots';
import { ConfigService } from '@nestjs/config';
import { Logger } from '../../utils';

@Injectable()
export class ConfigurationService implements OnModuleInit {
    private readonly logger = new Logger(ConfigurationService.name);
    private static initialized = false;

    constructor(
        @InjectModel('configurationModule') private configurationModel: Model<Configuration>,
        private configService: ConfigService
    ) { }

    async onModuleInit() {
        if (ConfigurationService.initialized) {
            return;
        }

        try {
            await this.initializeConfiguration();
            ConfigurationService.initialized = true;
        } catch (error) {
            this.logger.error('Failed to initialize configuration', error);
            throw error;
        }
    }

    private async initializeConfiguration() {
        // this.logger.log('Initializing configuration service...');
        await this.setEnv();
        await this.notifyStart();
        // this.logger.log('Configuration service initialized successfully');
    }

    private async notifyStart() {
        if (process.env.LOCAL_SERVER) {
            this.logger.log('Skipping configuration startup notification in local mode');
            return;
        }
        try {
            const clientId = process.env.clientId || this.configService.get('clientId');
            if (!clientId) {
                this.logger.warn('No clientId found in environment or configuration');
                return;
            }
            // Startup ping is best-effort: disable retries and notifications so a
            // failed/cancelled send doesn't loop 3x or spam the failures channel.
            await fetchWithTimeout(
                `${notifbot()}&text=${encodeURIComponent(`Service started: ${clientId}`)}`,
                { retryConfig: { maxRetries: 0 }, notificationConfig: { enabled: false } },
            );
        } catch (error) {
            this.logger.warn('Failed to send start notification', error);
        }
    }

    async findOne(): Promise<Configuration> {
        const configuration = await this.configurationModel.findOne({}).lean().exec();
        if (!configuration) {
            throw new NotFoundException('Configuration not found');
        }
        return configuration;
    }

    async setEnv() {
        this.logger.log('Setting environment variables...');
        const configuration = await this.configurationModel.findOne({}, { _id: 0 }).lean();

        if (!configuration) {
            this.logger.warn('No configuration found in database, using environment variables only');
            return;
        }

        for (const [key, value] of Object.entries(configuration)) {
            if (value !== undefined && value !== null && !ConfigurationService.NON_ENV_KEYS.has(key)) {
                // Don't override existing environment variables
                if (!process.env[key]) {
                    process.env[key] = this.serializeEnvValue(value);
                    this.logger.debug(`Set environment variable: ${key}`);
                }
            }
        }

        this.logger.log('Finished setting environment variables');
    }

    async update(updateDto: Partial<Configuration>): Promise<Configuration> {
        const { _id, ...updateData } = updateDto as any;

        try {
            const updatedConfig = await this.configurationModel.findOneAndUpdate(
                {},
                { $set: updateData },
                { new: true, upsert: true, lean: true }
            ).exec();

            if (!updatedConfig) {
                throw new NotFoundException('Failed to update configuration');
            }

            // Update environment variables with new values
            Object.entries(updateData).forEach(([key, value]) => {
                if (value !== undefined && value !== null && !ConfigurationService.NON_ENV_KEYS.has(key)) {
                    process.env[key] = this.serializeEnvValue(value);
                }
            });

            return updatedConfig;
        } catch (error) {
            this.logger.error('Failed to update configuration', error);
            throw error;
        }
    }

    // Mongo storage metadata (timestamps:true) — not real config, must not pollute process.env.
    private static readonly NON_ENV_KEYS = new Set(['createdAt', 'updatedAt', '__v', '_id']);

    /**
     * Env vars are strings. Primitives stringify cleanly; objects/arrays must be JSON-serialized
     * (String({}) yields the useless "[object Object]"). Consumers JSON.parse non-primitive values.
     */
    private serializeEnvValue(value: unknown): string {
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
            return String(value);
        }
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
}
