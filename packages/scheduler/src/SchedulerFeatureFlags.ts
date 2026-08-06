// 各优先级对应的超时时间（ms）
// 优先级越高，超时越短 — 任务等待被强制执行的时间阈值
export const IMMEDIATE_PRIORITY_TIMEOUT = -1;
export const USER_BLOCKING_PRIORITY_TIMEOUT = 250;
export const NORMAL_PRIORITY_TIMEOUT = 5000;
export const LOW_PRIORITY_TIMEOUT = 10000;
export const IDLE_PRIORITY_TIMEOUT = 1073741823; // 最大 32 位整数，永远不会过期