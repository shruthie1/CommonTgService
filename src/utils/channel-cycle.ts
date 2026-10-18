/**
 * One client's join outcome for one queued channel, as counters: the digest sums a client's rows
 * (merge 'sum') into ONE row per client. The client (tg-aut) replies to `/joinchannel?batchNotice=1`
 * with an additive `result`; an older build has none and still posts its own notice ("Old build").
 */
export interface JoinDigestRow extends Record<string, string | number> {
    Joined: number;
    Failed: number;
    'Flood wait': number;
    'No response': number;
    'Old build': number;
    'Last error': string;
}

const clip = (text: unknown, max = 70) => {
    const value = String(text ?? '').replace(/\s+/g, ' ').trim();
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

export function joinRowFromResponse(channel: string, response: { data?: any } | undefined): JoinDigestRow {
    const row: JoinDigestRow = { Joined: 0, Failed: 0, 'Flood wait': 0, 'No response': 0, 'Old build': 0, 'Last error': '' };
    if (!response) row['No response'] = 1;
    else {
        const result = response.data?.result;
        if (!result || typeof result !== 'object') row['Old build'] = 1;
        else if (result.ok === true) row.Joined = 1;
        else {
            row[result.floodWait ? 'Flood wait' : 'Failed'] = 1;
            row['Last error'] = clip(`${channel}: ${result.error ?? ''}`);
        }
    }
    return row;
}
