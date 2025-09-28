"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setBotsServiceInstance = setBotsServiceInstance;
exports.getBotsServiceInstance = getBotsServiceInstance;
let botsServiceInstance = null;
function setBotsServiceInstance(instance) {
    botsServiceInstance = instance;
}
function getBotsServiceInstance() {
    if (!botsServiceInstance) {
        throw new Error('BotsService instance not initialized. Make sure to call setBotsServiceInstance first.');
    }
    return botsServiceInstance;
}
//# sourceMappingURL=bot.service.instance.js.map