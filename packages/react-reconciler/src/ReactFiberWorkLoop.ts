// Fiber 工作循环 —— Render + Commit 阶段的核心调度

import type {FiberRoot, Fiber} from "./ReactInternalTypes";
import {ensureRootIsScheduled} from "./ReactFiberRootScheduler";
import {createWorkInProgress} from "./ReactFiber";
import {beginWork} from "./ReactFiberBeginWork";
import {completeWork} from "./ReactFiberCompleteWork";

type ExecutionContext = number;

// 执行上下文（位掩码），标识当前 React 所处的阶段
export const NoContext = /*             */ 0b0000000; // 空闲状态
const BatchedContext = /*               */ 0b0000001; // 批量更新上下文
export const RenderContext = /*         */ 0b0001000; // Render 阶段（构建 Fiber 树）
export const CommitContext = /*         */ 0b0010000; // Commit 阶段（DOM 变更）
export const RetryAfterError = /*       */ 0b0100000; // 错误重试上下文

let executionContext: ExecutionContext = NoContext;

// 当前正在处理的 workInProgress Fiber
let workInProgress: Fiber | null = null
// 当前工作的 FiberRoot
let workProgressRoot: FiberRoot | null = null;

// 在 Fiber 上调度更新：记录 workInProgress，通知 Scheduler
export function scheduleUpdateOnFiber(root: FiberRoot, fiber: Fiber) {
    workProgressRoot = root;
    workInProgress = fiber;
    ensureRootIsScheduled(root)
}

// 并发工作的入口：Scheduler 回调此函数执行实际渲染
export function performConcurrentWorkOnroot(root: FiberRoot) {
    // 1. Render 阶段：构建 Fiber 树（beginWork + completeWork）
    renderRootSync(root)
    console.log('root',root)
    // 2. Commit 阶段：VDom → DOM（待实现）
    // commitRoot(root)
}

// 同步渲染根节点，完成一次完整的 Render 阶段
function renderRootSync(root: FiberRoot) {
    const prevExecutionContext = executionContext;
    executionContext |= RenderContext  // 标记进入 Render 阶段

    prepareFreshStack(root);          // 准备 workInProgress 树
    wookLoopSync()                    // 深度优先遍历构建 Fiber 树

    executionContext = prevExecutionContext  // 恢复上下文
    workProgressRoot = null
}

// 准备新的工作栈：创建 workInProgress Fiber 树
function prepareFreshStack(root: FiberRoot): Fiber {
    root.finishedWork = null
    workProgressRoot = root;
    const rootWorkInProgress = createWorkInProgress(root.current, null)
    workInProgress = rootWorkInProgress;
    return rootWorkInProgress
}

// 同步工作循环：逐个处理 Fiber 节点直到完成
function wookLoopSync() {
    while (workInProgress !== null) {
        performUnitOfWork(workInProgress);
    }
}

// 处理单个 Fiber 工作单元：beginWork → 深度优先 → completeWork
function performUnitOfWork(unitOfWork: Fiber) {
    const current = unitOfWork.alternate;
    // 1. beginWork：处理当前节点，返回子节点
    let next = beginWork(current, unitOfWork)
    if (next === null) {
        // 无子节点 → 进入 completeWork 阶段，向上回溯
        completeUnitOfWork(unitOfWork)
    } else {
        // 有子节点 → 继续向下深度遍历
        workInProgress = next;
    }
}

// 完成工作单元：深度优先遍历的"归"阶段
// 顺序：子节点 → 兄弟节点 → 叔叔节点 → 爷爷的兄弟节点
function completeUnitOfWork(unitOfWork: Fiber) {
    let completedWork = unitOfWork;
    do {
        const current = completedWork.alternate
        const returnFiber: Fiber = completedWork.return;
        let next = completeWork(current, completedWork);  // 使用 completedWork 而非 unitOfWork
        if (next !== null) {
            workInProgress = next;
            return
        }
        // 尝试处理兄弟节点
        const siblingFiber = completedWork.sibling;
        if (siblingFiber !== null) {
            workInProgress = siblingFiber;
            return
        }
        // 回溯到父节点
        completedWork = returnFiber as Fiber
        workInProgress = completedWork
    } while (completedWork !== null);
}



