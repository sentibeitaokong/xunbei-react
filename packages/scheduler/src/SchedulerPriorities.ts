export type PriorityLevel = 0 | 1 | 2 | 3 | 4 | 5;

// 任务优先级
// 优先级越高，值越小
export const NoPriority = 0;
export const ImmediatePriority = 1;      // 立即执行（如：输入框打字）
export const UserBlockingPriority = 2;   // 用户阻塞（如：点击按钮、滚动）
export const NormalPriority = 3;         // 正常（如：网络请求返回的数据渲染）
export const LowPriority = 4;            // 低优（如：悬浮提示、分析埋点）
export const IdlePriority = 5;           // 空闲（如：屏幕外的预渲染）

