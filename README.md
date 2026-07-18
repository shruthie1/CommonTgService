# Common Telegram Service

This repository is the deployable NestJS control plane for the Telegram
automation platform. It contains the shared CMS, UMS, and UMS-test API and
worker logic; it is not an npm package and must not be published. The former
`ams-ssk` source is vendored as the first-party `components/files` module, so
the file/folder asset APIs are included in the same deployable artifact.

## One artifact, operation-specific processes

`npm run webpack -- --config ./webpack-prod.config.ts` produces `out/index.js`.
The upload workflow stores the main-branch artifact under `cts-main`. CMS, UMS,
and UMS-test each load that same artifact. HTTP APIs remain available on every
process; exactly three environment variables gate the scheduler groups.

All scheduler flags default to `false`.

| Owner | Enable flag | Responsibility |
| --- | --- | --- |
| CMS | `ENABLE_CMS_SCHEDULER` | Buffer-client checks, joins, refresh, and buffer READY rotation |
| UMS | `ENABLE_UMS_SCHEDULER` | Primary-client join/leave and retention, plus the complete promote-client lifecycle: checks, joins, info refresh, daily promotion-stat reset, and promote READY rotation |
| UMS-test | `ENABLE_UMS_TEST_SCHEDULER` | Raw-user processing and general maintenance: map/stat cleanup and word-restriction reset |

Enable exactly one scheduler flag per process. All three processes may use the
same intended production configuration and database: ownership is enforced by
the scheduler flag, and raw-user processing excludes every buffer/promote pool
mobile so it cannot open a lifecycle-owned Telegram session.

At startup, each worker logs its enabled owner and every registered job. Job
start/completion/failure, startup-task outcomes, UMS channel-cycle branch
(`join` or `leave-all`), and raw-user pool exclusions are logged with the
service name. These are the first log lines to use when verifying a PM2
deployment.

The Assets module exposes its file/folder API on every process. It contains no
background worker, preserving the three scheduler groups above.

## Build and upload

```bash
npm install
npm run build
npm run webpack -- --config ./webpack-prod.config.ts
npm run upload-build -- main
```

`upload-build` writes `cts-main` to the `/builds` metadata service. No npm
authentication, version bump, or `npm publish` is part of this flow.

## Deployment

Use the VM/PM2 fleet. The loader process must have CommonTgService's runtime
dependencies installed (`@nestjs/*`, Mongoose, GramJS, Sharp, Redis, and so
on), because webpack deliberately leaves Node dependencies external. Do not use
Kubernetes for this deployment.

Copy `.env.example` and `ecosystem.config.example.cjs` into the deployment
configuration, set the real configuration URLs, and enable exactly one
scheduler flag on each process. Never run the same scheduler owner twice.

## Verification

```bash
npm run build
npm run webpack -- --config ./webpack-prod.config.ts
npm test
```
