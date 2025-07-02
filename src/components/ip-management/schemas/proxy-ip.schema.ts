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
        },
    },
})
export class ProxyIp {
    @ApiProperty({ example: '192.168.1.100', description: 'IP address of the proxy' })
    @Prop({ required: true, unique: true })
    ipAddress: string;

    @ApiProperty({ example: 8080, description: 'Port number of the proxy' })
    @Prop({ required: true })
    port: number;

    @ApiProperty({ example: 'http', description: 'Protocol type (http, https, socks5)', enum: ['http', 'https', 'socks5'] })
    @Prop({ required: true, enum: ['http', 'https', 'socks5'] })
    protocol: string;

    @ApiProperty({ example: 'username', description: 'Username for proxy authentication' })
    @Prop({ required: false })
    username?: string;

    @ApiProperty({ example: 'password', description: 'Password for proxy authentication' })
    @Prop({ required: false })
    password?: string;

    @ApiProperty({ example: 'active', description: 'Status of the proxy IP', enum: ['active', 'inactive'] })
    @Prop({ required: true, default: 'active', enum: ['active', 'inactive'] })
    status: string;

    @ApiProperty({ example: false, description: 'Whether this IP is currently assigned to a mobile number' })
    @Prop({ required: true, default: false })
    isAssigned: boolean;

    @ApiProperty({ example: 'client1', description: 'Client ID that owns this IP' })
    @Prop({ required: false })
    assignedToClient?: string;
}

export const ProxyIpSchema = SchemaFactory.createForClass(ProxyIp);

// Create indexes for better performance
ProxyIpSchema.index({ ipAddress: 1, port: 1 }, { unique: true });
ProxyIpSchema.index({ status: 1, isAssigned: 1 });
ProxyIpSchema.index({ assignedToClient: 1 });
