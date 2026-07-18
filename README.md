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

| Owner | Enable flag |
| --- | --- |
| CMS | `ENABLE_CMS_SCHEDULER` |
| UMS | `ENABLE_UMS_SCHEDULER` |
| UMS-test | `ENABLE_UMS_TEST_SCHEDULER` |

Enable at most one scheduler flag per process. UMS-test's group includes its
legacy account-maintenance and daily reset jobs, so it must use its isolated
configuration and database.

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
configuration, set the real configuration URLs, and keep UMS-test on an
isolated configuration/database. Never enable a destructive operation on more
than one process.

## Verification

```bash
npm run build
npm run webpack -- --config ./webpack-prod.config.ts
npm test
```
