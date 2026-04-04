import { ClientService } from './client.service';
import { CreateClientDto } from './dto/create-client.dto';
import { Client } from './schemas/client.schema';
import { SearchClientDto } from './dto/search-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { EnhancedSearchClientDto } from './dto/enhanced-search-client.dto';
import { ExecuteClientQueryDto } from './dto/execute-client-query.dto';
import { PromoteMobileAssignmentDto } from './dto/promote-mobile-assignment.dto';
import { PromoteMobileSearchQueryDto } from './dto/promote-mobile-search-query.dto';
import { EnhancedClientSearchResponseDto, PromoteMobileSearchResponseDto } from './dto/client-response.dto';
export declare class ClientController {
    private readonly clientService;
    constructor(clientService: ClientService);
    create(createClientDto: CreateClientDto): Promise<Client>;
    search(query: SearchClientDto): Promise<Client[]>;
    searchByPromoteMobile(query: PromoteMobileSearchQueryDto): Promise<PromoteMobileSearchResponseDto>;
    enhancedSearch(query: EnhancedSearchClientDto): Promise<EnhancedClientSearchResponseDto>;
    updateClient(clientId: string): Promise<string>;
    findAllMasked(): Promise<Partial<Client>[]>;
    findOneMasked(clientId: string): Promise<Partial<Client>>;
    findAll(): Promise<Client[]>;
    findOne(clientId: string): Promise<Client>;
    update(clientId: string, updateClientDto: UpdateClientDto): Promise<Client>;
    remove(clientId: string): Promise<Client>;
    executeQuery(requestBody: ExecuteClientQueryDto): Promise<Client[]>;
    addPromoteMobile(clientId: string, body: PromoteMobileAssignmentDto): Promise<Client>;
    removePromoteMobile(clientId: string, body: PromoteMobileAssignmentDto): Promise<Client>;
}
