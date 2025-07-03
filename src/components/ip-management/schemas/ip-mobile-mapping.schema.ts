import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Document } from 'mongoose';

export type IpMobileMappingDocument = IpMobileMapping & Document;

@Schema({
    collection: 'ip_mobile_mappings',
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
export class IpMobileMapping {
    @ApiProperty({ example: '916265240911', description: 'Mobile number' })
    @Prop({ required: true, unique: true })
    mobile: string;

    @ApiProperty({ example: '192.168.1.100:8080', description: 'IP address and port combination' })
    @Prop({ required: true })
    ipAddress: string;

    @ApiProperty({ example: 'client1', description: 'Client ID that owns this mobile number' })
    @Prop({ required: true })
    clientId: string;



    @ApiProperty({ example: 'active', description: 'Status of this mapping', enum: ['active', 'inactive'] })
    @Prop({ required: true, default: 'active', enum: ['active', 'inactive'] })
    status: string;
}

export const IpMobileMappingSchema = SchemaFactory.createForClass(IpMobileMapping);

// Create indexes for better performance
IpMobileMappingSchema.index({ clientId: 1 });
IpMobileMappingSchema.index({ ipAddress: 1 });
