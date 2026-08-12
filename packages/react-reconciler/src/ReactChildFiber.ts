/**
 * ReactChildFiber.ts —— 子节点协调（Reconciliation）
 *
 * 这是 React Diff 算法的核心实现。它的任务是将 JSX 产出的 ReactElement
 * 转换为 Fiber 节点，并尽可能地复用已有的 Fiber（减少 DOM 操作）。
 *
 * 整体架构：
 * - 对外暴露两个函数：reconcileChildFibers（更新）和 mountChildFibers（首次挂载）
 * - 两者由同一个工厂函数 createChildReconciler 创建，区别在于是否标记副作用
 * - mountChildFibers 不标记 Placement → 首次渲染时性能更好（整棵 DOM 树一次性插入）
 * - reconcileChildFibers 标记 Placement → 更新时逐个节点标记需要变更的位置
 *
 * 子节点类型派发：
 * - 单个文本节点（string/number）→ reconcileSingleTextNode
 * - 单个 ReactElement → reconcileSingleElement（含节点复用逻辑）
 * - 数组 → reconcileChildArray（多个子节点）
 *
 * Diff 策略（简化版）：
 * - 单节点 Diff：找到 key 和 type 都相同的节点就复用，其余删除
 * - 多节点 Diff：首次挂载时直接创建所有子节点（未实现完整的更新 Diff）
 *
 * 在真实 React 中，Diff 算法有更多的优化策略：
 * - 双端比较（首首、尾尾、首尾、尾首）
 * - 移动而非删除重建
 * - 通过 key 建立 Map 快速查找
 */

import type {Fiber} from "./ReactInternalTypes";
import {REACT_ELEMENT_TYPE} from 'shared/ReactSymbols'
import type {ReactElement} from 'shared/ReactTypes'
import {createFiberFromElement, createFiberFromText, createWorkInProgress} from "./ReactFiber";
import {Placement} from "./ReactFiberFlags";
import {isArray} from 'shared/utils'

/**
 * ChildReconciler 函数类型签名
 *
 * @param returnFiber        - 当前 Fiber（子节点的父 Fiber）
 * @param currentFirstChild  - current 树上的第一个子节点（老 Fiber，用于 Diff 比较）
 * @param newChild           - 新的子节点（ReactElement 或数组）
 * @returns 协调后的第一个子 Fiber
 */
type ChildReconciler = (
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    newChild: any,
) => Fiber | null;

/**
 * reconcileChildFibers —— 更新阶段协调子节点
 *
 * 在更新阶段使用：会为新增的节点标记 Placement 副作用，
 * 这样 Commit 阶段才知道哪些 DOM 需要插入/更新。
 */
export const reconcileChildFibers: ChildReconciler = createChildReconciler(true)

/**
 * mountChildFibers —— 首次挂载阶段协调子节点
 *
 * 在首次渲染时使用：不标记 Placement 副作用，提升性能。
 * 因为首次渲染时整棵 DOM 树都是新的，只需一次性插入即可，
 * 不需要逐个节点标记。
 */
export const mountChildFibers: ChildReconciler = createChildReconciler(false)

/**
 * createChildReconciler —— 子节点协调器的工厂函数
 *
 * 通过 shouldTrackSideEffects 参数决定是否标记副作用：
 * - true  → reconcileChildFibers（更新时使用，标记 Placement）
 * - false → mountChildFibers（首次挂载时使用，不标记副作用）
 *
 * 工厂函数内部定义了一系列闭包函数，它们都能访问 shouldTrackSideEffects。
 *
 * @param shouldTrackSideEffects - 是否标记副作用（mount 时为 false，update 时为 true）
 * @returns reconcileChildFibers 函数
 */
function createChildReconciler(shouldTrackSideEffects: boolean) {

    /**
     * placeSingleChild —— 为新建的 Fiber 标记 Placement 副作用
     *
     * 只在 shouldTrackSideEffects === true 且 Fiber 是新创建的
     * （alternate === null，即 current 树上不存在对应节点）时才标记。
     *
     * Placement 标记会在 Commit 阶段被消费：将对应的 DOM 节点插入到页面中。
     *
     * @param newFiber - 新创建的 Fiber 节点
     * @returns 同一个 Fiber（带可能更新的 flags）
     */
    function placeSingleChild(newFiber: Fiber) {
        if (shouldTrackSideEffects && newFiber.alternate === null) {
            // 通过位或运算添加 Placement 标记
            // flags 使用位掩码，一个 Fiber 可以同时有多个标记
            newFiber.flags |= Placement
        }
        return newFiber;
    }

    /**
     * reconcileSingleTextNode —— 协调单个文本子节点
     *
     * 将字符串/数字转换为 TextNode 类型的 Fiber。
     * 当前简化实现：始终创建新 Fiber（未实现文本节点的复用比较）。
     *
     * 在真实 React 中，会比较旧文本和新文本的内容：
     * - 内容相同 → 复用旧 Fiber
     * - 内容不同 → 创建新 Fiber，标记旧节点的删除
     *
     * @param returnFiber       - 父 Fiber
     * @param currentFirstChild - current 树上的第一个子节点
     * @param textContent       - 文本内容（字符串/数字）
     * @returns 新创建的文本 Fiber
     */
    function reconcileSingleTextNode(
        returnFiber: Fiber,
        currentFirstChild: Fiber | null,
        textContent: string,
    ) {
        let createdFiber = createFiberFromText(textContent);
        // 设置 return 指针，指向父 Fiber
        // Fiber 树通过 child / sibling / return 三个指针构成可遍历的链表树
        createdFiber.return = returnFiber;
        return createdFiber;
    }

    /**
     * reconcileSingleElement —— 协调单个 ReactElement 子节点
     *
     * 这是单节点 Diff 的核心实现。尝试在 current 子节点链表中
     * 找到可以复用的节点（满足三个条件：同层级、key 相同、type 相同）。
     *
     * 节点复用条件：
     * 1. 同一层级：比较的是 returnFiber 的 child 链表中的节点
     * 2. key 相同：key 是节点的唯一标识。key 为 null/undefined 时视为相同
     * 3. type（标签类型/组件类型）相同：div === div，FunctionComponent === FunctionComponent
     *
     * 为什么找到可复用节点后直接 break 并删除其他节点？
     * 因为当前要求的是"单个"子节点。如果找到了匹配的，其他的就得删掉。
     * 例如：<div> 原来有 [<p/>, <span/>, <a/>]，新的是 <div><span/></div>
     * 找到 <span/> 匹配后，<p/> 和 <a/> 都是"多余的"，需要删除。
     *
     * @param returnFiber       - 父 Fiber
     * @param currentFirstChild - current 树上的第一个子节点
     * @param newChild          - 新的 ReactElement 子节点
     * @returns 创建或复用的 Fiber
     */
    function reconcileSingleElement(
        returnFiber: Fiber,
        currentFirstChild: Fiber | null,
        newChild: ReactElement,
    ) {
        const key = newChild.key;
        let child = currentFirstChild;

        // 遍历 current 的子节点链表（child → sibling → sibling → ...）
        // 尝试通过 key 和 type 找到可复用的节点
        while (child != null) {
            // 条件 1 & 2：key 相同（或都为 null/undefined）
            if (child.key === key) {
                const elementType = newChild.type;

                // 条件 3：type（标签/组件类型）相同
                if (child.elementType === elementType) {
                    // 找到可复用的节点！
                    // 通过 useFiber（createWorkInProgress）创建 workInProgress 节点，
                    // 复用 current Fiber 上的 DOM 引用（stateNode）
                    const existing = useFiber(child, newChild.props);
                    existing.return = returnFiber;

                    // TODO: 找到可复用节点后，应标记链表中的其他节点为删除（ChildDeletion）
                    return existing;
                } else {
                    // key 相同但 type 不同 → 无法复用，且后续的兄弟节点也不可能匹配
                    // 例如：key="a" 的 <div> 变成了 key="a" 的 <span>，类型变了
                    break;
                }
            } else {
                // key 不同 → 当前节点不能复用，继续检查下一个兄弟节点
                // TODO: 删除这个不匹配的旧节点（标记 ChildDeletion）
            }
            child = child.sibling;
        }

        // 没找到可复用的节点 → 创建全新的 Fiber
        let createdFiber = createFiberFromElement(newChild);
        createdFiber.return = returnFiber;
        return createdFiber;
    }

    /**
     * useFiber —— 基于 current Fiber 创建 workInProgress Fiber（节点复用）
     *
     * 通过 createWorkInProgress 复用 current Fiber 上的 DOM 引用：
     * - cloneFiber.stateNode = fiber.stateNode（复用真实 DOM）
     * - cloneFiber.alternate = fiber（形成双缓冲指针）
     *
     * 复用后重置 index 和 sibling：
     * - index = 0：该节点将成为父节点的独生子节点
     * - sibling = null：单节点没有兄弟
     *
     * @param fiber       - current 树上要复用的 Fiber
     * @param pendingProps - 新的 props
     * @returns 可复用的 workInProgress Fiber
     */
    function useFiber(fiber: Fiber, pendingProps: any) {
        const cloneFiber = createWorkInProgress(fiber, pendingProps);
        cloneFiber.index = 0;
        cloneFiber.sibling = null;
        return cloneFiber;
    }

    /**
     * createChild —— 为单个子节点创建 Fiber
     *
     * 根据 newChild 的具体类型创建对应类型的 Fiber：
     * - 文本（string/number）→ createFiberFromText（HostText Fiber）
     * - ReactElement         → createFiberFromElement（HostComponent/FunctionComponent 等）
     *
     * @param returnFiber - 父 Fiber
     * @param newChild    - 子节点（文本或 ReactElement）
     * @returns 新创建的 Fiber 或 null
     */
    function createChild(
        returnFiber: Fiber,
        newChild: any
    ): Fiber | null {
        // 文本子节点：字符串或数字
        if (isText(newChild)) {
            let createdFiber = createFiberFromText(newChild + '');
            createdFiber.return = returnFiber;
            return createdFiber;
        }

        // ReactElement 子节点
        if (typeof newChild === 'object' && newChild !== null) {
            switch (newChild.$$typeof) {
                case REACT_ELEMENT_TYPE: {
                    const createdFiber = createFiberFromElement(newChild);
                    createdFiber.return = returnFiber;
                    return createdFiber;
                }
            }
        }

        return null;
    }

    /**
     * reconcileChildArray —— 协调多个子节点（数组）
     *
     * 处理 JSX 中返回数组子节点的情况，例如：
     *   <ul>{items.map(item => <li key={item}>{item}</li>)}</ul>
     * 这里 items.map(...) 返回的就是一个数组。
     *
     * 当前实现只处理了首次挂载（oldFiber === null）的情况：
     * - 遍历数组，为每个元素创建对应的 Fiber
     * - 通过 sibling 指针将它们链接成单向链表
     * - 记录每个 Fiber 的 index（在原数组中的位置，用于 Diff 算法的 key 对比）
     *
     * TODO: 实现更新阶段的数组 Diff（新旧数组的节点复用/移动/删除）
     *
     * @param returnFiber       - 父 Fiber
     * @param currentFirstChild - current 树上的第一个子节点
     * @param newChildren       - 新的子节点数组
     * @returns 第一个子 Fiber（链表头）
     */
    function reconcileChildArray(
        returnFiber: Fiber,
        currentFirstChild: Fiber | null,
        newChildren: Array<any>,
    ) {
        // 链表头（第一个子节点）
        let resultFirstChild: Fiber | null = null;
        // 上一个创建的 Fiber（用于链接 sibling）
        let previousNewFiber: Fiber | null = null;

        let oldFiber = currentFirstChild;
        let newIndex = 0;

        // 首次渲染：没有老节点，直接为每个数组元素创建新 Fiber
        if (oldFiber === null) {
            for (; newIndex < newChildren.length; newIndex++) {
                const newFiber = createChild(returnFiber, newChildren[newIndex]);

                // 无法创建 Fiber 的元素（如 null/undefined/boolean）跳过
                if (newFiber == null) {
                    continue;
                }

                // 记录 Fiber 在原数组中的位置索引
                // 在更新阶段的 Diff 算法中，这个索引用于判断节点是否需要移动
                newFiber.index = newIndex;

                // 构建 sibling 链表
                if (previousNewFiber === null) {
                    // 第一个有效子节点 → 作为链表头
                    resultFirstChild = newFiber;
                } else {
                    // 后续节点 → 链接到上一个节点的 sibling
                    previousNewFiber.sibling = newFiber;
                }
                previousNewFiber = newFiber;
            }
            return resultFirstChild;
        }

        // TODO: 更新阶段的数组 Diff（此处为占位，当前直接返回 null）
        return resultFirstChild;
    }

    /**
     * isText —— 判断一个值是否为"可渲染的文本"
     *
     * React 中只有 string 和 number 类型可以直接作为文本节点渲染。
     * - boolean、null、undefined → 不渲染任何内容
     * - object（ReactElement）→ 需要创建对应的 Fiber
     * - 空字符串 → 视为无效，不创建文本节点
     *
     * @param newChild - 待判断的值
     * @returns 是否为文本类型
     */
    function isText(newChild: any) {
        return (
            (typeof newChild === 'string' && newChild !== '') ||
            (typeof newChild === 'number')
        );
    }

    /**
     * reconcileChildFibers —— 子节点协调的主入口（内部函数）
     *
     * 根据 newChild 的类型派发到对应的协调函数：
     * 1. 文本（string/number）→ reconcileSingleTextNode → 创建 HostText Fiber
     * 2. 单个 ReactElement       → reconcileSingleElement    → 创建/复用 Fiber（单节点 Diff）
     * 3. 数组                   → reconcileChildArray       → 循环创建 Fiber（多节点 Diff）
     *
     * 每种类型都会通过 placeSingleChild 判断是否需要添加 Placement 标记。
     *
     * @param returnFiber        - 父 Fiber
     * @param currentFirstChild  - current 树上的第一个子节点
     * @param newChild           - 新的子节点（文本/ReactElement/数组）
     * @returns 协调后的第一个子 Fiber
     */
    function reconcileChildFibers(
        returnFiber: Fiber,
        currentFirstChild: Fiber | null,
        newChild: any,
    ) {
        // 文本节点（单个字符串或数字）
        if (isText(newChild)) {
            return placeSingleChild(
                reconcileSingleTextNode(returnFiber, currentFirstChild, newChild + '')
            );
        }

        // 单个 ReactElement 子节点（如 <div><span/></div> 中的 <span/>）
        if (typeof newChild === 'object' && newChild !== null) {
            switch (newChild.$$typeof) {
                case REACT_ELEMENT_TYPE: {
                    return placeSingleChild(
                        reconcileSingleElement(returnFiber, currentFirstChild, newChild)
                    );
                }
            }
        }

        // 子节点数组（如 <ul>{items.map(i => <li/>)}</ul>）
        if (isArray(newChild)) {
            return reconcileChildArray(returnFiber, currentFirstChild, newChild);
        }

        // 无法识别的子节点类型（boolean/null/undefined 等）→ 不创建 Fiber
        return null;
    }

    return reconcileChildFibers;
}
