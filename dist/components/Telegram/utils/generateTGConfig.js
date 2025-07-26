"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTGConfig = generateTGConfig;
function generateTGConfig() {
    const deviceModels = [
        "Pixel 6", "iPhone 13", "Samsung Galaxy S22", "Redmi Note 12", "OnePlus 9", "Desktop", "MacBook Pro", "iPad Pro"
    ];
    const systemVersions = [
        "Android 13", "iOS 16.6", "Windows 10", "Windows 11", "macOS 13.5", "Ubuntu 22.04", "Arch Linux"
    ];
    const appVersions = [
        "1.0.0", "2.1.3", "3.5.7", "4.0.2", "5.0.0"
    ];
    function pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }
    return {
        connectionRetries: 10,
        requestRetries: 10,
        retryDelay: 5000,
        timeout: 60000,
        autoReconnect: true,
        useWSS: true,
        maxConcurrentDownloads: 3,
        downloadRetries: 10,
        floodSleepThreshold: 180,
        deviceModel: pickRandom(deviceModels),
        systemVersion: pickRandom(systemVersions),
        appVersion: pickRandom(appVersions),
        useIPV6: true,
        testServers: false
    };
}
//# sourceMappingURL=generateTGConfig.js.map