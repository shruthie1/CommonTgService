import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IpManagementController } from './ip-management.controller';
import { IpManagementService } from './ip-management.service';
import { ProxyIp, ProxyIpSchema } from './schemas/proxy-ip.schema';
import { ClientModule } from '../clients/client.module';
import { PromoteClientModule } from '../promote-clients/promote-client.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: ProxyIp.name, schema: ProxyIpSchema },
        ]),
        forwardRef(() => ClientModule),
        forwardRef(() => PromoteClientModule)
    ],
    controllers: [IpManagementController],
    providers: [IpManagementService],
    exports: [IpManagementService]
})
export class IpManagementModule { }
