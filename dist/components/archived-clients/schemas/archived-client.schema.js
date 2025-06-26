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
exports.ArchivedClientSchema = exports.ArchivedClient = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const swagger_1 = require("@nestjs/swagger");
let ArchivedClient = class ArchivedClient {
};
exports.ArchivedClient = ArchivedClient;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '916265240911', description: 'Mobile number of the archived user' }),
    (0, mongoose_1.Prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], ArchivedClient.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1BQANOTEuM==', description: 'Current session token of the archived user' }),
    (0, mongoose_1.Prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], ArchivedClient.prototype, "session", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: ['1BQANOTEuM==', '2CRANOTEuN=='], description: 'Array of old session tokens' }),
    (0, mongoose_1.Prop)({ type: [String], default: [] }),
    __metadata("design:type", Array)
], ArchivedClient.prototype, "oldSessions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Last time the session was updated' }),
    (0, mongoose_1.Prop)({ type: Date }),
    __metadata("design:type", Date)
], ArchivedClient.prototype, "lastUpdated", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Last time sessions were cleaned up' }),
    (0, mongoose_1.Prop)({ type: Date }),
    __metadata("design:type", Date)
], ArchivedClient.prototype, "lastCleanup", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Session history for auditing purposes' }),
    (0, mongoose_1.Prop)({
        type: [{
                session: String,
                action: String,
                timestamp: { type: Date, default: Date.now },
                status: String,
                source: String
            }],
        default: []
    }),
    __metadata("design:type", Array)
], ArchivedClient.prototype, "sessionHistory", void 0);
exports.ArchivedClient = ArchivedClient = __decorate([
    (0, mongoose_1.Schema)({
        collection: 'archivedClients',
        versionKey: false,
        autoIndex: true,
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                delete ret._id;
            },
        },
    })
], ArchivedClient);
exports.ArchivedClientSchema = mongoose_1.SchemaFactory.createForClass(ArchivedClient);
//# sourceMappingURL=archived-client.schema.js.map