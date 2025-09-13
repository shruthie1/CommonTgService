import { Logger as NestLogger } from '@nestjs/common';
import chalk from 'chalk';

export class Logger extends NestLogger {
  log(message: any, context?: any) {
    console.log(this.formatMessage('LOG', message, chalk.green, context));
  }

  info(message: any, context?: any) {
    console.log(this.formatMessage('INFO', message, chalk.white, context));
  }

  error(message: any,context?: any, trace?: any) {
    console.error(
      this.formatMessage('ERROR', message, chalk.red, context),
      trace ? chalk.red(trace) : '',
    );
  }

  warn(message: any, context?: any) {
    console.warn(this.formatMessage('WARN', message, chalk.yellow, context));
  }

  debug(message: any, context?: any) {
    console.debug(this.formatMessage('DEBUG', message, chalk.cyan, context));
  }

  verbose(message: any, context?: any) {
    console.debug(this.formatMessage('VERBOSE', message, chalk.gray, context));
  }

  private formatMessage(
    level: string,
    message: any,
    levelColor: (msg: string) => string,
    context?: any,
  ) {
    const msg =
      typeof message === 'object'
        ? JSON.stringify(message, null, 2)
        : String(message);

    const ctx =
      context !== undefined
        ? chalk.magenta(
            `[${typeof context === 'object'
              ? JSON.stringify(context, null, 2)
              : context}]`,
          )
        : '';

    return `${levelColor(`[${level}]`)}${ctx ? ' ' + ctx : ''} ${chalk.green(
      msg,
    )}`;
  }
}
