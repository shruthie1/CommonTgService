import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Timestamp } from './timestamps.schema';
import { ClientService } from '../clients/client.service';

@Injectable()
export class TimestampService {
    constructor(
        @InjectModel('timestampModule') private timestampModel: Model<Timestamp>,
        @Inject(forwardRef(() => ClientService))
        private clientService: ClientService,
    ) { }

    async findOne(): Promise<any> {
        const timestamp = await this.timestampModel.findOne({}).lean().exec();
        if (!timestamp) {
            throw new NotFoundException(`Timestamp not found`);
        }

        // Ensure _id is removed from the response
        if (timestamp._id) {
            delete timestamp._id;
        }

        return timestamp;
    }

    async getTimeDifferences(threshold: number = 3 * 60 * 1000): Promise<any> {
        const timestamp = await this.timestampModel.findOne({}).lean().exec();
        if (!timestamp) {
            throw new NotFoundException(`Timestamp not found`);
        }

        const currentTime = Date.now();
        const differences = {};

        // Loop through each timestamp entry
        Object.keys(timestamp).forEach(key => {
            // Skip the _id field and non-numeric values
            if (key === '_id' || typeof timestamp[key] !== 'number') {
                return;
            }

            const difference = currentTime - timestamp[key];

            // Only include differences that are greater than the threshold
            if (difference > threshold) {
                differences[key] = difference;
            } else {
                console.log(`Difference for ${key} is within the threshold: ${difference}ms`);
            }
        });

        return differences;
    }

    async getClientsWithTimeDifference(threshold: number = 3 * 60 * 1000): Promise<any[]> {
        const differences = await this.getTimeDifferences(threshold);
        const clientIds = Object.keys(differences);

        if (clientIds.length === 0) {
            return [];
        }

        const urls = [];
        for (const clientId of clientIds) {
            const clientParams = clientId.split('_');
            try {
                const client = await this.clientService.findOne(clientParams[0], false);
                if (client) {
                    if (clientParams[1]) {
                        urls.push(client.promoteRepl);
                    } else {
                        urls.push(client.repl);
                    }
                }
            } catch (error) {
                console.error(`Error fetching client with ID ${clientId}:`, error.message);
            }
        }

        return urls;
    }

    async update(updateTimestampDto: any): Promise<any> {
        // Ensure _id is removed from the input
        delete updateTimestampDto['_id'];

        const updatedTimestamp = await this.timestampModel.findOneAndUpdate(
            {}, // Update the first document found in the collection
            { $set: { ...updateTimestampDto } },
            { new: true, upsert: true, lean: true }
        ).exec();

        if (!updatedTimestamp) {
            throw new NotFoundException(`Timestamp not found`);
        }

        // Ensure _id is removed from the response
        if (updatedTimestamp._id) {
            delete updatedTimestamp._id;
        }

        return updatedTimestamp;
    }
}