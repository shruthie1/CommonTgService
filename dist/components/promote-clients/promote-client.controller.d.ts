import { PromoteClientService } from './promote-client.service';
import { CreatePromoteClientDto } from './dto/create-promote-client.dto';
import { SearchPromoteClientDto } from './dto/search-promote-client.dto';
import { PromoteClient } from './schemas/promote-client.schema';
import { UpdatePromoteClientDto } from './dto/update-promote-client.dto';
export declare class PromoteClientController {
    private readonly clientService;
    constructor(clientService: PromoteClientService);
    create(createClientDto: CreatePromoteClientDto): Promise<PromoteClient>;
    search(query: SearchPromoteClientDto): Promise<PromoteClient[]>;
    joinChannelsforPromoteClients(): Promise<string>;
    checkpromoteClients(): Promise<string>;
    addNewUserstoPromoteClients(body: {
        goodIds: string[];
        badIds: string[];
    }): Promise<string>;
    findAll(): Promise<PromoteClient[]>;
    setAsPromoteClient(mobile: string): Promise<string>;
    findOne(mobile: string): Promise<PromoteClient>;
    update(mobile: string, updateClientDto: UpdatePromoteClientDto): Promise<PromoteClient>;
    createdOrupdate(mobile: string, updateClientDto: UpdatePromoteClientDto): Promise<PromoteClient>;
    remove(mobile: string): Promise<void>;
    executeQuery(query: object): Promise<any>;
}
