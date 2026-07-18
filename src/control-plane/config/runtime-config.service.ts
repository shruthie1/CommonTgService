import { Injectable } from '@nestjs/common';

export const SCHEDULER_FLAGS = [
  'CMS_SCHEDULER',
  'UMS_SCHEDULER',
  'UMS_TEST_SCHEDULER',
] as const;

export type SchedulerFlag = (typeof SCHEDULER_FLAGS)[number];

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

const DEFAULTS: Record<SchedulerFlag, boolean> = {
  CMS_SCHEDULER: false,
  UMS_SCHEDULER: false,
  UMS_TEST_SCHEDULER: false,
};

/** APIs are always mounted; only these three scheduler groups are optional. */
@Injectable()
export class RuntimeConfigService {
  private readonly schedulers: Record<SchedulerFlag, boolean>;

  constructor() {
    this.schedulers = Object.fromEntries(
      SCHEDULER_FLAGS.map((flag) => [
        flag,
        bool(process.env[`ENABLE_${flag}`], DEFAULTS[flag]),
      ]),
    ) as Record<SchedulerFlag, boolean>;

    const enabledSchedulers = this.activeSchedulers();
    if (enabledSchedulers.length > 1) {
      throw new Error(
        `Only one scheduler owner may be enabled per process; received ${enabledSchedulers.join(', ')}`,
      );
    }
  }

  enabled(scheduler: SchedulerFlag): boolean {
    return this.schedulers[scheduler];
  }

  activeSchedulers(): SchedulerFlag[] {
    return SCHEDULER_FLAGS.filter((scheduler) => this.schedulers[scheduler]);
  }
}
