import { BadRequestException, Inject, Injectable, InternalServerErrorException, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateClientDto } from '../clients/dto/create-client.dto';
import { Client, ClientDocument } from '../clients/schemas/client.schema';
import { UpdateClientDto } from '../clients/dto/update-client.dto';
import { TelegramService } from '../Telegram/Telegram.service';
import { sleep } from 'telegram/Helpers';
import { ClientService } from '../clients/client.service';

@Injectable()
export class ArchivedClientService {
    constructor(@InjectModel('ArchivedArchivedClientsModule') private archivedclientModel: Model<ClientDocument>,
        @Inject(forwardRef(() => TelegramService))
        private telegramService: TelegramService,
        @Inject(forwardRef(() => ClientService))
        private clientService: ClientService,
    ) { }

    async create(createClientDto: CreateClientDto): Promise<Client> {
        const createdUser = new this.archivedclientModel(createClientDto);
        return createdUser.save();
    }

    async findAll(): Promise<Client[]> {
        const results: Client[] = await this.archivedclientModel.find().exec();
        return results
    }

    async findOne(mobile: string): Promise<Client> {
        const user = (await this.archivedclientModel.findOne({ mobile }).exec())?.toJSON();
        return user;
    }

    async fetchOne(mobile: string): Promise<Client> {
        const user = (await this.archivedclientModel.findOne({ mobile }).exec())?.toJSON();
        if (user) {
            return user;
        } else {
            await this.telegramService.createClient(mobile, false, true)
            const newSession = await this.telegramService.createNewSession(mobile);
            await this.telegramService.deleteClient(mobile)
            return await this.create({
                "channelLink": "default",
                "clientId": "default",
                "dbcoll": "default",
                "deployKey": "default",
                "link": "default",
                "mainAccount": "default",
                promoteRepl: "default",
                "name": "default",
                "password": "Ajtdmwajt1@",
                "repl": "default",
                "session": newSession,
                "username": "default",
                "mobile": mobile,
                product: "default"
            })
        }
    }

    async update(mobile: string, updateClientDto: UpdateClientDto): Promise<Client> {
        delete updateClientDto["_id"]
        if ((<any>updateClientDto)._doc) {
            delete (<any>updateClientDto)._doc['_id']
        }
        console.log({ ...updateClientDto });
        const updatedUser = await this.archivedclientModel.findOneAndUpdate({ mobile }, { $set: updateClientDto }, { new: true, upsert: true }).exec();
        return updatedUser;
    }

    async remove(mobile: string): Promise<Client> {
        const deletedUser = await this.archivedclientModel.findOneAndDelete({ mobile }).exec();
        if (!deletedUser) {
            throw new NotFoundException(`Client with ID "${mobile}" not found`);
        }
        return deletedUser;
    }

    async search(filter: any): Promise<Client[]> {
        console.log(filter)
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') }
        }
        console.log(filter)
        return this.archivedclientModel.find(filter).exec();
    }

    async checkArchivedClients() {
        await this.telegramService.disconnectAll()
        await sleep(2000);
        const archivedClients = await this.findAll();

        const clients = await this.clientService.findAll();
        const clientIds = clients.map(client => client.mobile);

        archivedClients.map(async (document) => {
            if (!clientIds.includes(document.mobile)) {
                try {
                    await this.telegramService.createClient(document.mobile, true, false);
                    await this.telegramService.updateUsername(document.mobile, '');
                    await this.telegramService.updateNameandBio(document.mobile, 'Deleted Account');
                    await this.telegramService.deleteClient(document.mobile)
                    await sleep(2000);
                } catch (error) {
                    console.log(document.mobile, " :  false");
                    this.remove(document.mobile)
                    await this.telegramService.deleteClient(document.mobile)
                }
            } else {
                console.log("Number is a Active Client")
            }
        })

        return "Triggered ArchiveClients check"
    }

    async executeQuery(query: any): Promise<any> {
        try {
            if (!query) {
                throw new BadRequestException('Query is invalid.');
            }
            return await this.archivedclientModel.find(query).exec();
        } catch (error) {
            throw new InternalServerErrorException(error.message);
        }
    }
}
