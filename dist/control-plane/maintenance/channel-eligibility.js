"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEligibleDiscoveredChannel = isEligibleDiscoveredChannel;
function isEligibleDiscoveredChannel(channel) {
    const regex = /(wife|adult|lanj|chat|𝑭𝒂𝒎𝒊𝒍𝒚|𝙏𝙖𝙢𝙞𝙡|𝐒𝐖𝐀𝐏|lesb|aunty|girl|boy|tamil|kannad|telugu|hindi|paid|coupl|cpl|randi|bhab|boy|girl|friend|frnd|boob|pussy|dating|swap|gay|sex|bitch|love|video|service|real|call|desi)/i;
    return Boolean((channel.title && regex.test(channel.title)) ||
        (channel.username && regex.test(channel.username)));
}
//# sourceMappingURL=channel-eligibility.js.map