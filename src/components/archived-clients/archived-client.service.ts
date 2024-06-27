import { BadRequestException, Inject, Injectable, InternalServerErrorException, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateClientDto } from '../clients/dto/create-client.dto';
import { Client, ClientDocument } from '../clients/schemas/client.schema';
import { UpdateClientDto } from '../clients/dto/update-client.dto';
import { TelegramService } from '../Telegram/Telegram.service';
import { sleep } from 'telegram/Helpers';

@Injectable()
export class ArchivedClientService {
    constructor(@InjectModel('ArchivedArchivedClientsModule') private archivedclientModel: Model<ClientDocument>,
        @Inject(forwardRef(() => TelegramService))
        private telegramService: TelegramService,
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
        const user = await this.archivedclientModel.findOne({ mobile }).exec();
        return user;
    }

    async update(mobile: string, updateClientDto: UpdateClientDto): Promise<Client> {
        delete updateClientDto["_id"]
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
        const clients = await this.findAll();
        for (const document of clients) {
            console.log(document)
            try {
                const cli = await this.telegramService.createClient(document.mobile, true, false);
                await this.telegramService.updateUsername(document.mobile, '');
                await this.telegramService.updateNameandBio(document.mobile, 'Deleted Account');
                await this.telegramService.deleteClient(document.mobile)
                await sleep(2000);
            } catch (error) {
                console.log(document.mobile, " :  false");
                this.remove(document.mobile)
                await this.telegramService.deleteClient(document.mobile)
            }
        }
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
