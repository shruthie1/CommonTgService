# Persona Cleanup Summary

The original persona-pool rollout plan was superseded by a simpler production model.

## Final Decisions

- Keep persona pool data only on `clients`
- Keep per-account assignment only on `bufferClients` and `promoteClients`
- Store photos as plain URL strings
- Remove filename-based photo handling
- Remove pool versioning
- Remove hash-based photo verification
- Run runtime persona maintenance in the background instead of blocking startup

## Current Implementation Shape

- `CommonTgService`
  - exposes persona pool data to runtimes
  - exposes on-demand photo refresh endpoints for buffer and promote accounts
  - uploads assigned profile pics from URLs
- `tg-aut`
  - updates privacy and profile text directly
  - triggers photo refresh in the background when fallback conditions are met
- `promote-clients`
  - updates privacy and profile text directly
  - triggers photo refresh in the background when fallback conditions are met

## Migration Guidance

- Populate `clients.firstNames` at minimum for each client
- Add `lastNames`, `bios`, and `profilePics` URLs when needed
- Do not store persona assignment on `clients`
- Maintain `profilePicsUpdatedAt`, `privacyUpdatedAt`, and `nameBioUpdatedAt` on the per-account docs
