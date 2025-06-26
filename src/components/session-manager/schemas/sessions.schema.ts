import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Document } from 'mongoose';

export type SessionAuditDocument = SessionAudit & Document;

export enum SessionStatus {
    CREATED = 'created',
    ACTIVE = 'active',
    EXPIRED = 'expired',
    REVOKED = 'revoked',
    FAILED = 'failed'
}

export enum SessionCreationMethod {
    OLD_SESSION = 'old_session',
    USER_MOBILE = 'user_mobile',
    INPUT_SESSION = 'input_session'
}

@Schema({
    collection: 'session_audits',
    versionKey: false,
    autoIndex: true,
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: (doc, ret) => {
            delete ret._id;
            delete ret.__v;
        },
    },
})
export class SessionAudit {
    @ApiProperty({ example: '916265240911', description: 'Phone number associated with the session' })
    @Prop({ required: true, index: true })
    mobile: string;

    @ApiProperty({ example: '1BQANOTEuM==...', description: 'Encrypted session string' })
    @Prop()
    sessionString?: string;

    @ApiProperty({ example: 'active', description: 'Current status of the session', enum: SessionStatus })
    @Prop({ required: true, enum: SessionStatus, default: SessionStatus.CREATED })
    status: SessionStatus;

    @ApiProperty({ example: 'old_session', description: 'Method used to create the session', enum: SessionCreationMethod })
    @Prop({ required: true, enum: SessionCreationMethod })
    creationMethod: SessionCreationMethod;

    @ApiProperty({ example: 'Session created successfully', description: 'Creation success/failure message' })
    @Prop()
    creationMessage?: string;

    @ApiProperty({ example: '1BQANOTEuM==...', description: 'Previous session string used for creation (if applicable)' })
    @Prop()
    previousSessionString?: string;

    @ApiProperty({ example: '2023-12-01T10:00:00Z', description: 'When the session was created' })
    @Prop({ default: Date.now })
    createdAt: Date;

    @ApiProperty({ example: '2023-12-01T15:30:00Z', description: 'Last time the session was used' })
    @Prop({ default: Date.now })
    lastUsedAt: Date;

    @ApiProperty({ example: '2024-01-01T10:00:00Z', description: 'When the session expires' })
    @Prop()
    expiresAt?: Date;

    @ApiProperty({ example: 'shruthi1', description: 'Client ID associated with this session' })
    @Prop()
    clientId?: string;

    @ApiProperty({ example: 'ShruthiRedd2', description: 'Username associated with this session' })
    @Prop()
    username?: string;

    @ApiProperty({ example: 3, description: 'Number of retry attempts during creation' })
    @Prop({ default: 0 })
    retryAttempts: number;

    @ApiProperty({ example: 'Rate limit exceeded', description: 'Error message if creation failed' })
    @Prop()
    errorMessage?: string;

    @ApiProperty({ 
        example: { userAgent: 'Telegram-Desktop/1.0', ipAddress: '192.168.1.1' }, 
        description: 'Additional metadata about session creation' 
    })
    @Prop({ type: Object })
    metadata?: Record<string, any>;

    @ApiProperty({ example: false, description: 'Whether this session is currently active' })
    @Prop({ default: true })
    isActive: boolean;

    @ApiProperty({ example: '2023-12-01T16:00:00Z', description: 'When the session was revoked/expired' })
    @Prop()
    revokedAt?: Date;

    @ApiProperty({ example: 'manual_revocation', description: 'Reason for session revocation' })
    @Prop()
    revocationReason?: string;

    @ApiProperty({ example: 5, description: 'Number of times this session has been used' })
    @Prop({ default: 0 })
    usageCount: number;

    @ApiProperty({ example: 'session_validation_failed', description: 'Last known error with this session' })
    @Prop()
    lastError?: string;

    @ApiProperty({ example: '2023-12-01T15:45:00Z', description: 'When the last error occurred' })
    @Prop()
    lastErrorAt?: Date;
}

export const SessionAuditSchema = SchemaFactory.createForClass(SessionAudit);

// Create indexes for better query performance
SessionAuditSchema.index({ mobile: 1, createdAt: -1 });
SessionAuditSchema.index({ status: 1, isActive: 1 });
SessionAuditSchema.index({ createdAt: -1 });
SessionAuditSchema.index({ lastUsedAt: -1 });
SessionAuditSchema.index({ mobile: 1, isActive: 1, status: 1 });

// Add middleware to automatically update lastUsedAt when session is accessed
SessionAuditSchema.pre('findOneAndUpdate', function() {
    const update = this.getUpdate() as any;
    if (update.$set && !update.$set.lastUsedAt) {
        update.$set.lastUsedAt = new Date();
    }
});
