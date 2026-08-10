import type {Fiber} from "./ReactInternalTypes";
import {HostText,Fragment} from "./ReactWorkTags";
import type {WorkTag} from "./ReactWorkTags";
import {IndeterminateComponent, HostComponent} from "./ReactWorkTags";
import {REACT_FRAGMENT_TYPE} from 'shared/ReactSymbols'
import {NoFlags} from "./ReactFiberFlags";
import type {ReactElement} from 'shared/ReactTypes'
import {isStr} from 'shared/utils'

/**
 * 创建一个新的 Fiber 节点
 *
 * Fiber 是 React 的核心数据结构，每个 React 元素都对应一个 Fiber 节点。
 * Fiber 节点构成了一个链表树结构，React 通过遍历这棵树来完成渲染和更新。
 *
 * @param tag          - Fiber 节点的类型标签（如 HostComponent、FunctionComponent 等）
 * @param pendingProps - 待处理的 props（即将要应用的属性）
 * @param key          - React 元素的 key，用于 diff 算法中标识节点的身份
 * @returns 返回一个新创建的 Fiber 节点
 */
export function createFiber(
    tag: WorkTag,
    pendingProps: any,
    key: null | string
): Fiber {
    return new FiberNode(tag, pendingProps, key)
}

/**
 * Fiber 节点的构造函数（内部使用）
 *
 * 初始化 Fiber 节点的所有字段：
 * - 实例信息（tag、key、type、stateNode 等）
 * - 链表指针（return 父节点、child 第一个子节点、sibling 下一个兄弟节点）
 * - 工作状态（pendingProps、memoizedProps、memoizedState、updateQueue）
 * - Effect 副作用标记（flags、nextEffect）
 * - 双缓冲（alternate 指向 current 树中对应的 Fiber）
 *
 * 注意：此处使用普通函数而非 class，是 React 源码的原始写法，
 * 避免了 class 带来的性能开销（如原型链查找）。
 */
function FiberNode(tag: WorkTag, pendingProps: unknown, key: null | string) {
    // ========== Instance 实例信息 ==========
    this.tag = tag;               // Fiber 类型标签（如 0=FunctionComponent, 5=HostComponent 等）
    this.key = key;               // React key，diff 时用于判断节点是否可复用
    this.elementType = null;      // 元素类型标识
    this.type = null;             // 具体类型：函数组件是函数本身，原生标签是字符串如 'div'
    this.stateNode = null;        // 关联的真实 DOM 节点 / 组件实例 / FiberRoot

    // ========== Fiber 树链表结构 ==========
    // Fiber 树的遍历依赖于以下三个指针构成的链表结构：
    //   child   → 第一个子节点（深度优先遍历时优先向下）
    //   sibling → 下一个兄弟节点（当前层遍历完成后横向移动）
    //   return  → 父节点（子树处理完毕后返回上层，"return" 指"返回到哪里"）
    this.return = null;
    this.child = null;
    this.sibling = null;
    this.index = 0;               // 在同级节点中的索引位置，diff 算法用它判断是否需要移动

    // ========== 工作状态 ==========
    this.pendingProps = pendingProps;   // 等待处理的新的 props（即将应用到该 Fiber 的属性）
    this.memoizedProps = null;          // 上一次渲染时使用的 props（用于 diff 对比，判断是否变化）
    this.updateQueue = null;            // 更新队列（存储 setState / useReducer / useState 产生的更新）
    this.memoizedState = null;          // 上一次渲染的结果状态：
                                        //   - 类组件：存储 this.state
                                        //   - 函数组件：存储 hook 链表（第一个 hook 节点）

    // ========== Effect 副作用标记 ==========
    // flags 记录了当前 Fiber 需要执行的 DOM 操作类型
    this.flags = NoFlags;               // 当前 Fiber 的副作用标记（如 Placement 插入、Update 更新、ChildDeletion 删除）
    this.nextEffect = null;             // 指向 effect 链表中下一个有副作用的 Fiber

    // 以下字段暂时注释，后续功能实现时启用：
    // this.subtreeFlags = NoFlags;     // 子树中所有 Fiber 的副作用标记汇总
    // this.deletions = null;           // 需要被删除的子节点列表
    // this.lanes = NoLanes;            // 当前 Fiber 的优先级车道（lane 模型）
    // this.childLanes = NoLanes;       // 子树中存在的优先级车道

    // ========== 双缓冲机制 ==========
    // alternate 指向另一棵树中对应的 Fiber 节点
    // React 维护两棵 Fiber 树：current（当前屏幕上显示的）和 workInProgress（正在构建的）
    // 两棵树通过 alternate 互相引用，避免每次更新都重新创建 Fiber 对象
    this.alternate = null;
}

/**
 * 根据 ReactElement 创建对应的 Fiber 节点
 *
 * 这是从 React 元素到 Fiber 节点的入口函数。
 * 解析 element 的 type、key、props，然后委托给 createFiberFormTypeAndProps 创建 Fiber。
 *
 * @param element - React 元素（JSX 编译后的产物，包含 $$typeof、type、key、props 等字段）
 * @returns 对应的 Fiber 节点
 */
export function createFiberFromElement(element: ReactElement) {
    const {type, key} = element;
    const pendingProps = element.props;
    const fiber = createFiberFormTypeAndProps(type, key, pendingProps);
    return fiber
}

/**
 * 根据 type 和 props 创建 Fiber 节点
 *
 * 根据 type 的类型判断应该创建哪种类型的 Fiber：
 * - 如果 type 是字符串 → 原生 DOM 标签 → 标记为 HostComponent（如 'div', 'span', 'p'）
 * - 否则 → 暂时标记为 IndeterminateComponent，后续根据实际调用情况确定
 *         （可能是 FunctionComponent 或 ClassComponent）
 *
 * @param type         - 组件类型（字符串表示原生标签，函数/类表示自定义组件）
 * @param key          - React key，用于列表 diff 优化
 * @param pendingProps - 待处理的 props
 * @returns 创建好的 Fiber 节点
 */
export function createFiberFormTypeAndProps(
    type: any,
    key: null | string,
    pendingProps: any,
) {
    // 默认标记为待确定类型（IndeterminateComponent），后续根据实际情况在 reconcile 阶段确定
    let fiberTag: WorkTag = IndeterminateComponent;

    // 如果 type 是字符串，说明是原生 DOM 标签（如 'div', 'span', 'p' 等）
    if (isStr(type)) {
        fiberTag = HostComponent
    }else if(type==REACT_FRAGMENT_TYPE){
        fiberTag=Fragment
    }

    const fiber = createFiber(fiberTag, pendingProps, key)
    // 设置 elementType 和 type：对于原生标签两者相同，对于自定义组件可能不同
    fiber.elementType = type;
    fiber.type = type;
    return fiber
}
/**
 * 创建（或复用）一个正在工作中的 Fiber 节点（workInProgress）
 *
 * 这是 React 双缓冲（Double Buffering）机制的核心函数。
 * React 同时维护两棵 Fiber 树：
 * - current 树：当前屏幕上已渲染的 Fiber 树
 * - workInProgress 树：正在构建的下一棵 Fiber 树
 *
 * 两棵树通过 alternate 指针互相引用，这样可以：
 * 1. 复用已有的 Fiber 节点，避免每次更新都重新创建
 * 2. 在构建新树时，current 树保持不变，屏幕不会闪烁
 * 3. 构建完成后只需切换指针，而不是替换整棵树
 *
 * @param current      - current 树中对应的 Fiber 节点（当前屏幕上显示的版本）
 * @param pendingProps - 新的 props（即将应用到该 Fiber 的属性）
 * @returns workInProgress Fiber 节点（用于构建新树）
 */
export function createWorkInProgress(current: Fiber, pendingProps: any): Fiber {
    // 首先尝试复用 current.alternate（即上一轮渲染时对应的 workInProgress）
    let workInProgress = current.alternate;

    if (workInProgress === null) {
        // 首次渲染或该节点之前未被复用：创建全新的 Fiber
        workInProgress = createFiber(current.tag, pendingProps, current.key);
        // 复制实例相关字段（这些信息在更新时不变）
        workInProgress.elementType = current.elementType;
        workInProgress.type = current.type;
        workInProgress.stateNode = current.stateNode;
        // 建立双向 alternate 引用：形成双缓冲闭环
        workInProgress.alternate = current;
        current.alternate = workInProgress;
    } else {
        // 复用已有的 workInProgress 节点：只需更新变化的字段
        workInProgress.pendingProps = pendingProps;
        workInProgress.type = current.type;
        // 重置副作用标记（旧 flags 已在上一次 commit 中处理完毕）
        workInProgress.flags = NoFlags;
    }

    // 无论新建还是复用，以下字段都需要从 current 同步
    // 因为这些是上一次渲染的结果，需要作为本次 diff 的基准
    workInProgress.flags = current.flags;
    workInProgress.child = current.child;
    workInProgress.memoizedProps = current.memoizedProps;
    workInProgress.memoizedState = current.memoizedState;
    workInProgress.updateQueue = current.updateQueue;

    // 链表结构也同步过来（sibling 和 index 在 reconcile 阶段可能会被修改）
    workInProgress.sibling = current.sibling;
    workInProgress.index = current.index;

    return workInProgress;
}

export function createFiberFromText(content:string):Fiber{
    const fiber=createFiber(HostText,content,null)
    return fiber
}

