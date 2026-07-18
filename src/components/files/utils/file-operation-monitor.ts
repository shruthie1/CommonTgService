export interface FileOperationMetrics {
  operation: string;
  success: boolean;
  duration: number;
  timestamp: number;
  path?: string;
  error?: string;
}

export class FileOperationMonitor {
  private static metrics: FileOperationMetrics[] = [];
  private static readonly MAX_METRICS = 1000;

  static recordOperation(metric: FileOperationMetrics): void {
    this.metrics.unshift(metric);
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics.pop();
    }
  }

  static getMetrics(limit = 100): FileOperationMetrics[] {
    return this.metrics.slice(0, limit);
  }

  static getFailureRate(timeWindow = 3600000): number {
    const now = Date.now();
    const recentOperations = this.metrics.filter(
      (m) => now - m.timestamp < timeWindow,
    );
    if (recentOperations.length === 0) return 0;

    const failures = recentOperations.filter((m) => !m.success).length;
    return failures / recentOperations.length;
  }

  static clearMetrics(): void {
    this.metrics = [];
  }
}
