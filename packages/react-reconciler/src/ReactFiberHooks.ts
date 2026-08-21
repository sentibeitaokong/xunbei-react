/**
 * ReactFiberHooks.ts —— Hooks 实现模块
 *
 * 这是 React Hooks 体系的核心实现，目前支持 useReducer，
 * 未来会扩展 useState、useEffect、useLayoutEffect 等。
 *
 * 核心概念：
 *
 * 1. Hook 链表
 *    每个函数组件的 Hooks 通过单向链表（memoizedState → next → next → ...）组织。
 *    调用顺序必须稳定 —— 每次渲染时 Hook 的调用顺序必须一致，
 *    这就是"不能在条件语句中调用 Hook"的原因。
 *
 * 2. Mount vs Update
 *    - Mount（首次渲染）：创建全新的 Hook 节点，初始化 memoizedState
 *    - Update（后续渲染）：通过 alternate 指针找到 current 树上的老 Hook，
 *      复用其状态，不重新初始化
 *
 * 3. Dispatch → 调度更新
 *    dispatch 不直接修改 DOM，而是：
 *    a) 通过 reducer 计算新状态
 *    b) 保存到 hook.memoizedState
 *    c) 调用 scheduleUpdateOnFiber 通知调度器安排重新渲染
 *
 * 关键变量：
 * - currentlyRenderingFiber：当前正在处理（执行 renderWithHooks）的函数组件 Fiber
 * - workInProgressHook：当前正在创建的 Hook（workInProgress 树上的链表指针）
 * - currentHook：current 树上对应的 Hook（用于 Update 阶段读取旧状态）
 */

import type {Fiber, FiberRoot} from "./ReactInternalTypes";
import {scheduleUpdateOnFiber} from "./ReactFiberWorkLoop";
import {HostRoot} from "./ReactWorkTags";
import {isFn} from 'shared/utils'

/**
 * Hook 数据结构
 *
 * Hook 是一个单向链表节点：
 * - memoizedState：存储状态值（useReducer 的 state、useState 的值等）
 * - next：指向链表中的下一个 Hook
 *
 * 示例：如果一个组件调用了 useReducer(a) → useState(b) → useEffect(c)，
 * 它的 Fiber.memoizedState 指向一个包含 3 个节点的链表：
 *   [useReducer hook] → [useState hook] → [useEffect hook] → null
 */
type Hook = {
    memoizedState: any;   // 当前 Hook 存储的状态值
    next: null | Hook;    // 链表中下一个 Hook 的引用
};

/** 当前正在执行（调用 renderWithHooks）的函数组件 Fiber */
let currentlyRenderingFiber: Fiber | null = null;

/** workInProgress 树上当前正在处理的 Hook 节点（链表指针） */
let workInProgressHook: Hook | null = null;

/** current 树上对应的 Hook 节点（链表指针，用于 Update 阶段） */
let currentHook: Hook | null = null;

/**
 * renderWithHooks —— 执行函数组件并管理 Hooks 上下文
 *
 * 此函数是 Hooks 体系的"入口守卫"。在调用函数组件之前，
 * 先设置好 currentlyRenderingFiber 等全局变量，
 * 这样 Hook 函数（如 useReducer）在被调用时就能找到自己所属的 Fiber。
 *
 * 执行流程：
 * 1. 记录 currentlyRenderingFiber → 当前函数组件的 workInProgress Fiber
 * 2. 清空 workInProgress.memoizedState → 准备重新构建 Hook 链表
 * 3. 调用 Component(props) → 函数组件内部调用 useReducer 等 Hook
 *    Hook 函数内部通过 currentlyRenderingFiber 知道"自己是谁的 Hook"
 * 4. finishRenderingHooks → 清理全局变量，防止影响后续其他类型的组件
 * 5. 返回 JSX 描述的 children（VNode）
 *
 * @param current        - current 树上的对应 Fiber（首次渲染时为 null）
 * @param workInProgress - 当前正在处理的 workInProgress Fiber
 * @param Component      - 函数组件本身（就是那个 function）
 * @param props          - 组件接收的属性
 * @returns 函数组件返回的 JSX 元素（ReactElement）
 */
export function renderWithHooks(
    current: Fiber | null,
    workInProgress: Fiber,
    Component: any,
    props: any
): any {
    // 设置"当前正在渲染的 Fiber"，Hook 函数通过这个全局变量来关联自己
    currentlyRenderingFiber = workInProgress;

    // 清空旧的 Hook 链表，准备构建新的
    // 在 Update 阶段，updateWorkInProgressHook 会从 current.alternate 恢复旧链表
    workInProgress.memoizedState = null;

    // 执行函数组件，内部可能调用 useReducer 等 Hook
    // Hook 函数在 mount 时创建新节点，在 update 时复用 current 树上的节点
    let children = Component(props);

    // 清理 Hooks 相关的全局状态
    // 如果不清理，处理下一个组件（可能是类组件或原生标签）时可能会误用这些指针
    finishRenderingHooks();

    return children;
}

/**
 * finishRenderingHooks —— 完成 Hooks 渲染后的清理工作
 *
 * 将全局变量重置为 null，确保下一个处理的组件
 * 不会被错误的 Hooks 上下文影响。
 */
function finishRenderingHooks() {
    currentlyRenderingFiber = null;
    workInProgressHook = null;
    currentHook = null;
}

/**
 * updateWorkInProgressHook —— Hook 链表的创建/更新
 *
 * 这是 Hooks 体系的核心函数。每次 useReducer / useState / useEffect 等
 * Hook 函数被调用时，都会先调用此函数来获取/创建对应的 Hook 节点。
 *
 * 工作流程分为两种情况：
 *
 * 【Mount 阶段】（current === null，首次渲染）
 * - 创建全新的 Hook 对象 { memoizedState: null, next: null }
 * - 挂载到 Fiber.memoizedState 链表末尾
 * - 如果是第一个 Hook → 设为链表头
 * - 如果已有 Hook → 追加到链表尾
 *
 * 【Update 阶段】（current !== null，重新渲染）
 * - 从 current Fiber 的 Hook 链表中按顺序读取
 * - 每调用一个 Hook → workInProgressHook 和 currentHook 各向前移动一位
 * - 保持 workInProgress 和 current 的 Hook 链表顺序一致
 *
 * 为什么 Hook 调用顺序必须一致？
 * Hook 没有名字，只通过"第几个被调用"来标识自己。
 * 如果某次渲染跳过了某个 Hook（如在条件语句中），
 * 链表对齐就会错位，导致状态读取错误。
 *
 * @returns 当前 Hook 节点（mount 时新建，update 时返回 current 树上对应的节点）
 */
function updateWorkInProgressHook(): Hook {
    let hook: Hook;

    // 获取 current 树上对应的 Fiber
    // 首次渲染时 alternate 为 null
    const current = currentlyRenderingFiber?.alternate;

    if (current) {
        // ========== Update 阶段 ==========
        // 从 current Fiber 恢复 Hook 链表，保持链表结构一致

        // 将 current 的 Hook 链表头赋值给 workInProgress
        currentlyRenderingFiber!.memoizedState = current.memoizedState;

        if (workInProgressHook !== null) {
            // 已经至少调用过一个 Hook → 链表指针向前移动一位
            workInProgressHook = hook = workInProgressHook.next;
            currentHook = currentHook.next;
        } else {
            // 第一个被调用的 Hook → 取链表头
            hook = workInProgressHook = currentlyRenderingFiber?.memoizedState;
            currentHook = current.memoizedState;
        }
    } else {
        // ========== Mount 阶段 ==========
        // 首次渲染 → 创建全新的 Hook 节点

        currentHook = null;

        hook = {
            memoizedState: null,  // 状态初始值由具体的 Hook 函数（useReducer 等）设置
            next: null,           // 链表下一个节点，暂时为 null
        };

        if (workInProgressHook) {
            // 已有前一个 Hook → 追加到链表尾部
            workInProgressHook = workInProgressHook.next = hook;
        } else {
            // 第一个 Hook → 设为 Fiber.memoizedState 的头节点
            workInProgressHook = currentlyRenderingFiber!.memoizedState = hook;
        }
    }

    return hook;
}

/**
 * useReducer —— 状态管理 Hook
 *
 * 用 reducer 函数管理组件状态，是 useState 的底层实现。
 * useState 本质上是 useReducer 的特例（reducer 为简单的"替换"逻辑）。
 *
 * 工作流程：
 * 1. 调用 updateWorkInProgressHook() 获取/创建 Hook 节点
 * 2. Mount 阶段：将初始状态写入 hook.memoizedState
 * 3. Update 阶段：hook.memoizedState 已经是上一次的状态值，保持不变
 * 4. 创建 dispatch 函数（通过 bind 绑定 fiber、hook、reducer）
 * 5. 返回 [state, dispatch]
 *
 * @param reducer    - 状态更新函数：(当前状态, action) → 新状态。
 *                     允许返回 null，用于兼容 useState（reducer 传 null 时
 *                     直接以 action 作为新状态，见 dispatchReduceAction）
 * @param initialArg - 初始状态值（或 init 函数的参数）
 * @param init       - 可选的惰性初始化函数：(initialArg) → initialState
 * @returns [当前状态, dispatch 函数]
 *
 * 使用示例：
 *   const [count, setCount] = useReducer((x) => x + 1, 0);
 *   // count → 当前状态值
 *   // setCount(count + 1) → 触发更新
 */
export function useReducer<S, I, A>(
    reducer: (state: S, action: A) => S | null,
    initialArg: I,
    init?: (initailArg: I) => S
): any {
    // 1. 获取/创建当前 Hook 节点（mount 时新建，update 时取 current 树上对应的节点）
    const hook: Hook = updateWorkInProgressHook();

    // 2. 计算初始状态：如果有 init 函数则惰性初始化，否则直接使用 initialArg
    let initialState: S;
    if (init !== undefined) {
        initialState = init(initialArg);
    } else {
        initialState = initialArg as any;
    }

    // 3. Mount 阶段：将初始状态写入 hook.memoizedState
    //    Update 阶段：跳过了，保持上一次的状态不变
    if (!currentlyRenderingFiber?.alternate) {
        hook.memoizedState = initialState;
    }

    // 4. 创建 dispatch 函数
    //    bind 的作用：将 fiber、hook、reducer 预绑定，
    //    用户调用 dispatch(action) 时只需传 action 参数
    const dispatch = dispatchReduceAction.bind(
        null,
        currentlyRenderingFiber,
        hook,
        reducer as any,
    );

    // 5. 返回 [state, dispatch] 元组
    return [hook.memoizedState, dispatch];
}

/**
 * dispatchReduceAction —— dispatch 的底层实现
 *
 * 当用户调用 dispatch(action) 时执行：
 * 1. 通过 reducer 计算新状态（或直接用 action 替换）
 * 2. 将新状态写入 hook.memoizedState
 * 3. 为 Fiber 创建新的 alternate（模拟双缓冲切换）
 * 4. 找到根 FiberRoot，通知调度器安排重新渲染
 *
 * @param fiber   - 当前组件对应的 Fiber 节点
 * @param hook    - 当前 useReducer 对应的 Hook 节点
 * @param reducer - 状态更新函数
 * @param action  - 用户传入的 action
 */
function dispatchReduceAction<S, A>(
    fiber: Fiber,
    hook: Hook,
    reducer: (state: S, action: A) => S,
    action: any
) {
    // 计算新状态：有 reducer 则调用，没有则直接用 action 作为新状态
    hook.memoizedState = reducer ? reducer(hook.memoizedState, action) : action;

    // 为 Fiber 创建新的 alternate（浅拷贝当前 Fiber 作为"旧状态"）
    // 这样下次 beginWork 会比较新旧 Fiber 来判断是否需要更新
    fiber.alternate = {...fiber};

    // 找到根节点（HostRoot Fiber 对应的 FiberRoot）
    const root = getRootForUpdateFiber(fiber);

    // 通知调度器：这个根节点需要一次新的渲染
    // 第三个参数 isSync=true：Hooks 触发的更新走「同步微任务」路径
    // （queueMicrotask），保证 dispatch 后立即（下一个微任务）完成渲染，
    // 而不是走 Scheduler 的异步调度
    scheduleUpdateOnFiber(root, fiber, true);
}

/**
 * getRootForUpdateFiber —— 向上遍历找到根 FiberRoot
 *
 * 从触发更新的组件 Fiber 出发，沿 return 指针一路向上，
 * 找到 FiberRoot（即 FiberRootNode 实例）。
 *
 * Fiber 树的数据结构：
 *   FiberRootNode → current → HostRootFiber → child → ... → 触发更新的 Fiber
 *
 * 遍历方向（逆着 Fiber 树向上）：
 *   sourceFiber → return → return → ... → HostRootFiber → stateNode → FiberRoot
 *
 * @param sourcefiber - 触发更新的组件 Fiber
 * @returns FiberRoot（整棵 Fiber 树的容器）或 null
 */
function getRootForUpdateFiber(sourcefiber: Fiber): FiberRoot {
    let node = sourcefiber;
    let parent = sourcefiber.return;

    // 沿 return 指针一直向上，直到根节点（return 为 null 的节点）
    while (parent != null) {
        node = parent;
        parent = node.return;
    }

    // node 此时是 HostRoot Fiber（tag === HostRoot）
    // node.stateNode 就是 FiberRootNode
    return node.tag === HostRoot ? node.stateNode : null;
}

/**
 * useState —— 基于 useReducer 实现的状态 Hook
 *
 * 这是源码中 useState 与 useReducer 对比的关键点：
 * useState 本质上是 useReducer 的「语法糖」——它把 reducer 参数传 null，
 * 使得 dispatchReduceAction 时直接以 action 作为新状态（见该函数：
 * `hook.memoizedState = reducer ? reducer(...) : action`）。
 *
 * 二者在真实源码中的差异：
 * - useState：如果新 state 与旧 state 相同（Object.is），会跳过本次更新，不触发渲染
 * - useReducer：不会做这种优化，每次 dispatch 都会触发更新
 *   （本简化实现里 useState 尚未实现 bailout 优化，直接复用 useReducer）
 *
 * 惰性初始化：
 * - 若 initialState 是函数，则调用它得到初始状态（惰性求值，避免不必要的计算）
 * - 否则直接使用传入的值
 *
 * @param initialState - 初始状态值，或返回初始状态值的函数
 * @returns [当前状态, setState 函数]
 */
export function useState<S>(initialState: (() => S) | S) {
    // 惰性初始化：函数则调用，否则直接取值
    const init = isFn(initialState) ? (initialState as any)() : initialState;
    // 复用 useReducer，reducer 传 null → dispatch 时直接以新值替换旧值
    return useReducer(
        (state: S, action: S | ((prev: S) => S)) =>
            isFn(action) ? (action as any)(state) : action,
        init
    );
}

export function useMemo<T>(
    nextCreate: () => T,
    deps: Array<any> | null
): T {
    const hook = updateWorkInProgressHook()
    const nextDeps = deps === undefined ? null : deps;
    const prevState=hook.memoizedState;
    if(prevState!==null){
        if(nextDeps != null){
            const prevDep = prevState[1]
            if(areHookInputsEqual(nextDeps,prevDep)){
                //
                return prevState[0]
            }
        }
    }
    const nextValue = nextCreate();
    hook.memoizedState = [nextValue,nextDeps];
    return nextValue
}

//检查hook依赖项是否变化
export function areHookInputsEqual(
    nextDeps:Array<any>,
    prevDeps:Array<any>|null,
):boolean{
    if(prevDeps === null){
        return false
    }
    for(let i=0; i<nextDeps.length&&i<prevDeps.length; i++){
        if(Object.is(nextDeps[i],prevDeps[i])){
            continue
        }
        return false;
    }
    return true
}
