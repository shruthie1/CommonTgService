"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseError = void 0;
const fetchWithTimeout_1 = require("./fetchWithTimeout");
const logbots_1 = require("./logbots");
const extractMessage = (data) => {
    if (Array.isArray(data)) {
        return `${data.map((item) => extractMessage(item)).join(', ')}`;
    }
    if (typeof data === 'string' ||
        typeof data === 'number' ||
        typeof data === 'boolean') {
        return data;
    }
    if (typeof data === 'object' && data !== null) {
        const messages = [];
        for (const key in data) {
            const value = data[key];
            const newPrefix = key;
            if (Array.isArray(value)) {
                messages.push(`${newPrefix}=${value.map((item) => extractMessage(item)).join(', ')}`);
            }
            else if (typeof value === 'string' ||
                typeof value === 'number' ||
                typeof value === 'boolean') {
                messages.push(`${newPrefix}=${value}`);
            }
            else if (typeof value === 'object' && value !== null) {
                messages.push(String(extractMessage(value)));
            }
        }
        return messages.length > 0 ? messages.join(', ') : '';
    }
    return '';
};
function parseError(err, prefix, sendErr = true) {
    const clientId = process.env.clientId || 'UnknownClient';
    const notifChannel = process.env.notifChannel || 'UnknownChannel';
    const prefixStr = `${clientId} - ${prefix || 'UnknownPrefix'}:: `;
    let status = 500;
    let message = 'An unknown error occurred';
    let error = 'UnknownError';
    if (!err) {
        message = 'No error object provided';
        error = 'NoErrorObject';
    }
    else if (err.response) {
        const response = err.response;
        status =
            response.data?.statusCode ||
                response.data?.status ||
                response.data?.ResponseCode ||
                response.status ||
                err.status ||
                500;
        message =
            response.data?.message ||
                response.data?.errors ||
                response.data?.ErrorMessage ||
                response.data?.errorMessage ||
                response.data?.UserMessage ||
                response.data ||
                response.message ||
                response.statusText ||
                err.message ||
                'An error occurred';
        error =
            response.data?.error || response.error || err.name || err.code || 'Error';
    }
    else if (err.request) {
        status = err.status || 408;
        message =
            err.data?.message ||
                err.data?.errors ||
                err.data?.ErrorMessage ||
                err.data?.errorMessage ||
                err.data?.UserMessage ||
                err.data ||
                err.message ||
                err.statusText ||
                'The request was triggered but no response was received';
        error = err.name || err.code || 'NoResponseError';
    }
    else if (err.message) {
        status = err.status || 500;
        message = err.message;
        error = err.name || err.code || 'Error';
    }
    const fullMessage = `${prefixStr} ${extractMessage(message)}`;
    const response = { status, message: String(fullMessage), error };
    console.log(response);
    if (sendErr) {
        try {
            const shouldSend = !fullMessage.includes("INPUT_USER_DEACTIVATED") &&
                status.toString() !== "429" &&
                !fullMessage.toLowerCase().includes("too many req") &&
                !fullMessage.toLowerCase().includes('could not find') &&
                !fullMessage.includes('ECONNREFUSED');
            if (shouldSend) {
                const encodedMessage = encodeURIComponent(response.message);
                const notifUrl = `${(0, logbots_1.notifbot)()}&text=${encodedMessage}`;
                (0, fetchWithTimeout_1.fetchWithTimeout)(notifUrl);
            }
        }
        catch (fetchError) {
            console.error('Failed to send error notification:', fetchError);
        }
    }
    return response;
}
exports.parseError = parseError;
//# sourceMappingURL=parseError.js.map