// Scheduler 包统一导出
// 重导出优先级常量并以 Scheduler 前缀命名，便于外部区分
export * from "./src/SchedulerPriorities";
export *  from "./src/Scheduler";
export {
    ImmediatePriority as ImmediateSchedulerPriority,
    UserBlockingPriority as UserBlockingSchedulerPriority,
    NormalPriority as NormalSchedulerPriority,
    LowPriority as LowSchedulerPriority,
    IdlePriority as IdleSchedulerPriority,
} from "./src/SchedulerPriorities";
export {getCurrentPriorityLevel as getCurrentSchedulerPriorityLevel} from "./src/Scheduler";

