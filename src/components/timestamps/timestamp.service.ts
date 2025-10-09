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

    /**
     * Clears the timestamp document by removing all fields except `_id`.
     * If no document exists, creates an empty one and returns it.
     */
    async clear(): Promise<any> {
        const timestamp = await this.timestampModel.findOne({}).lean().exec();

        // If there's no document, create an empty one
        if (!timestamp) {
            const created = await this.timestampModel.create({});
            const createdObj = created.toObject ? created.toObject() : { ...created };
            if (createdObj._id) {
                delete createdObj._id;
            }
            return createdObj;
        }

        // Determine keys to unset (exclude _id)
        const keys = Object.keys(timestamp).filter(k => k !== '_id');

        if (keys.length === 0) {
            const copy = { ...timestamp };
            if (copy._id) delete copy._id;
            return copy;
        }

        const unsetObj: any = {};
        for (const k of keys) {
            unsetObj[k] = ""; // value ignored by $unset
        }

        await this.timestampModel.updateOne({}, { $unset: unsetObj }).exec();

        const updated = await this.timestampModel.findOne({}).lean().exec();
        if (updated && updated._id) delete updated._id;
        return updated || {};
    }


}