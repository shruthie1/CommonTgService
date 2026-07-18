"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileOperationMonitor = void 0;
class FileOperationMonitor {
    static recordOperation(metric) {
        this.metrics.unshift(metric);
        if (this.metrics.length > this.MAX_METRICS) {
            this.metrics.pop();
        }
    }
    static getMetrics(limit = 100) {
        return this.metrics.slice(0, limit);
    }
    static getFailureRate(timeWindow = 3600000) {
        const now = Date.now();
        const recentOperations = this.metrics.filter((m) => now - m.timestamp < timeWindow);
        if (recentOperations.length === 0)
            return 0;
        const failures = recentOperations.filter((m) => !m.success).length;
        return failures / recentOperations.length;
    }
    static clearMetrics() {
        this.metrics = [];
    }
}
exports.FileOperationMonitor = FileOperationMonitor;
FileOperationMonitor.metrics = [];
FileOperationMonitor.MAX_METRICS = 1000;
//# sourceMappingURL=file-operation-monitor.js.map