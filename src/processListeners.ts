export function setProcessListeners() {
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
  const shutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`⚡ ${signal} received, shutting down...`);
    process.exit(0);
  };

  // Signals
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGQUIT', () => shutdown('SIGQUIT'));

  // Exit
  process.on('exit', (code) => {
    console.log(`🛑 Application closed with exit code ${code}`);
  });
  console.log("✅ Process listeners set up successfully");
}
