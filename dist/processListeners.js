"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setShutdownHandler = setShutdownHandler;
exports.setProcessListeners = setProcessListeners;
let shutdownHandler;
function setShutdownHandler(fn) {
    shutdownHandler = fn;
}
function setProcessListeners(onShutdown) {
    process.on('unhandledRejection', (reason, promise) => {
        console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    });
    process.on('uncaughtException', (error) => {
        console.error('❌ Uncaught Exception:', error.stack || error);
        process.exit(1);
    });
    let isShuttingDown = false;
    const SHUTDOWN_TIMEOUT_MS = 20000;
    const shutdown = async (signal) => {
        if (isShuttingDown)
            return;
        isShuttingDown = true;
        console.log(`⚡ ${signal} received, shutting down...`);
        const cleanup = onShutdown ?? shutdownHandler;
        if (cleanup) {
            try {
                await Promise.race([
                    cleanup(),
                    new Promise((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS)),
                ]);
            }
            catch (err) {
                console.error('❌ Error during graceful shutdown:', err);
            }
        }
        process.exit(0);
    };
    process.on('SIGINT', () => { void shutdown('SIGINT'); });
    process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
    process.on('SIGQUIT', () => { void shutdown('SIGQUIT'); });
    process.on('exit', (code) => {
        console.log(`🛑 Application closed with exit code ${code}`);
    });
    console.log("✅ Process listeners set up successfully");
}
//# sourceMappingURL=processListeners.js.map