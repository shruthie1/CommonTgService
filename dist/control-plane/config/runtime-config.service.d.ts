export declare const SCHEDULER_FLAGS: readonly ["CMS_SCHEDULER", "UMS_SCHEDULER", "UMS_TEST_SCHEDULER"];
export type SchedulerFlag = (typeof SCHEDULER_FLAGS)[number];
export declare class RuntimeConfigService {
    private readonly schedulers;
    constructor();
    enabled(scheduler: SchedulerFlag): boolean;
    activeSchedulers(): SchedulerFlag[];
}
