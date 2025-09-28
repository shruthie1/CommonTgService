"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setProcessListeners = setProcessListeners;
function setProcessListeners() {
    process.on('unhandledRejection', (reason, promise) => {
        console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    });
    process.on('uncaughtException', (error) => {
        console.error('❌ Uncaught Exception:', error.stack || error);
        process.exit(1);
    });
    let isShuttingDown = false;
    const shutdown = (signal) => {
        if (isShuttingDown)
            return;
        isShuttingDown = true;
        console.log(`⚡ ${signal} received, shutting down...`);
        process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGQUIT', () => shutdown('SIGQUIT'));
    process.on('exit', (code) => {
        console.log(`🛑 Application closed with exit code ${code}`);
    });
    console.log("✅ Process listeners set up successfully");
}
//# sourceMappingURL=processListeners.js.map