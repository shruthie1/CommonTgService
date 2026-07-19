// Cleanup hook wired in after the Nest app is created (see main.ts). Set late so the
// exception/signal handlers can be registered at the very top of bootstrap.
let shutdownHandler: (() => Promise<void>) | undefined;
export function setShutdownHandler(fn: () => Promise<void>) {
  shutdownHandler = fn;
}

/**
 * @param onShutdown optional async cleanup (e.g. app.close() → NestJS onModuleDestroy:
 *   close Mongo, clear intervals, send shutdown notification). It is awaited BEFORE the
 *   process exits, with a hard timeout so a hung cleanup can't block the exit forever.
 *   If omitted, a handler registered later via setShutdownHandler() is used.
 */
export function setProcessListeners(onShutdown?: () => Promise<void>) {
  // Catch unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  });

  // Catch uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    console.error('❌ Uncaught Exception:', error.stack || error);
    process.exit(1); // Exit after logging
  });

  // Graceful shutdown
  let isShuttingDown = false;
  const SHUTDOWN_TIMEOUT_MS = 20000;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`⚡ ${signal} received, shutting down...`);
    const cleanup = onShutdown ?? shutdownHandler;
    if (cleanup) {
      // Run graceful cleanup, but never let a hung close block the exit indefinitely.
      let shutdownTimeout: NodeJS.Timeout | undefined;
      try {
        const timeout = new Promise<void>((resolve) => {
          shutdownTimeout = setTimeout(resolve, SHUTDOWN_TIMEOUT_MS);
        });
        await Promise.race([
          cleanup(),
          timeout,
        ]);
      } catch (err) {
        console.error('❌ Error during graceful shutdown:', err);
      } finally {
        if (shutdownTimeout) clearTimeout(shutdownTimeout);
      }
    }
    process.exit(0);
  };

  // Signals
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGQUIT', () => { void shutdown('SIGQUIT'); });

  // Exit
  process.on('exit', (code) => {
    console.log(`🛑 Application closed with exit code ${code}`);
  });
  console.log("✅ Process listeners set up successfully");
}
