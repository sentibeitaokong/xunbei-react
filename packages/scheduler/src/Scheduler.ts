/**
 * React Scheduler —— 单线程任务调度器
 *
 * 核心思路：
 * 1. 按优先级将任务放入最小堆（taskQueue），过期时间越早越靠前
 * 2. 通过 MessageChannel 的宏任务回调，在每帧之内执行任务
 * 3. 时间切片：默认每帧 5ms，超时后让出主线程给浏览器渲染
 * 4. 任务回调可返回一个 continuation 函数，表示"还没执行完，下次继续"
 * 5. 已取消或已完成的无效任务，在堆顶时直接 pop 清理
 */

import {
    NormalPriority,
    ImmediatePriority,
    NoPriority,
    UserBlockingPriority,
    LowPriority,
    IdlePriority,
    PriorityLevel
} from "./SchedulerPriorities";
import {
    IMMEDIATE_PRIORITY_TIMEOUT,
    USER_BLOCKING_PRIORITY_TIMEOUT,
    NORMAL_PRIORITY_TIMEOUT,
    LOW_PRIORITY_TIMEOUT,
    IDLE_PRIORITY_TIMEOUT
} from "./SchedulerFeatureFlags";
import {getCurrentTime} from 'shared/utils'
import {peek, pop, push} from "./SchedulerMinHeap";

// ─── 类型定义 ───────────────────────────────────────────

export type Task = {
    id: number,                          // 递增 ID，同优先级任务排序兜底
    callback: Callback | null,           // 任务回调；cancel 后置 null
    priorityLevel: PriorityLevel,        // 优先级
    startTime: number,                   // 任务创建时间
    expirationTime: number,              // 过期时间 = startTime + timeout（超过此时间任务必须执行）
    sortIndex: number,                   // 最小堆排序依据，实际值为 expirationTime
}

// 任务回调：入参 didTimeout 表示是否已超时
// 返回函数 → 任务未执行完，返回的函数即为 continuation
// 返回 null/undefined → 任务执行完毕
type Callback = (didTimeout: boolean) => Callback | null | undefined

// ─── 全局状态 ───────────────────────────────────────────

// 当前正在执行的任务
let currentTask: Task | null = null;
// 当前任务的优先级
let currentPriorityLevel: PriorityLevel = NoPriority;

// 任务池（最小堆，peek 返回 expirationTime 最小的任务）
const taskQueue: Array<Task> = [];
// 当前时间切片的起始时间戳
let startTime = -1
// 时间切片长度（ms），每一帧留给任务执行的最大时长
let frameInterval = 5;
// 锁：是否正在执行任务（防止重入）
let isPerformingWork = false
// 递增 ID 生成器，同优先级任务按 ID 先后排序
let taskIdCounter = 1;
// 锁：是否已向主线程发起调度请求
let isHostCallbackScheduled = false
// 锁：宏任务消息循环是否已启动
let isMessageLoopRunning = false

// ─── 入口：scheduleCallback ─────────────────────────────

/**
 * 向调度器注册一个任务
 * 1. 根据优先级计算 expirationTime（过期时间 = 当前时间 + 超时阈值）
 * 2. 将任务推入最小堆
 * 3. 若当前无任务执行且未发起调度，则启动调度
 */
export function scheduleCallback(priorityLevel: PriorityLevel, callback: Callback) {
    const currentTime = getCurrentTime()
    let timeout: number;

    // 优先级 → 超时阈值映射：优先级越高，容忍等待时间越短
    switch (priorityLevel) {
        case ImmediatePriority:
            timeout = IMMEDIATE_PRIORITY_TIMEOUT;   // 立即执行，超时为负/接近 0
            break;
        case UserBlockingPriority:
            timeout = USER_BLOCKING_PRIORITY_TIMEOUT; // 用户交互的阻塞任务
            break;
        case IdlePriority:
            timeout = IDLE_PRIORITY_TIMEOUT;         // 空闲时执行，超时意味着"永不强制"
            break;
        case LowPriority:
            timeout = LOW_PRIORITY_TIMEOUT;
            break;
        case NormalPriority:
        default:
            timeout = NORMAL_PRIORITY_TIMEOUT;
            break;
    }

    // 过期时间：超过此时间点，任务被视为"必须执行"
    const expirationTime = currentTime + timeout

    const newTask: Task = {
        id: taskIdCounter++,
        callback,
        priorityLevel,
        startTime: currentTime,
        expirationTime,
        sortIndex: -1,
    }
    // 按过期时间排入最小堆，越早过期越先执行
    newTask.sortIndex = expirationTime;
    push(taskQueue, newTask);

    // 当前无任务执行且未发起调度 → 启动主线程回调
    if (!isPerformingWork && !isHostCallbackScheduled) {
        isHostCallbackScheduled = true;
        requestHostCallback()
    }
}

// ─── 调度控制 ───────────────────────────────────────────

/** 请求主线程回调：若消息循环未启动，则启动之 */
function requestHostCallback() {
    if (!isMessageLoopRunning) {
        isMessageLoopRunning = true;
        schedulePerformWorkUntilDeadline()
    }
}

/**
 * 通过 MessageChannel 将 flushWork 推迟到下一个宏任务中执行
 * 选择 MessageChannel 而非 setTimeout，因为：
 * - MessageChannel 无最小延迟（setTimeout 嵌套后有 4ms 下限）
 * - 宏任务执行时机早于 requestAnimationFrame 之后的渲染阶段
 */
const channel = new MessageChannel();
const port = channel.port2
channel.port1.onmessage = performWorkUntilDeadline

/** 每个宏任务的入口：记录时间切片起点 → flushWork → 有剩余任务则继续调度 */
function performWorkUntilDeadline() {
    if (isMessageLoopRunning) {
        const currentTime = getCurrentTime()
        // 记录本次宏任务开始时间，作为该时间切片的基准
        startTime = currentTime
        let hasMoreWork = true
        try {
            hasMoreWork = flushWork(currentTime)
        } finally {
            if (hasMoreWork) {
                // 还有任务，再发起一个宏任务继续执行
                schedulePerformWorkUntilDeadline()
            } else {
                // 队列清空，停止消息循环
                isMessageLoopRunning = false
            }
        }
    }
}

/** 向 port2 发送消息，触发下一个宏任务 */
function schedulePerformWorkUntilDeadline() {
    port.postMessage(null)
}

/**
 * 开始一轮工作循环：
 * - 置锁 isPerformingWork，防止并发
 * - 保存并恢复上一轮优先级状态
 */
function flushWork(initialTime: number) {
    isHostCallbackScheduled = false
    isPerformingWork = true
    const previousPriorityLevel = currentPriorityLevel
    try {
        return workLoop(initialTime)
    } finally {
        // 无论正常/异常退出，都恢复状态
        currentTask = null;
        currentPriorityLevel = previousPriorityLevel
        isPerformingWork = false
    }
}

// ─── 任务取消 ───────────────────────────────────────────

/**
 * 取消当前任务
 * 最小堆不支持随机删除，因此只将 callback 置 null
 * 当该任务被 pop 或被 workLoop 消费时，发现 callback 为 null 则直接丢弃
 */
export function cancelCallback(): void {
    currentTask!.callback = null;
}

// ─── 核心工作循环 ───────────────────────────────────────

/**
 * 核心工作循环 —— 时间切片内持续消费任务队列
 *
 * 流程：
 * while 堆顶有任务：
 *   1. 若任务未过期 且 时间切片用尽 → break 让出主线程
 *   2. 取出 callback 执行
 *   3. 若返回 continuation → 放回当前任务的 callback，下次继续
 *   4. 若返回 null/undefined → 任务完成，pop 出堆
 *   5. 若 callback 为 null（已取消）→ pop 丢弃
 *
 * @returns true: 还有任务未执行完  false: 队列清空
 */
function workLoop(initialTime: number): boolean {
    let currentTime = initialTime;
    currentTask = peek(taskQueue)

    while (currentTask !== null) {
        // 过期判断 & 时间切片判断 → 决定是否让出主线程
        // 注意：一旦任务已过期（expirationTime <= currentTime），即使超切片也要执行
        if (currentTask.expirationTime > currentTime && shouldYieldToHost()) {
            break;
        }

        const callback = currentTask.callback;

        if (typeof callback === "function") {
            // 有效任务：置空原 callback，正式执行
            currentTask.callback = null
            currentPriorityLevel = currentTask.priorityLevel

            // didTimeout: true → 任务已过期，回调需要尽快完成
            const didTimeout = currentTask.expirationTime <= currentTime
            const continuationCallback = callback(didTimeout)

            if (typeof continuationCallback === "function") {
                // 未执行完，将 continuation 挂回任务，下次循环继续
                currentTask.callback = continuationCallback
                return true
            } else {
                // 执行完毕，若仍是堆顶则 pop 移除
                if (currentTask === peek(taskQueue)) {
                    pop(taskQueue)
                }
            }
        } else {
            // 无效任务（已取消或 callback 非法），直接丢弃
            pop(taskQueue)
        }

        // 取下一个堆顶任务
        currentTask = peek(taskQueue)
    }

    // 返回队列是否非空
    return currentTask !== null
}

// ─── 辅助方法 ───────────────────────────────────────────

/** 获取当前正在执行任务的优先级（供外部读取） */
export function getCurrentPriorityLevel(): PriorityLevel {
    return currentPriorityLevel
}

/**
 * 判断是否应让出主线程：React 主动暂停自己的 JS 执行，把主线程的控制权还给浏览器
 * 条件：从本时间切片开始起算，已耗时 >= frameInterval（默认 5ms）
 * true 任务过期急需立即完成 false 让出主线程,配合时间切片慢慢做
 */
export function shouldYieldToHost(): boolean {
    const timeElapsed = getCurrentTime() - startTime
    return timeElapsed >= frameInterval
}
