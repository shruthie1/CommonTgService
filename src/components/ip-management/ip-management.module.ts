import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IpManagementController } from './ip-management.controller';
import { IpManagementService } from './ip-management.service';
import { ClientIpIntegrationService } from './client-ip-integration.service';
import { ClientIpIntegrationController } from './client-ip-integration.controller';
import { ProxyIp, ProxyIpSchema } from './schemas/proxy-ip.schema';
import { IpMobileMapping, IpMobileMappingSchema } from './schemas/ip-mobile-mapping.schema';
import { ClientModule } from '../clients/client.module';
import { PromoteClientModule } from '../promote-clients/promote-client.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: ProxyIp.name, schema: ProxyIpSchema },
            { name: IpMobileMapping.name, schema: IpMobileMappingSchema }
        ]),
        forwardRef(() => ClientModule),
        forwardRef(() => PromoteClientModule)
    ],
    controllers: [IpManagementController, ClientIpIntegrationController],
    providers: [IpManagementService, ClientIpIntegrationService],
    exports: [IpManagementService, ClientIpIntegrationService]
})
export class IpManagementModule {}
