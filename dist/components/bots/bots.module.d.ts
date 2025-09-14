import { OnModuleInit } from '@nestjs/common';
import { BotsService } from './bots.service';
export declare class BotsModule implements OnModuleInit {
    private readonly botsService;
    constructor(botsService: BotsService);
    onModuleInit(): void;
}
