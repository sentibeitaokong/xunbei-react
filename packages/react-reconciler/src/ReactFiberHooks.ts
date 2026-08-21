/**
 * ReactFiberHooks.ts —— Hooks 实现模块
 *
 * 这是 React Hooks 体系的核心实现，支持：
 * - 状态类：useReducer、useState
 * - 副作用类：useEffect（被动）、useLayoutEffect（布局）
 * - 缓存/引用类：useMemo、useCallback、useRef
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
import type {Flags} from "./ReactFiberFlags";
import {Update,Passive} from './ReactFiberFlags'
import type {HookFlags} from "./ReactHookEffectTags";
import {HookLayout,HookPassive} from "./ReactHookEffectTags";

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

/**
 * Effect 数据结构 —— 描述一个 useEffect / useLayoutEffect 的副作用对象
 *
 * 每个 Effect 存储了：
 * - tag：HookFlags 位掩码，标记该 effect 的类型（Layout/Passive）与是否需触发（HasEffect）
 * - create：用户传入的副作用函数（执行后可能返回 cleanup 函数）
 * - destroy：cleanup 函数（上一次 create 的返回值，供更新/卸载时清理）
 * - deps：依赖数组，用于判断 effect 是否需要重新执行
 * - next：指向循环链表中的下一个 Effect
 *
 * 与 Hook 的区别：
 * - Hook 链表挂在 Fiber.memoizedState 上，一个 Hook 对应一次 Hook 调用
 * - Effect 链表挂在 Fiber.updateQueue 上，一个 Effect 对应一次 effect 调用
 *   （多个 effect 共享同一循环链表，通过 tag 区分 Layout/Passive）
 */
type Effect={
    tag:HookFlags;
    create:()=>(()=>void)|void,
    destroy:(()=>void)|void,
    deps:Array<any>|null;
    next:null|Effect
}

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
    // 清空旧的 Effect 循环链表，本次渲染的 useEffect/useLayoutEffect 会重新构建
    workInProgress.updateQueue= null;
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

export function useCallback<T>(
    callback: T,
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
    hook.memoizedState = [callback,nextDeps];
    return callback
}

export function useRef<T>(
    initialValue: T
):{current:T}{
    const hook = updateWorkInProgressHook()
    if(currentHook===null){
        hook.memoizedState={current:initialValue};
    }
    return hook.memoizedState;
}
/**
 * useEffect —— 被动副作用 Hook
 *
 * 在浏览器绘制之后「异步」执行，不阻塞 DOM 变更与绘制。
 * 底层调用 updateEffectImpl，用 Passive / HookPassive 两组标记：
 * - fiberFlags = Passive：给 Fiber 打上 Passive 标记，commit 阶段据此异步调度
 * - hookFlags = HookPassive：标记该 effect 属于被动类型，执行时据此过滤
 *
 * @param create - 副作用函数，可返回 cleanup 函数
 * @param deps   - 依赖数组；为 undefined 时每次渲染都执行，否则仅在依赖变化时执行
 */
export function useEffect(
    create:()=>(()=>void)|void,
    deps:Array<any>|null
){
    return updateEffectImpl(Passive,HookPassive,create,deps)
}

/**
 * useLayoutEffect —— 布局副作用 Hook
 *
 * 在 DOM 变更后、浏览器绘制之前「同步」执行，可读取/修改布局信息。
 * 与 useEffect 的差异仅在于标记：
 * - fiberFlags = Update：复用 Update 标记，commitMutationEffects 同步执行
 * - hookFlags = HookLayout：标记该 effect 属于布局类型
 *
 * @param create - 副作用函数，可返回 cleanup 函数
 * @param deps   - 依赖数组；为 undefined 时每次渲染都执行，否则仅在依赖变化时执行
 */
export function useLayoutEffect(
    create:()=>(()=>void)|void,
    deps:Array<any>|null
){
    return updateEffectImpl(Update,HookLayout,create,deps)
}

/**
 * updateEffectImpl —— useEffect / useLayoutEffect 的公共实现
 *
 * 负责「获取/创建 effect」并「决定是否需要重新执行」，核心逻辑：
 *
 * 1. 获取当前 Hook（mount 新建 / update 复用）
 * 2. 依赖比较：若 deps 与上一次相同（areHookInputsEqual），
 *    直接复用上一次的 effect，不重新执行、也不打标记（bailout）
 * 3. 依赖变化（或首次渲染）：
 *    - 给 Fiber 打上 fiberFlags 标记（Passive 或 Update），通知 commit 阶段执行
 *    - 调用 pushEffect 构造新的 Effect 节点，存入 hook.memoizedState
 *
 * @param fiberFlags - 需要加到 Fiber.flags 上的标记（决定 effect 何时执行）
 * @param hookFlags  - 该 effect 的类型标记（Layout / Passive）
 * @param create     - 副作用函数
 * @param deps       - 依赖数组
 */
function updateEffectImpl(
    fiberFlags:Flags,
    hookFlags:HookFlags,
    create:()=>(()=>void)|void,
    deps:Array<any>|null
){
    const hook = updateWorkInProgressHook();
    // deps 为 undefined 时视为 null（表示「每次渲染都执行」）
    const nextDeps = deps === undefined ? null : deps;
    // 上一次渲染对应的 effect（来自 current 树）
   const prevEffect = currentHook !== null ? currentHook.memoizedState as Effect : null;
   // 已有旧 effect 且本次提供了 deps：做依赖浅比较
   if(prevEffect!==null && prevEffect !== undefined){
       if(nextDeps != null){
           const prevDeps=prevEffect.deps;
           if(areHookInputsEqual(nextDeps,prevDeps)){
               // 依赖没变 → 复用旧 effect，不重新执行（bailout）
               hook.memoizedState = prevEffect;
               return
           }
       }
   }
   // 依赖变化（或首次渲染）→ 给 Fiber 打标记，通知 commit 阶段执行
    currentlyRenderingFiber!.flags|=fiberFlags;
    // 构造新的 effect，并携带上一次的 destroy（cleanup）以便更新时先清理
    // 1. 保存 effect 到 hook.memoizedState
    // 2. 同时构建/追加到 Fiber.updateQueue 的 effect 循环链表
    hook.memoizedState = pushEffect(hookFlags,create,nextDeps,prevEffect?.destroy);
}

/**
 * pushEffect —— 构造 Effect 节点并加入循环链表
 *
 * 将新建的 Effect 追加到 currentlyRenderingFiber.updateQueue 中维护的
 * 「单向循环链表」末尾（lastEffect 始终指向最新加入的节点）。
 *
 * 链表结构：
 * - 空链表：创建 { lastEffect } 队列，effect 自环（next 指向自己）
 * - 非空：把新 effect 插到 lastEffect 之后，再让 lastEffect 指向它
 *   lastEffect.next 始终指向最早声明的 effect（即链表的头）
 *
 * 为什么用循环链表？
 * - 便于从任意节点出发遍历一圈（见 commitHookEffectlistMount 的 do...while）
 * - lastEffect 直接定位到「最新的」effect，插入是 O(1)
 */
function pushEffect(
    hookFlags:HookFlags,
    create:()=>(()=>void)|void,
    deps:Array<any>|null,
    destroy:(()=>void)|void
){
    const effect:Effect={
        tag:hookFlags,
        create,
        destroy,
        deps,
        next:null
    }
    let componentUpdateQueue=currentlyRenderingFiber!.updateQueue;
    // 单向循环链表
    if(componentUpdateQueue===null){
        // 首个 effect：创建队列并让 effect 自环
        componentUpdateQueue={
            lastEffect:null
        }
        currentlyRenderingFiber!.updateQueue=componentUpdateQueue
        componentUpdateQueue.lastEffect=effect.next=effect
    }else{
        // 追加到链表：插入到 lastEffect 之后，再更新 lastEffect 为新节点
        const lastEffect=componentUpdateQueue.lastEffect
        const firstEffect=lastEffect.next
        lastEffect.next=effect
        effect.next=firstEffect
        componentUpdateQueue.lastEffect=effect
    }
    return effect
}

/**
 * areHookInputsEqual —— 检查 Hook 依赖数组是否变化
 *
 * 用于 useEffect / useLayoutEffect / useMemo / useCallback 的依赖比较，
 * 判断本次渲染是否需要重新执行（或重新计算）。
 *
 * 比较规则（浅比较）：
 * - prevDeps 为 null（首次渲染）→ 视为「已变化」
 * - 依赖数组长度不一致 → 视为「已变化」
 * - 逐项用 Object.is 比较，任意一项不同 → 视为「已变化」
 *
 * 为什么用 Object.is 而不是 ===？
 * Object.is 能正确区分 NaN 与 NaN（相等）、+0 与 -0（不等），
 * 更符合 React 官方对依赖比较的语义。
 *
 * @param nextDeps - 本次渲染的依赖数组
 * @param prevDeps - 上一次渲染的依赖数组（可能为 null）
 * @returns 依赖完全相等返回 true，否则 false
 */
export function areHookInputsEqual(
    nextDeps:Array<any>,
    prevDeps:Array<any>|null,
):boolean{
    // 首次渲染（prevDeps 为 null）或长度不一致 → 直接判定为变化
    if(prevDeps === null || nextDeps.length !== prevDeps.length){
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
