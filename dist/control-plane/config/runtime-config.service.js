"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeConfigService = exports.SCHEDULER_FLAGS = void 0;
const common_1 = require("@nestjs/common");
exports.SCHEDULER_FLAGS = [
    'CMS_SCHEDULER',
    'UMS_SCHEDULER',
    'UMS_TEST_SCHEDULER',
];
function bool(value, fallback) {
    if (value === undefined)
        return fallback;
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}
const DEFAULTS = {
    CMS_SCHEDULER: false,
    UMS_SCHEDULER: false,
    UMS_TEST_SCHEDULER: false,
};
let RuntimeConfigService = class RuntimeConfigService {
    constructor() {
        this.schedulers = Object.fromEntries(exports.SCHEDULER_FLAGS.map((flag) => [
            flag,
            bool(process.env[`ENABLE_${flag}`], DEFAULTS[flag]),
        ]));
    }
    enabled(scheduler) {
        return this.schedulers[scheduler];
    }
    activeSchedulers() {
        return exports.SCHEDULER_FLAGS.filter((scheduler) => this.schedulers[scheduler]);
    }
};
exports.RuntimeConfigService = RuntimeConfigService;
exports.RuntimeConfigService = RuntimeConfigService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], RuntimeConfigService);
//# sourceMappingURL=runtime-config.service.js.map