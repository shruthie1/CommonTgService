<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

# Common Telegram Service for NestJS

## Installation

Add this package as a dependency in your NestJS project's package.json, using the `dist` branch:

```json
{
  "dependencies": {
    "common-tg-service": "github:your-username/common-tg-service#dist"
  }
}
```

This will only download the compiled dist files and package.json, making updates much faster.

## Peer Dependencies

This package uses peer dependencies to avoid duplicate node_modules in your project. Make sure your project has the following dependencies installed:

```json
{
  "@nestjs/common": "^10.0.0",
  "@nestjs/config": "^3.0.0",
  "@nestjs/core": "^10.0.0",
  "@nestjs/mongoose": "^10.0.0",
  "@nestjs/platform-express": "^10.0.0",
  "@nestjs/swagger": "^8.0.0",
  "mongoose": "^8.0.0",
  "rxjs": "^7.0.0",
  "telegram": "^2.19.0",
  "class-transformer": "^0.5.0",
  "class-validator": "^0.14.0",
  "axios": "^1.6.0",
  "node-fetch": "^2.7.0",
  "swagger-jsdoc": "^6.2.0",
  "swagger-ui-express": "^5.0.0",
  "adm-zip": "^0.5.0",
  "cloudinary": "^2.0.0",
  "imap": "^0.8.0",
  "https": "^1.0.0"
}
```

## Prerequisites

Make sure your project has the following peer dependencies:
```json
{
  "@nestjs/common": "^10.0.0",
  "@nestjs/config": "^3.0.0",
  "@nestjs/core": "^10.0.0",
  "@nestjs/mongoose": "^10.0.0",
  "@nestjs/platform-express": "^10.0.0",
  "@nestjs/swagger": "^8.0.0",
  "mongoose": "^8.0.0",
  "rxjs": "^7.0.0",
  "telegram": "^2.0.0"
}
```

These dependencies should already be in your NestJS project, so no additional installation is needed.

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Usage

Import the modules you need in your NestJS application:

```typescript
import { TelegramModule, ChannelsModule /* other modules */ } from 'common-tg-service';

@Module({
  imports: [
    TelegramModule,
    ChannelsModule,
    // ... other modules you need
  ],
})
export class AppModule {}
```

## Updating

To update the package, simply run:
```bash
npm update common-tg-service
```

This will only update the compiled dist files from the dist branch, without re-downloading dependencies.

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://kamilmysliwiec.com)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](LICENSE).
