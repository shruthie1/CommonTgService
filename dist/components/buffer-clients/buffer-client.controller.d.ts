import { BufferClientService } from './buffer-client.service';
import { CreateBufferClientDto } from './dto/create-buffer-client.dto';
import { SearchBufferClientDto } from './dto/search-buffer- client.dto';
import { BufferClient } from './schemas/buffer-client.schema';
import { UpdateBufferClientDto } from './dto/update-buffer-client.dto';
export declare class BufferClientController {
    private readonly clientService;
    constructor(clientService: BufferClientService);
    create(createClientDto: CreateBufferClientDto): Promise<BufferClient>;
    search(query: SearchBufferClientDto): Promise<BufferClient[]>;
    checkbufferClients(): Promise<string>;
    addNewUserstoBufferClients(body: {
        goodIds: string[];
        badIds: string[];
    }): Promise<string>;
    findAll(): Promise<BufferClient[]>;
    setAsBufferClient(mobile: string): Promise<string>;
    findOne(mobile: string): Promise<BufferClient>;
    update(mobile: string, updateClientDto: UpdateBufferClientDto): Promise<BufferClient>;
    createdOrupdate(mobile: string, updateClientDto: UpdateBufferClientDto): Promise<BufferClient>;
    remove(mobile: string): Promise<void>;
    executeQuery(query: object): Promise<any>;
}
