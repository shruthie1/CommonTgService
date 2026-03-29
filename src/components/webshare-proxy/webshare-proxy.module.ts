import { Module, forwardRef } from '@nestjs/common';
import { WebshareProxyController } from './webshare-proxy.controller';
import { WebshareProxyService } from './webshare-proxy.service';
import { IpManagementModule } from '../ip-management/ip-management.module';

@Module({
    imports: [
        forwardRef(() => IpManagementModule),
    ],
    controllers: [WebshareProxyController],
    providers: [WebshareProxyService],
    exports: [WebshareProxyService],
})
export class WebshareProxyModule {}
