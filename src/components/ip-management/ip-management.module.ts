import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IpManagementController } from './ip-management.controller';
import { IpManagementService } from './ip-management.service';
import { ProxyIp, ProxyIpSchema } from './schemas/proxy-ip.schema';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: ProxyIp.name, schema: ProxyIpSchema },
        ]),
    ],
    controllers: [IpManagementController],
    providers: [IpManagementService],
    exports: [IpManagementService]
})
export class IpManagementModule { }
