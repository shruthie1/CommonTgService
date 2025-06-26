import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import { SessionAuditService } from './session-audit.service';
import { SessionAudit, SessionAuditSchema } from './schemas/sessions.schema';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: SessionAudit.name, schema: SessionAuditSchema }
        ])
    ],
    controllers: [SessionController],
    providers: [SessionService, SessionAuditService],
    exports: [SessionService, SessionAuditService]
})
export class SessionModule {}
