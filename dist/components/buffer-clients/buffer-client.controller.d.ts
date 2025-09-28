import { BufferClientService } from './buffer-client.service';
import { CreateBufferClientDto } from './dto/create-buffer-client.dto';
import { SearchBufferClientDto } from './dto/search-buffer-client.dto';
import { BufferClient } from './schemas/buffer-client.schema';
import { UpdateBufferClientDto } from './dto/update-buffer-client.dto';
export declare class BufferClientController {
    private readonly clientService;
    constructor(clientService: BufferClientService);
    create(createClientDto: CreateBufferClientDto): Promise<BufferClient>;
    search(query: SearchBufferClientDto): Promise<BufferClient[]>;
    updateInfo(): Promise<string>;
    joinChannelsforBufferClients(clientId?: string): Promise<string>;
    checkbufferClients(): Promise<string>;
    addNewUserstoBufferClients(body: {
        goodIds: string[];
        badIds: string[];
        clientsNeedingBufferClients?: string[];
    }): Promise<string>;
    findAll(status?: string): Promise<BufferClient[]>;
    setAsBufferClient(mobile: string, clientId: string): Promise<string>;
    executeQuery(query: object): Promise<any>;
    getBufferClientDistribution(): Promise<any>;
    getBufferClientsByClientId(clientId: string, status?: string): Promise<BufferClient[]>;
    getBufferClientsByStatus(status: string): Promise<BufferClient[]>;
    updateStatus(mobile: string, body: {
        status: string;
        message?: string;
    }): Promise<BufferClient>;
    markAsActive(mobile: string, body?: {
        message?: string;
    }): Promise<BufferClient>;
    markAsInactive(mobile: string, body: {
        reason: string;
    }): Promise<BufferClient>;
    markAsUsed(mobile: string, body?: {
        message?: string;
    }): Promise<BufferClient>;
    getNextAvailable(clientId: string): Promise<BufferClient | null>;
    getUnusedBufferClients(hoursAgo?: number, clientId?: string): Promise<BufferClient[]>;
    findOne(mobile: string): Promise<BufferClient>;
    update(mobile: string, updateClientDto: UpdateBufferClientDto): Promise<BufferClient>;
    createdOrupdate(mobile: string, updateClientDto: UpdateBufferClientDto): Promise<BufferClient>;
    remove(mobile: string): Promise<void>;
}
