"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ppplbot = exports.notifbot = void 0;
const notifbottokens = [
    '5856546982:AAEW5QCbfb7nFAcmsTyVjHXyV86TVVLcL_g',
    '7628485611:AAECLtviheixcYoEBL_EhfsCegct7lgV-Zk',
    '7940072383:AAHwRu4_4QWqeuC4ZClS9OiSfBOVQ7TvGHw'
];
let currentNotifTokenIndex = 0;
function notifbot(chatId = process.env.notifChannel, botToken) {
    const token = botToken || notifbottokens[currentNotifTokenIndex];
    const apiUrl = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}`;
    if (!botToken) {
        currentNotifTokenIndex = (currentNotifTokenIndex + 1) % notifbottokens.length;
    }
    return apiUrl;
}
exports.notifbot = notifbot;
const ppplbottokens = [
    '7281017483:AAGoeVPH98k8rXUpoR22XomfAL7PzMtJVVk',
    '7499764732:AAH3flZUF7J1zwK1xac8fI50lR24WeQAbNo',
    '6735591051:AAELwIkSHegcBIVv5pf484Pn09WNQj1Nl54',
    '6624618034:AAHoM3GYaw3_uRadOWYzT7c2OEp6a7A61mY',
    '6607225097:AAG6DJg9Ll5XVxy24Nr449LTZgRb5bgshUA'
];
let currentPpplTokenIndex = 0;
function ppplbot(chatId = process.env.updatesChannel, botToken) {
    const token = botToken || ppplbottokens[currentPpplTokenIndex];
    const apiUrl = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}`;
    if (!botToken) {
        currentPpplTokenIndex = (currentPpplTokenIndex + 1) % ppplbottokens.length;
    }
    return apiUrl;
}
exports.ppplbot = ppplbot;
//# sourceMappingURL=logbots.js.map