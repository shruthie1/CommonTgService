"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var MemoryCleanerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryCleanerService = void 0;
const common_1 = require("@nestjs/common");
const utils_1 = require("./utils");
let MemoryCleanerService = MemoryCleanerService_1 = class MemoryCleanerService {
    constructor() {
        this.logger = new utils_1.Logger(MemoryCleanerService_1.name);
        this.intervalId = null;
        this.memoryLimitMB = 400;
        this.cleanupIntervalMs = 5 * 60 * 1000;
    }
    onModuleInit() {
        this.logger.log('MemoryCleanerService initialized.');
        this.intervalId = setInterval(() => this.monitorAndCleanup(), this.cleanupIntervalMs);
    }
    onModuleDestroy() {
        if (this.intervalId)
            clearInterval(this.intervalId);
    }
    getMemoryUsageInMB() {
        const mem = process.memoryUsage();
        return {
            rss: (mem.rss / 1024 / 1024).toFixed(2),
            heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2),
            heapTotal: (mem.heapTotal / 1024 / 1024).toFixed(2),
            external: (mem.external / 1024 / 1024).toFixed(2),
        };
    }
    monitorAndCleanup() {
        const mem = process.memoryUsage();
        const heapUsedMB = mem.heapUsed / 1024 / 1024;
        this.logger.log(`🧠 Heap Used: ${heapUsedMB.toFixed(2)} MB`);
        if (heapUsedMB > this.memoryLimitMB) {
            this.logger.warn(`🚨 Heap exceeded ${this.memoryLimitMB} MB. Cleaning up...`);
            this.cleanupMemory();
        }
    }
    cleanupMemory() {
        if (typeof global.gc === 'function') {
            global.gc();
            this.logger.log('✅ Manual GC triggered via global.gc()');
        }
        else {
            this.logger.warn('⚠️ GC not available. Start Node with --expose-gc');
        }
        const mem = this.getMemoryUsageInMB();
        this.logger.log(`🧹 Memory After Cleanup: ${JSON.stringify(mem)}`);
    }
};
exports.MemoryCleanerService = MemoryCleanerService;
exports.MemoryCleanerService = MemoryCleanerService = MemoryCleanerService_1 = __decorate([
    (0, common_1.Injectable)()
], MemoryCleanerService);
//# sourceMappingURL=memory-cleanup.service.js.map