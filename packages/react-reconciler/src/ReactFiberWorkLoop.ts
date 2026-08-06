/**
 * ReactFiberWorkLoop.ts —— Fiber 工作循环（Render + Commit 阶段的核心调度）
 *
 * 这是 React 渲染流程的"指挥中心"，负责协调整个 Fiber 树的构建和 DOM 更新。
 *
 * 整体流程分为两大阶段：
 *
 * 1. Render 阶段（可中断，可异步）
 *    - beginWork：从根节点开始，深度优先向下遍历，处理每个 Fiber 节点
 *    - completeWork：从叶子节点开始，自底向上回溯，创建 DOM 节点
 *    - 产出：一棵完整的 workInProgress Fiber 树（finishedWork）
 *
 * 2. Commit 阶段（不可中断，同步执行）
 *    - Mutation 阶段：将 Render 阶段计算出的变更应用到真实 DOM
 *    - 切换 current 指针，使新树生效
 *
 * 调度模型：
 * - scheduleUpdateOnFiber：用户触发更新 → 标记 root → 通知 Scheduler
 * - Scheduler 在合适时机回调 performConcurrentWorkOnroot 执行实际渲染
 */

import type {FiberRoot, Fiber} from "./ReactInternalTypes";
import {ensureRootIsScheduled} from "./ReactFiberRootScheduler";
import {createWorkInProgress} from "./ReactFiber";
import {beginWork} from "./ReactFiberBeginWork";
import {completeWork} from "./ReactFiberCompleteWork";
import {commitMutationEffects} from "./ReactFiberCommitWork";

type ExecutionContext = number;

// ========== 执行上下文（位掩码位运算）==========
// React 使用位掩码标识当前所处阶段，可以组合多个状态
// 例如：executionContext & RenderContext 可判断是否在 Render 阶段

export const NoContext = /*             */ 0b0000000; // 空闲状态，没有在执行任何 React 工作
const BatchedContext = /*               */ 0b0000001; // 批量更新上下文（setState 被批处理）
export const RenderContext = /*         */ 0b0001000; // Render 阶段（正在构建 Fiber 树）
export const CommitContext = /*         */ 0b0010000; // Commit 阶段（正在执行 DOM 变更）
export const RetryAfterError = /*       */ 0b0100000; // 错误重试上下文（捕获错误后重试渲染）

// 当前 React 所处的执行上下文
let executionContext: ExecutionContext = NoContext;

// 当前正在处理的 workInProgress Fiber（工作单元指针）
let workInProgress: Fiber | null = null
// 当前正在处理的 FiberRoot（根节点容器）
let workProgressRoot: FiberRoot | null = null;

// ==============================
// 第一部分：更新调度入口
// ==============================

/**
 * 在 Fiber 上调度一个更新
 *
 * 当用户调用 setState、useState、ReactDOM.render 等方法时，
 * 最终都会调用此函数来触发一次渲染流程。
 *
 * 工作流程：
 * 1. 记录当前的 FiberRoot 和 workInProgress
 * 2. 通过 ensureRootIsScheduled 通知 Scheduler（调度器）
 * 3. Scheduler 根据优先级在合适的时机回调 performConcurrentWorkOnroot
 *
 * @param root  - 需要更新的 FiberRoot（整个应用的根节点容器）
 * @param fiber - 触发更新的 Fiber 节点（setState 所在的组件）
 */
export function scheduleUpdateOnFiber(root: FiberRoot, fiber: Fiber) {
    workProgressRoot = root;
    workInProgress = fiber;
    ensureRootIsScheduled(root)
}

/**
 * 并发工作的入口函数
 *
 * 此函数由 Scheduler（调度器）在合适的时机回调，
 * 完成从 VDom 到真实 DOM 的整个渲染流程。
 *
 * 执行流程：
 * 1. Render 阶段：调用 renderRootSync 同步构建 Fiber 树
 * 2. Commit 阶段：将构建好的 Fiber 树（finishedWork）提交到 DOM
 *    - root.current.alternate 即 Render 阶段产出的 workInProgress 树
 *
 * @param root - 需要渲染的 FiberRoot
 */
export function performConcurrentWorkOnroot(root: FiberRoot) {
    // 1. Render 阶段：构建 Fiber 树（beginWork + completeWork 的深度优先遍历）
    renderRootSync(root)
    console.log('root',root)
    // 2. Commit 阶段：将 VDom 变更应用到真实 DOM
    //    root.current.alternate 指向 Render 阶段刚刚构建完成的 workInProgress 树
    const finishedWork=root.current.alternate
    root.finishedWork = finishedWork;
    commitRoot(root)
}

// ==============================
// 第二部分：Render 阶段
// ==============================

/**
 * 同步渲染根节点（Render 阶段的主入口）
 *
 * 完成一次完整的 Render 阶段：从根节点开始的深度优先遍历，
 * 构建出一棵新的 workInProgress Fiber 树。
 *
 * 执行步骤：
 * 1. 标记进入 RenderContext（用于判断当前是否在 Render 阶段）
 * 2. prepareFreshStack：准备 workInProgress 树（复用或新建）
 * 3. wookLoopSync：同步工作循环，逐个处理 Fiber 节点直到整棵树完成
 * 4. 恢复执行上下文
 *
 * @param root - 需要渲染的 FiberRoot
 */
function renderRootSync(root: FiberRoot) {
    const prevExecutionContext = executionContext;
    executionContext |= RenderContext  // 通过位或运算标记进入 Render 阶段

    prepareFreshStack(root);          // 创建/复用 workInProgress Fiber 树
    wookLoopSync()                    // 同步循环：逐个处理 Fiber 节点

    executionContext = prevExecutionContext  // 恢复之前的上下文状态
    workProgressRoot = null
}

/**
 * 准备新的工作栈（创建 workInProgress Fiber 树）
 *
 * 在每次 Render 阶段开始时调用，基于 current 树创建 workInProgress 树。
 * 这是双缓冲机制的入口：通过 createWorkInProgress 复用或新建 Fiber 节点。
 *
 * @param root - 当前需要渲染的 FiberRoot
 * @returns 根 Fiber 对应的 workInProgress 节点
 */
function prepareFreshStack(root: FiberRoot): Fiber {
    // 清空上一次的 finishedWork（新的一轮渲染开始）
    root.finishedWork = null
    workProgressRoot = root;
    // 从根节点的 current 创建 workInProgress（双缓冲机制）
    const rootWorkInProgress = createWorkInProgress(root.current, null)
    workInProgress = rootWorkInProgress;
    return rootWorkInProgress
}

/**
 * 同步工作循环
 *
 * 这是 Render 阶段的核心循环，不断从 workInProgress 指针取出
 * 下一个待处理的 Fiber 节点，调用 performUnitOfWork 处理它，
 * 直到整棵 Fiber 树的所有节点都处理完毕（workInProgress === null）。
 *
 * 循环终止条件：所有节点的 beginWork 和 completeWork 都已完成，
 * workInProgress 指针回溯到根节点后变为 null。
 */
function wookLoopSync() {
    while (workInProgress !== null) {
        performUnitOfWork(workInProgress);
    }
}

/**
 * 处理单个 Fiber 工作单元
 *
 * 这是深度优先遍历的核心逻辑：
 *
 * 1. 调用 beginWork(current, unitOfWork) 处理当前 Fiber
 *    - beginWork 返回第一个子节点（child），表示继续向下深入
 *    - 如果返回 null，表示当前节点无子节点或子节点无需处理
 *
 * 2. 根据 beginWork 的返回值决定下一步：
 *    - 如果返回子节点 → 继续向下深入（workInProgress = next）
 *    - 如果返回 null → 调用 completeUnitOfWork 进入"归"阶段
 *      （先 completeWork 当前节点，再向上回溯寻找兄弟节点）
 *
 * @param unitOfWork - 当前需要处理的工作单元（Fiber 节点）
 */
function performUnitOfWork(unitOfWork: Fiber) {
    const current = unitOfWork.alternate;
    // 1. beginWork："递"阶段 —— 处理当前节点，返回子节点
    let next = beginWork(current, unitOfWork)
    if (next === null) {
        // 无子节点 → 进入"归"阶段：completeWork 当前节点，向上回溯
        completeUnitOfWork(unitOfWork)
    } else {
        // 有子节点 → 继续向下深度遍历
        workInProgress = next;
    }
}

/**
 * 完成一个工作单元（深度优先遍历的"归"阶段）
 *
 * 当 beginWork 返回 null（表示无子节点需要处理）时，进入此函数。
 * 它负责完成当前节点并向上回溯，寻找下一个需要处理的节点。
 *
 * 回溯顺序（核心逻辑）：
 * 1. completeWork 当前节点（创建 DOM、处理副作用等）
 * 2. 检查是否有兄弟节点（sibling）：
 *    - 有 → 兄弟节点成为下一个 workInProgress，继续 beginWork
 * 3. 无兄弟节点 → 回溯到父节点（return），重复步骤 1
 *
 * 整体遍历顺序示意：
 *   子节点 → completeWork → 兄弟节点 → completeWork →
 *   叔叔节点 → completeWork → 爷爷的兄弟节点 → ... → 根节点
 *
 * @param unitOfWork - 当前需要完成的 Fiber 节点
 */
function completeUnitOfWork(unitOfWork: Fiber) {
    let completedWork = unitOfWork;
    do {
        const current = completedWork.alternate
        const returnFiber: Fiber = completedWork.return;
        // 1. 完成当前节点的工作（创建 DOM、初始化属性等）
        let next = completeWork(current, completedWork);
        if (next !== null) {
            // completeWork 返回了新节点（特殊情况：如 Suspense 抛出新的工作）
            workInProgress = next;
            return
        }
        // 2. 尝试处理兄弟节点
        const siblingFiber = completedWork.sibling;
        if (siblingFiber !== null) {
            // 有兄弟节点 → 兄弟节点成为下一个工作单元，继续 beginWork
            workInProgress = siblingFiber;
            return
        }
        // 3. 无兄弟节点 → 回溯到父节点，继续 completeWork 循环
        completedWork = returnFiber as Fiber
        workInProgress = completedWork
    } while (completedWork !== null);
    // 回溯到根节点后 completedWork 变为 null，整棵 Fiber 树处理完毕
}

// ==============================
// 第三部分：Commit 阶段
// ==============================

/**
 * 提交根节点（Commit 阶段的主入口）
 *
 * 将 Render 阶段产出的 finishedWork（完整的 workInProgress Fiber 树）
 * 应用到真实 DOM 上。Commit 阶段是同步且不可中断的。
 *
 * 执行步骤：
 * 1. 标记进入 CommitContext
 * 2. commitMutationEffects：执行 Mutation 阶段，将 Fiber 树的变更渲染到 DOM
 * 3. 提交完成后启动新一轮的 workInProgress 树构建（为下次更新做准备）
 * 4. 恢复执行上下文
 *
 * @param root - 需要提交的 FiberRoot
 */
function commitRoot(root: FiberRoot) {
    const prevExecutionContext = executionContext;
    executionContext |= CommitContext  // 通过位或运算标记进入 Commit 阶段
    // Mutation 阶段：遍历 effect 链表，将所有 DOM 变更应用到真实 DOM
    commitMutationEffects(root,root.finishedWork) //mutation阶段,渲染dom树
    // 提交完成后，为下一次更新准备新的 workInProgress 树
    prepareFreshStack(root);          // 准备 workInProgress 树
    wookLoopSync()                    // 深度优先遍历构建 Fiber 树

    executionContext = prevExecutionContext  // 恢复上下文
    workProgressRoot = null
}
