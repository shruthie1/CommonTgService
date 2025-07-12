import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Document } from 'mongoose';

export type ArchivedClientDocument = ArchivedClient & Document;

interface SessionHistoryEntry {
    session: string;
    action: string;
    timestamp: Date;
    status: string;
    source?: string;
}

@Schema({
    collection: 'archivedClients', 
    versionKey: false, 
    autoIndex: true, 
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: (doc, ret) => {
            delete ret._id;
        },
    },
})
export class ArchivedClient {
  
    @ApiProperty({ example: '916265240911', description: 'Mobile number of the archived user' })
    @Prop({ required: true , unique: true })
    mobile: string;

   
    @ApiProperty({ example: '1BQANOTEuM==', description: 'Current session token of the archived user' })
    @Prop({ required: true , unique: true })
    session: string;

    @ApiProperty({ example: ['1BQANOTEuM==', '2CRANOTEuN=='], description: 'Array of old session tokens' })
    @Prop({ type: [String], default: [] })
    oldSessions: string[];

    @ApiProperty({ description: 'Last time the session was updated' })
    @Prop({ type: Date })
    lastUpdated?: Date;

    @ApiProperty({ description: 'Last time sessions were cleaned up' })
    @Prop({ type: Date })
    lastCleanup?: Date;

    @ApiProperty({ description: 'Session history for auditing purposes' })
    @Prop({ 
        type: [{
            session: String,
            action: String,
            timestamp: { type: Date, default: Date.now },
            status: String,
            source: String
        }], 
        default: [] 
    })
    sessionHistory?: SessionHistoryEntry[];

    // Timestamps are automatically added by Mongoose when timestamps: true
    createdAt?: Date;
    updatedAt?: Date;
}

export const ArchivedClientSchema = SchemaFactory.createForClass(ArchivedClient);
