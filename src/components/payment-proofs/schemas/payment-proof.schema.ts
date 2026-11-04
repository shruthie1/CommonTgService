import * as mongoose from 'mongoose';

/**
 * Read model of `paymentProofs` (owned and written by tg-aut: tg-platform packages/tg-db/src/collections/
 * payment-proofs.repository.ts, one row per analysed payment screenshot, TTL 7 days on createdAt).
 *
 * CMS never creates or alters indexes or the collection: autoIndex / autoCreate are off and no index is declared
 * (tg-aut's ensureIndexes owns them). strict:false keeps every field tg-aut writes (old and new row shapes) and lets
 * the review endpoint $set / $unset `review` without a schema migration. The only CMS write is `review`.
 */
export const PAYMENT_PROOF_COLLECTION = 'paymentProofs';
export const PAYMENT_PROOF_MODEL = 'PaymentProof';

export type ProofOutcome =
    | 'credited' | 'fraud_ask' | 'fake_blocked' | 'not_ours' | 'not_receipt' | 'over_limit'
    | 'old_time' | 'repeat' | 'cross_client' | 'model_blocked' | 'other';

export interface ProofVerdict {
    outcome?: ProofOutcome | string;
    reasons?: string[];
    payee?: 'ours' | 'persona' | 'foreign' | 'unknown' | string;
    fakeScore?: number | null;
    fakeSignals?: string[];
}

export interface ProofReview {
    state: 'ok';
    by: string;
    at: Date;
}

/** Fields CMS reads. Old rows (before tg-aut wrote proofId / verdict / image / ocr) lack the optional new ones. */
export interface PaymentProofRow {
    _id: mongoose.Types.ObjectId | string;
    chatId: string;
    profile: string;
    clientId: string;
    telegramMsgId: number;
    createdAt: Date;
    amount?: number;
    creditAmount?: number;
    /** sha256 of the exact downloaded bytes (exact re-send detection). */
    imageSha256?: string;
    /** Transaction id as read (tg-aut proof gate); the review model groups rows on it (reused receipts). */
    utr?: string;
    payeeUpiId?: string;
    payeeName?: string;
    /** Printed payment time as read: epochMs only when state 'known'. */
    time?: { state?: string; epochMs?: number };
    decision?: string;
    reasons?: string[];
    servedAt?: Date;
    servedService?: string;
    ask?: { kind?: string; state?: string; reasons?: string[]; blockedAt?: Date; openedAt?: Date; resolvedAt?: Date };
    proofId?: string;
    verdict?: ProofVerdict;
    image?: { host?: string; bytes?: number; mime?: string; sha256?: string; stored?: boolean };
    ocr?: Record<string, unknown>;
    review?: ProofReview;
}

export const PaymentProofSchema = new mongoose.Schema(
    {
        chatId: String,
        profile: String,
        clientId: String,
        telegramMsgId: Number,
        createdAt: Date,
        proofId: String,
        review: mongoose.Schema.Types.Mixed,
    },
    {
        collection: PAYMENT_PROOF_COLLECTION,
        strict: false,
        versionKey: false,
        autoIndex: false,
        autoCreate: false,
        timestamps: false,
        _id: true,
    },
);
