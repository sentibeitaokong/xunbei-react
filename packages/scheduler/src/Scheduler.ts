/**
 * React Scheduler —— 单线程任务调度器
 *
 * 核心思路：
 * 1. 按优先级将任务放入最小堆（taskQueue），过期时间越早越靠前
 * 2. 通过 MessageChannel 宏任务回调批量执行任务
 * 3. 时间切片：默认每个切片 5ms，超时后让出主线程给浏览器
 * 4. 任务回调可返回 continuation，表示"未执行完，下次继续"
 * 5. 已取消/已完成的无效任务在堆顶时直接 pop 丢弃
 */

import {
    NormalPriority,
    ImmediatePriority,
    NoPriority,
    UserBlockingPriority,
    LowPriority,
    IdlePriority,
} from "./SchedulerPriorities";
import type {PriorityLevel} from "./SchedulerPriorities";
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
// 当前优先级
let currentPriorityLevel: PriorityLevel = NormalPriority;

// 就绪任务队列（最小堆，按 expirationTime 排序）
const taskQueue: Array<Task> = [];
// 延迟任务队列（最小堆，按 startTime 排序）
const timeQueue: Array<Task> = [];
// 当前时间切片的起始时间戳
let startTime = -1
// 时间切片长度（ms）
let frameInterval = 5;
// 是否正在执行任务（防重入）
let isPerformingWork = false
// 递增 ID 生成器，同优先级任务按 ID 先后排序
let taskIdCounter = 1;
// 是否已发起主线程回调
let isHostCallbackScheduled = false
// 宏任务消息循环是否已启动
let isMessageLoopRunning = false
// 是否正在等待延迟任务倒计时
let isHostTimeoutScheduled = false
// 延迟任务 setTimeout ID
let taskTimeoutID = -1

// ─── 入口：scheduleCallback ─────────────────────────────

/**
 * 向调度器注册一个任务
 * 1. 计算 startTime（有 delay 则延后）和 expirationTime
 * 2. 有延迟 → 推入 timeQueue，启动/刷新倒计时
 * 3. 无延迟 → 推入 taskQueue，必要时启动主线程回调
 */
export function scheduleCallback(priorityLevel: PriorityLevel, callback: Callback, options?: { delay: number }) {
    const currentTime = getCurrentTime()
    let startTime
    if(typeof options==='object'&&options!==null){
        let delay=options.delay
        if(typeof options==='number'&&delay>0){
            //有效的延迟时间
            startTime=currentTime+delay
        }else{
            //无效的延迟时间
            startTime=currentTime
        }
    }else{
        startTime=currentTime
    }
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
    // 过期时间：超过此时间点任务必须执行
    const expirationTime = startTime + timeout
    const newTask: Task = {
        id: taskIdCounter++,
        callback,
        priorityLevel,
        startTime,
        expirationTime,
        sortIndex: -1,
    }
    if (startTime > currentTime) {
        // 延迟任务：按 startTime 排入 timeQueue
        newTask.sortIndex = startTime
        push(timeQueue, newTask)
        // 当前 taskQueue 为空且自身为 timeQueue 堆顶 → 启动倒计时
        if (peek(taskQueue) == null && newTask === peek(timeQueue)) {
            if (isHostTimeoutScheduled) {
                // 已有其他任务占着调度位，取消旧倒计时
                cancelHostTimeout()
            } else {
                isHostTimeoutScheduled = true
            }
            requestHostTimeout(handleTimeout, startTime - currentTime)
        }
    } else {
        // 无延迟：按 expirationTime 排入 taskQueue
        newTask.sortIndex = expirationTime;
        push(taskQueue, newTask);

        if (!isPerformingWork && !isHostCallbackScheduled) {
            isHostCallbackScheduled = true;
            requestHostCallback()
        }
    }
}

// ─── 调度控制 ───────────────────────────────────────────

/** 启动主线程回调（若消息循环未启动） */
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

/** 每个宏任务的入口：记录切片起点 → flushWork → 有剩余则继续调度 */
function performWorkUntilDeadline() {
    if (isMessageLoopRunning) {
        const currentTime = getCurrentTime()
        // 记录本次切片起始时间
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
 * 启动一轮工作循环：
 * - 置锁 isPerformingWork
 * - 保存/恢复上一轮优先级
 * @returns workLoop 返回值：是否还有剩余任务
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
 * 取消当前任务：将 callback 置 null
 * 最小堆不支持随机删除，workLoop 在消费时发现 null 则自动丢弃
 */
export function cancelCallback(): void {
    currentTask!.callback = null;
}

// ─── 核心工作循环 ───────────────────────────────────────

/**
 * 核心工作循环 —— 在时间切片内持续消费 taskQueue
 *
 * 流程：
 * while 堆顶有任务：
 *   1. 未过期 且 时间切片用尽 → break 让出主线程
 *   2. callback 有效 → 置空原 callback 后执行
 *   3. 返回 continuation → 挂回 callback，下次继续
 *   4. 返回 null/undefined → 任务完成，pop 出堆
 *   5. callback 为 null（已取消）→ pop 丢弃
 *
 * @returns true: 还有任务未完成  false: 队列清空
 */
function workLoop(initialTime: number): boolean {
    let currentTime = initialTime;
    advanceTimers(currentTime)
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

            // didTimeout: true → 任务已过期
            const didTimeout = currentTask.expirationTime <= currentTime
            const continuationCallback = callback(didTimeout)
            // 执行后刷新当前时间
            currentTime = getCurrentTime()
            if (typeof continuationCallback === "function") {
                // 未执行完，将 continuation 挂回任务，下次循环继续
                currentTask.callback = continuationCallback
                advanceTimers(currentTime)
                return true
            } else {
                // 执行完毕，若仍是堆顶则 pop 移除
                if (currentTask === peek(taskQueue)) {
                    pop(taskQueue)
                }
                advanceTimers(currentTime)
            }
        } else {
            // 无效任务（已取消或 callback 非法），直接丢弃
            pop(taskQueue)
        }

        // 取下一个堆顶任务
        currentTask = peek(taskQueue)
    }
    // taskQueue 清空后：检查是否有延迟任务到期，有则设倒计时
    if (currentTask !== null) {
        return true
    } else {
        const firstTimer = peek(timeQueue)
        if (firstTimer) {
            requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime)
        }
        return false
    }
}

// ─── 辅助方法 ───────────────────────────────────────────

/** 获取当前正在执行任务的优先级（供外部读取） */
export function getCurrentPriorityLevel(): PriorityLevel {
    return currentPriorityLevel
}

/**
 * 判断是否应让出主线程
 * 条件：从本时间切片开始起算，已耗时 >= frameInterval（默认 5ms）
 * @returns true → 让出主线程，false → 继续执行
 */
export function shouldYieldToHost(): boolean {
    const timeElapsed = getCurrentTime() - startTime
    return timeElapsed >= frameInterval
}
/** 取消当前延迟倒计时 */
function cancelHostTimeout() {
    clearTimeout(taskTimeoutID);
    taskTimeoutID = -1;
}

/** 启动延迟倒计时，到期后执行 callback */
function requestHostTimeout(callback: Callback, ms: number) {
    taskTimeoutID = setTimeout(() => {
        callback(getCurrentTime());
    }, ms);
}

/** 延迟倒计时到期回调：将到期任务从 timeQueue 转入 taskQueue，视情况启动工作循环 */
function handleTimeout(currentTime: number) {
    isHostTimeoutScheduled = false
    advanceTimers(currentTime)
    if (!isHostCallbackScheduled) {
        if (peek(taskQueue) !== null) {
            isHostCallbackScheduled = true
            requestHostCallback()
        } else {
            const firstTimer = peek(timeQueue)
            if (firstTimer !== null) {
                requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime)
            }
        }
    }
}

/** 将 timeQueue 中所有延迟已到期的任务转入 taskQueue */
function advanceTimers(currentTime: number) {
    let timer = peek(timeQueue)
    while (timer !== null) {
        if (timer.callback === null) {
            // 已取消，丢弃
            pop(timeQueue)
        } else if (timer.startTime <= currentTime) {
            // 延迟到期，转入 taskQueue
            pop(timeQueue)
            timer.sortIndex = timer.expirationTime
            push(taskQueue, timer)
        } else {
            // 堆顶未到期，后续任务也不会到期（最小堆），提前退出
            return
        }
        timer = peek(timeQueue)
    }
}
