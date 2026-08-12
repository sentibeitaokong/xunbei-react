/**
 * ReactFiberBeginWork.ts —— beginWork："递"阶段的核心函数
 *
 * 在 React 的 Render 阶段，beginWork 负责 Fiber 树的深度优先"递"遍历。
 * 它从根节点开始，逐层向下处理每个 Fiber 节点。
 *
 * beginWork 的职责：
 * 1. 根据 Fiber.tag 判断节点类型，派发到对应的处理函数
 * 2. 对于"容器型"节点（HostRoot、HostComponent、Fragment、组件等），
 *    取出 pendingProps.children，调用 reconcileChildren 协调子节点
 * 3. 对于"叶子型"节点（HostText），直接返回 null（文本无子节点）
 * 4. 返回第一个子节点 → 引导深度优先遍历继续向下
 *
 * 整体遍历流程（搭配 completeWork）：
 *   beginWork(A) → 返回 child → beginWork(child) → ... → 到达叶子节点
 *   → completeWork(叶子) → completeWork(父节点) → ... → 回到根节点
 *
 * 各节点类型的处理逻辑：
 * - HostRoot（根节点）          → 取出 memoizedState.element，协调子节点
 * - HostComponent（原生标签）   → 取出 pendingProps.children，协调子节点
 * - FunctionComponent（函数组件）→ 调用 renderWithHooks 执行组件，协调返回的 JSX
 * - ClassComponent（类组件）    → 实例化组件，调用 render()，协调返回的 JSX
 * - Fragment（片段）            → 取出 pendingProps.children，协调子节点
 * - HostText（文本）            → 无子节点，直接返回 null
 */

import type {Fiber} from "./ReactInternalTypes";
import {HostRoot, HostComponent, HostText, Fragment, ClassComponent, FunctionComponent} from "./ReactWorkTags";
import {mountChildFibers, reconcileChildFibers} from "./ReactChildFiber";
import {shouldSetTextContent} from '../../react-dom/client/ReactDOMHostConfig'
import {renderWithHooks} from "./ReactFiberHooks";

/**
 * beginWork —— "递"阶段入口函数
 *
 * 根据 workInProgress.tag 判断当前正在处理的 Fiber 类型，
 * 派发到对应的处理函数。
 *
 * 每种处理函数都需要返回子节点（或 null），
 * 以引导深度优先遍历的进行方向。
 *
 * @param current        - current 树中对应的 Fiber（首次渲染时为 null）
 * @param workInProgress - 当前正在处理的 workInProgress Fiber
 * @returns 第一个子 Fiber，或 null（无子节点需处理）
 */
export function beginWork(
    current: Fiber | null,
    workInProgress: Fiber
): Fiber | null {
    switch (workInProgress.tag) {
        case HostRoot:
            return updateHostRoot(current, workInProgress);
        case HostComponent:
            return updateHostComponent(current, workInProgress);
        case HostText:
            return updateHostText(current, workInProgress);
        case Fragment:
            return updateHostFragment(current, workInProgress);
        case ClassComponent:
            return updateClassComponent(current, workInProgress);
        case FunctionComponent:
            return updateFunctionComponent(current, workInProgress);
    }

    // 未知的 Fiber.tag → 抛出错误（应该永远不会到达这里）
    throw new Error(
        `Unknown unit of work tag (${workInProgress.tag}). This error is likely caused by a bug in ` +
        'React. Please file an issue.',
    );
}

/**
 * updateHostRoot —— 处理根 Fiber 节点
 *
 * HostRoot 是整个 Fiber 树的根，它的 memoizedState.element 存储着
 * 用户传入 render() 的顶层 JSX 元素。
 *
 * 处理步骤：
 * 1. 从 workInProgress.memoizedState.element 取出顶层子元素
 * 2. 调用 reconcileChildren 协调生成子 Fiber
 * 3. Update 阶段：将 workInProgress.child 同步给 current（确保双缓冲一致）
 * 4. 返回子 Fiber → 继续向下遍历
 *
 * @param current        - current 树上的 HostRoot Fiber
 * @param workInProgress - workInProgress 树上的 HostRoot Fiber
 * @returns HostRoot 的第一个子 Fiber
 */
function updateHostRoot(
    current: Fiber | null,
    workInProgress: Fiber
) {
    // memoizedState.element 在 ReactDOM.createRoot().render() 时写入
    const nextChildren = workInProgress.memoizedState.element;

    // 协调子节点：将 JSX 元素转换为 Fiber 节点
    reconcileChildren(current, workInProgress, nextChildren);

    // Update 阶段：同步 current.child 引用
    // 确保 current 树和 workInProgress 树指向同一个子 Fiber 链表
    if (current) {
        current.child = workInProgress.child;
    }

    return workInProgress.child;
}

/**
 * updateHostComponent —— 处理原生标签 Fiber（div, span, p 等）
 *
 * 对于原生 HTML 标签：
 * 1. 检查是否为"单个文本子节点"的情况（如 <div>hello</div>）
 *    - 如果是：文本不作为独立的 Fiber 处理，而是设置为 DOM 的 textContent
 *    - 直接返回 null，跳过 beginWork，直接进入 completeWork
 * 2. 如果不是：取出 pendingProps.children，正常协调子节点
 *
 * 这个优化避免了为简单的文本内容创建额外的 Fiber 节点。
 *
 * @param current        - current 树上的对应 Fiber
 * @param workInProgress - 正在处理的 workInProgress Fiber
 * @returns 子 Fiber 或 null
 */
function updateHostComponent(
    current: Fiber | null,
    workInProgress: Fiber
) {
    const {type, pendingProps} = workInProgress;

    // shouldSetTextContent 判断子节点是否为单个纯文本
    // 如果是，直接在 completeWork 阶段将其设为 DOM 的 textContent
    const isDirectTextChild = shouldSetTextContent(type, pendingProps);

    if (isDirectTextChild) {
        // 跳过子节点的 Fiber 创建，文本将作为父标签的属性处理
        return null;
    }

    // 正常情况：取出 children 进行子节点协调
    const nextChildren = workInProgress.pendingProps.children;
    reconcileChildren(current, workInProgress, nextChildren);

    return workInProgress.child;
}

/**
 * updateHostText —— 处理文本 Fiber
 *
 * 文本节点没有子节点，也无需协调。
 * 文本内容在 completeWork 阶段创建 DOM 文本节点。
 * 直接返回 null 表示进入"归"阶段。
 *
 * @returns 始终返回 null（文本无子节点）
 */
function updateHostText(current: Fiber | null, workInProgress: Fiber) {
    return null;
}

/**
 * updateHostFragment —— 处理 Fragment Fiber
 *
 * Fragment 是透明的"虚拟容器"：不创建 DOM 节点，但它的子节点需要正常处理。
 * 所以直接取出 pendingProps.children 进行协调。
 *
 * 注意：Fragment 的 pendingProps.children 实际上存储在 props.children 中，
 * 因为在 JSX 编译时 Fragment 和普通标签一样处理。
 *
 * @returns Fragment 的第一个子 Fiber
 */
function updateHostFragment(current: Fiber | null, workInProgress: Fiber) {
    const nextChildren = workInProgress.pendingProps.children;
    reconcileChildren(current, workInProgress, nextChildren);
    return workInProgress.child;
}

/**
 * updateClassComponent —— 处理类组件 Fiber
 *
 * 类组件的处理流程：
 * 1. 从 type 拿到组件类（class XXX extends Component）
 * 2. new type(pendingProps) 实例化 → 调用构造函数
 * 3. instance.render() → 获取 JSX 输出
 * 4. reconcileChildren → 协调 JSX 生成子 Fiber
 *
 * 注意：当前简化实现每次更新都会重新 new 实例。
 * 真实 React 中，组件实例在 mount 时创建并存储在 Fiber.stateNode，
 * update 时复用同一个实例。
 *
 * @returns 类组件的第一个子 Fiber
 */
function updateClassComponent(current: Fiber | null, workInProgress: Fiber) {
    const {type, pendingProps} = workInProgress;

    // 实例化类组件：调用 constructor(props)
    const instance = new type(pendingProps);

    // 调用 render() 获取类组件返回的 JSX
    // 并将实例保存在 stateNode 上（供后续生命周期调用和 ref 使用）
    const children = instance.render();

    reconcileChildren(current, workInProgress, children);

    return workInProgress.child;
}

/**
 * updateFunctionComponent —— 处理函数组件 Fiber
 *
 * 函数组件的处理流程：
 * 1. 调用 renderWithHooks → 设置 Hooks 上下文
 * 2. Component(pendingProps) → 执行函数组件本身
 *    函数内部可能调用 useReducer 等 Hook →
 *    Hook 函数通过 currentlyRenderingFiber 找到所属的 Fiber
 * 3. 拿到函数返回的 JSX → reconcileChildren 协调子节点
 *
 * renderWithHooks 和直接调用 Component 的区别：
 * - renderWithHooks 会在调用前后设置/清理全局 Hooks 上下文
 * - 直接调用 Component 不会感知 Hook 的调用，无法正确关联状态
 *
 * @returns 函数组件的第一个子 Fiber
 */
function updateFunctionComponent(current: Fiber | null, workInProgress: Fiber) {
    const {type, pendingProps} = workInProgress;

    // 通过 renderWithHooks 执行函数组件
    // 内部会设置 currentlyRenderingFiber 等全局变量
    // 这样 useReducer 等 Hook 才知道"自己属于哪个组件"
    const children = renderWithHooks(current, workInProgress, type, pendingProps);

    // 协调函数组件返回的 JSX
    reconcileChildren(current, workInProgress, children);

    return workInProgress.child;
}

/**
 * reconcileChildren —— 统一协调子节点
 *
 * 将协调逻辑集中在此函数中，根据 current 是否为 null
 * 自动选择 mount 或 reconcile 策略：
 *
 * - current === null（首次渲染）→ mountChildFibers：不标记副作用
 *   因为整棵树都是新的，在 Commit 阶段一次性插入即可
 *
 * - current !== null（更新）→ reconcileChildFibers：标记 Placement 等副作用
 *   需要精确标记哪些节点是新增的、哪些是删除的、哪些是移动的
 *
 * 这两种策略的区别：
 * - mount 模式生成的 DOM 在 completeWork 的 appendAllChildren 中直接挂载
 * - update 模式需要通过 flags 标记，在 Commit 阶段逐一处理
 *
 * @param current        - current 树上的对应 Fiber（null 表示首次渲染）
 * @param workInProgress - 当前处理的 workInProgress Fiber
 * @param nextChildren   - 新的子节点（JSX 产出的 ReactElement）
 */
function reconcileChildren(
    current: Fiber | null,
    workInProgress: Fiber,
    nextChildren: any
) {
    if (current === null) {
        // 首次挂载：不需要标记副作用
        // mountChildFibers 内部的 placeSingleChild 不会添加 Placement 标记
        workInProgress.child = mountChildFibers(workInProgress, null, nextChildren);
    } else {
        // 更新：需要标记副作用（Placement、ChildDeletion 等）
        // reconcileChildFibers 尝试复用 current.child 链表中的节点
        workInProgress.child = reconcileChildFibers(
            workInProgress,
            current.child,
            nextChildren,
        );
    }
}
