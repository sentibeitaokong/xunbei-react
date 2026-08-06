// 调度入口 —— 将 Fiber 更新任务注册到 Scheduler

import type {FiberRoot} from "./ReactInternalTypes";
import {scheduleCallback} from 'scheduler/src/Scheduler'
import {NormalPriority} from 'scheduler/src/SchedulerPriorities'
import {performConcurrentWorkOnroot} from "./ReactFiberWorkLoop";

// 确保根节点有调度任务，通过微任务延迟到本轮事件循环结束后执行
export function ensureRootIsScheduled(root: FiberRoot) {
    queueMicrotask(() => {
        scheduleTaskForRootDuringMincrotask(root);
    })
}

// 将根节点的并发工作注册到 Scheduler，以 NormalPriority 执行
function scheduleTaskForRootDuringMincrotask(root: FiberRoot) {
    scheduleCallback(NormalPriority, performConcurrentWorkOnroot.bind(null, root))
}