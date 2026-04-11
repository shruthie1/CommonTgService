import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Document } from 'mongoose';

export type ClientDocument = Client & Document;

@Schema({
    collection: 'clients', versionKey: false, autoIndex: true, timestamps: true,
    toJSON: {
        virtuals: true,
        transform: (doc, ret) => {
            delete ret._id;
        },
    },
})
export class Client {
    @ApiProperty({ description: 'Channel link' })
    @Prop({ required: true })
    channelLink: string;

    @ApiProperty({ description: 'Database collection name' })
    @Prop({ required: true })
    dbcoll: string;

    @ApiProperty({ description: 'Client link' })
    @Prop({ required: true })
    link: string;

    @ApiProperty({ description: 'Display name' })
    @Prop({ required: true })
    name: string;

    @ApiProperty({ description: 'Mobile number' })
    @Prop({ required: true, unique: true })
    mobile: string;

    @ApiProperty({ description: '2FA password' })
    @Prop({ required: true })
    password: string;

    @ApiProperty({ description: 'tg-aut repl link' })
    @Prop({ required: true })
    repl: string;

    @ApiProperty({ description: 'Promote repl link' })
    @Prop({ required: true })
    promoteRepl: string;

    @ApiProperty({ description: 'Telegram session string' })
    @Prop({ required: true })
    session: string;

    @ApiProperty({ description: 'Telegram username' })
    @Prop({ required: true })
    username: string;

    @ApiProperty({ description: 'Unique client identifier' })
    @Prop({ required: true, unique: true })
    clientId: string;

    @ApiProperty({ description: 'Deploy restart URL' })
    @Prop({ required: true })
    deployKey: string;

    @ApiProperty({ description: 'Product identifier' })
    @Prop({ required: true })
    product: string;

    @ApiProperty({ description: 'Paytm QR ID' })
    @Prop({ required: true })
    qrId: string;

    @ApiProperty({ description: 'Google Pay ID' })
    @Prop({ required: true })
    gpayId: string;

    @ApiProperty({ description: 'Dedicated proxy IPs', required: false })
    @Prop({ required: false, type: [String], default: [] })
    dedicatedIps?: string[];

    @ApiProperty({ description: 'Preferred IP country (ISO 2-letter)', required: false })
    @Prop({ required: false, default: null })
    preferredIpCountry?: string;

    @ApiProperty({ description: 'Auto-assign IPs to mobile numbers', required: false })
    @Prop({ required: false, type: Boolean, default: false })
    autoAssignIps?: boolean;

    @ApiProperty({ description: 'First name pool for persona assignment', required: false })
    @Prop({ required: false, type: [String], default: [] })
    firstNames: string[];

    @ApiProperty({ description: 'Last name pool for buffer clients', required: false })
    @Prop({ required: false, type: [String], default: [] })
    bufferLastNames: string[];

    @ApiProperty({ description: 'Last name pool for promote clients', required: false })
    @Prop({ required: false, type: [String], default: [] })
    promoteLastNames: string[];

    @ApiProperty({ description: 'Bio pool for persona assignment', required: false })
    @Prop({ required: false, type: [String], default: [] })
    bios: string[];

    @ApiProperty({ description: 'Profile pic URL pool', required: false })
    @Prop({ required: false, type: [String], default: [] })
    profilePics: string[];

}

export const ClientSchema = SchemaFactory.createForClass(Client);
