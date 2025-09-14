import { BotsService } from '../components/bots/bots.service';

// Global instance that will be set by the application
let botsServiceInstance: BotsService | null = null;

export function setBotsServiceInstance(instance: BotsService) {
    botsServiceInstance = instance;
}

export function getBotsServiceInstance(): BotsService {
    if (!botsServiceInstance) {
        throw new Error('BotsService instance not initialized. Make sure to call setBotsServiceInstance first.');
    }
    return botsServiceInstance;
}
