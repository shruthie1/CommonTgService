# Persona Model

This document reflects the current simplified persona model across `CommonTgService`, `tg-aut`, and `promote-clients`.

## Source Of Truth

- `clients`
  - owns the shared persona pool for a `clientId`
  - fields: `firstNames`, `lastNames`, `bios`, `profilePics`, `dbcoll`
- `bufferClients`
  - owns per-account assignment and lifecycle state for the active/main account and buffer accounts
  - fields include `assignedFirstName`, `assignedLastName`, `assignedBio`, `assignedProfilePics`, `privacyUpdatedAt`, `nameBioUpdatedAt`, `profilePicsUpdatedAt`
- `promoteClients`
  - owns per-account assignment and lifecycle state for promote accounts
  - uses the same assignment/timestamp model as `bufferClients`

## Assignment Rules

- There is no persona pool versioning.
- There is no hash-based photo verification.
- `profilePics` is a plain `string[]` of URLs.
- Per-account photo assignment is stored as `assignedProfilePics`.
- Assignment is created once when missing.
- Existing assignment remains stable unless explicitly cleared or rewritten.

## Runtime Behavior

- `tg-aut`
  - reads pool data from `clients`
  - reads active-account assignment from `bufferClients`
  - verifies and corrects privacy, first name, last name, and bio
  - runs persona checks in the background so startup is not blocked
- `promote-clients`
  - reads pool data from `clients`
  - reads promote-account assignment from `promoteClients`
  - verifies and corrects privacy, first name, last name, and bio
  - runs persona checks in the background so startup is not blocked

## Photo Behavior

- Runtime services do not do hash comparison or local filename matching.
- Runtime services only trigger a CMS photo refresh when:
  - pool has at least 2 photo URLs
  - the account currently has fewer than 2 Telegram photos
  - `profilePicsUpdatedAt` exists and is in the past
- `CommonTgService` performs the actual on-demand upload from assigned photo URLs.

## Operational Notes

- This model intentionally prefers simplicity over automatic drift detection.
- If an account should be re-personalized, clear the relevant assignment/timestamp fields on the account doc.
