import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Document } from 'mongoose';

export type ProxyIpDocument = ProxyIp & Document;

@Schema({
    collection: 'proxy_ips',
    versionKey: false,
    autoIndex: true,
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: (doc, ret) => {
            delete ret._id;
        } } })
export class ProxyIp {
    @ApiProperty({ description: 'IP address of the proxy' })
    @Prop({ required: true, unique: true })
    ipAddress: string;

    @ApiProperty({ description: 'Port number of the proxy' })
    @Prop({ required: true })
    port: number;

    @ApiProperty({ description: 'Protocol type (http, https, socks5)', enum: ['http', 'https', 'socks5'] })
    @Prop({ required: true, enum: ['http', 'https', 'socks5'] })
    protocol: string;

    @ApiProperty({ description: 'Username for proxy authentication' })
    @Prop({ required: false })
    username?: string;

    @ApiProperty({ description: 'Password for proxy authentication' })
    @Prop({ required: false })
    password?: string;

    @ApiProperty({ description: 'Status of the proxy IP', enum: ['active', 'inactive'] })
    @Prop({ required: true, default: 'active', enum: ['active', 'inactive'] })
    status: string;

    @ApiProperty({ description: 'Whether this IP is currently assigned to a mobile number' })
    @Prop({ required: false, default: false })
    isAssigned: boolean;

    @ApiProperty({ description: 'Client ID that owns this IP' })
    @Prop({ required: false })
    assignedToClient?: string;

    // ==================== NEW FIELDS ====================

    @ApiProperty({ description: 'Source of the proxy', enum: ['manual', 'webshare'] })
    @Prop({ required: false, default: 'manual', enum: ['manual', 'webshare'] })
    source: string;

    @ApiProperty({ description: 'Webshare proxy ID for replacement API' })
    @Prop({ required: false })
    webshareId?: string;

    @ApiProperty({ description: 'ISO 3166-1 two-letter country code' })
    @Prop({ required: false })
    countryCode?: string;

    @ApiProperty({ description: 'City name of the proxy location' })
    @Prop({ required: false })
    cityName?: string;

    @ApiProperty({ description: 'Last time the proxy was verified healthy' })
    @Prop({ required: false })
    lastVerified?: Date;

    @ApiProperty({ description: 'Last time the proxy was served via getNextIp' })
    @Prop({ required: false })
    lastUsed?: Date;

    @ApiProperty({ description: 'Number of consecutive health check failures' })
    @Prop({ required: false, default: 0 })
    consecutiveFails: number;

    @ApiProperty({ description: 'Index used for round-robin ordering' })
    @Prop({ required: false, default: 0 })
    roundRobinIndex: number;
}

export const ProxyIpSchema = SchemaFactory.createForClass(ProxyIp);

// Create indexes for better performance
ProxyIpSchema.index({ ipAddress: 1, port: 1 }, { unique: true });
ProxyIpSchema.index({ status: 1, isAssigned: 1 });
ProxyIpSchema.index({ assignedToClient: 1 });
ProxyIpSchema.index({ source: 1 });
ProxyIpSchema.index({ status: 1, lastUsed: 1 }); // For round-robin queries
ProxyIpSchema.index({ webshareId: 1 }, { sparse: true });
