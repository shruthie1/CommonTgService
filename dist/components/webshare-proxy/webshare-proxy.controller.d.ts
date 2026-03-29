import { WebshareProxyService } from './webshare-proxy.service';
import { SyncProxiesDto, SyncResultDto } from './dto/sync-proxies.dto';
import { ReplaceProxyDto, ReplaceResultDto } from './dto/replace-proxy.dto';
import { WebshareStatusDto } from './dto/webshare-config.dto';
export declare class WebshareProxyController {
    private readonly webshareProxyService;
    constructor(webshareProxyService: WebshareProxyService);
    getStatus(): Promise<WebshareStatusDto>;
    syncProxies(dto?: SyncProxiesDto): Promise<SyncResultDto>;
    refreshAndSync(): Promise<SyncResultDto>;
    replaceProxy(dto: ReplaceProxyDto): Promise<ReplaceResultDto>;
    getProxyConfig(): Promise<any>;
}
