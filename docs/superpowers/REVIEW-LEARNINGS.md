# Review Learnings Log

Track patterns that were missed during implementation and caught during review. Used to improve the pre-implementation checklist.

## 2026-04-04 — Aggressive Channel Joining

### Findings caught by user review (not by me):

| # | Category | What was missed | Root cause | Checklist item that should have caught it |
|---|----------|----------------|------------|-------------------------------------------|
| 1 | State Propagation | clientId from HTTP trigger lost on refill | Didn't trace clientId through entry→process→drain→refill chain | Checklist #1: "If it scopes a query, does every subsequent query also respect it?" |
| 2 | Lifecycle Sequence | Join loop stops after leave work added (refill returns 0 for joins) | Didn't consider the leave→join lifecycle as a connected sequence | Checklist #2: "What triggers the next step after this one completes?" |
| 3 | Counter Accuracy | Leave doesn't decrement stored channel count | Didn't check if the reverse operation updates the counter | Checklist #5: "Is it decremented when the reverse operation happens?" |
| 4 | Failure Recovery | Leave splice before await loses channels on transient failure | Didn't check data mutation before try | Checklist #3: "What data was mutated BEFORE the try?" |
| 5 | Failure Recovery | Join shift before await loses channel on transient failure | Same as above | Checklist #3 |
| 6 | Failure Budget | No per-mobile failure tracking in join loop | Didn't ask "can a bad actor loop indefinitely?" | Checklist #3: "Is there a failure counter/budget?" |

### Pattern: 6 of 6 findings were catchable by the pre-implementation checklist.
If the checklist had been run before writing the plan, zero of these would have shipped.
