"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withEnrollmentLock = withEnrollmentLock;
exports.__resetEnrollmentLocks = __resetEnrollmentLocks;
const chains = new Map();
async function withEnrollmentLock(key, fn) {
    const previous = chains.get(key) ?? Promise.resolve();
    const run = previous.then(() => fn(), () => fn());
    const tail = run.then(() => undefined, () => undefined);
    chains.set(key, tail);
    tail.finally(() => {
        if (chains.get(key) === tail) {
            chains.delete(key);
        }
    });
    return run;
}
function __resetEnrollmentLocks() {
    chains.clear();
}
//# sourceMappingURL=enrollment-lock.js.map