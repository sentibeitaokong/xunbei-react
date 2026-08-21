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
 * Diff 策略：
 * - 单节点 Diff：找到 key 和 type 都相同的节点就复用，其余删除
 * - 多节点 Diff：分三步完成（见 reconcileChildArray）
 *   1. 从左到右逐个比较，key/type 相同则复用（updateSlot），不同则退出本轮
 *   2. 若只剩新节点则直接创建；若只剩老节点则删除剩余
 *   3. 若新老节点都还有剩余，则将剩余老节点按 key/index 存入 Map，
 *      再逐个匹配复用，最后删除 Map 中未被复用的老节点
 *
 * 在真实 React 中，Diff 算法有更多的优化策略：
 * - 双端比较（首首、尾尾、首尾、尾首）
 * - 移动而非删除重建
 * - 通过 key 建立 Map 快速查找
 */

import type {Fiber} from "./ReactInternalTypes";
import {HostText} from "./ReactWorkTags";
import {REACT_ELEMENT_TYPE} from 'shared/ReactSymbols'
import type {ReactElement} from 'shared/ReactTypes'
import {createFiberFromElement, createFiberFromText, createWorkInProgress} from "./ReactFiber";
import {ChildDeletion, Placement} from "./ReactFiberFlags";
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
                    deleteRemainingChildren(returnFiber,child)
                    break;
                }
            } else {
                // key 不同 → 当前节点不能复用，继续检查下一个兄弟节点
                // TODO: 删除这个不匹配的旧节点（标记 ChildDeletion）
                deleteChild(returnFiber, child);
            }
            child = child.sibling;
        }

        // 没找到可复用的节点 → 创建全新的 Fiber
        let createdFiber = createFiberFromElement(newChild);
        createdFiber.return = returnFiber;
        return createdFiber;
    }
    function deleteChild(
        returnFiber: Fiber,
        childToDelete: Fiber,
    ){
        if(!shouldTrackSideEffects){
            return
        }
        const deletions=returnFiber.deletions;
        if(deletions == null){
            returnFiber.deletions = [childToDelete];
            returnFiber.flags|=ChildDeletion
        }else{
            returnFiber.deletions!.push(childToDelete)
        }
    }
    function deleteRemainingChildren(
        returnFiber: Fiber,
        currentFirstChild: Fiber,
    ){
        if(!shouldTrackSideEffects){
            return
        }
        let childToDelete=currentFirstChild
        while(childToDelete!==null){
            deleteChild(returnFiber, childToDelete)
            childToDelete=childToDelete.sibling;
        }
        return null
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
     * 这是「多节点 Diff」的核心实现，分三步完成：
     *
     * 【第一步】从左到右逐个比较（newIndex 从 0 开始）
     *   - 调用 updateSlot 尝试复用：key 相同（文本节点看是否为文本）则复用，
     *     不同则返回 null 并退出本轮循环。
     *   - 复用的节点通过 placeChild 判断是否需要移动（index 顺序变化）。
     *   - 构建新 Fiber 的 sibling 单向链表。
     *
     * 【第二步】处理单边剩余的情况
     *   - 新节点遍历完了、老节点还有 → 删除所有剩余老节点（deleteRemainingChildren）
     *   - 老节点遍历完了、新节点还有 → 直接为剩余新节点创建 Fiber（createChild）
     *
     * 【第三步】新老节点都还有剩余（中间有 key 不匹配导致提前退出）
     *   - 把剩余老节点按 key（无 key 则按 index）存入 Map → mapRemainingChildren
     *   - 逐个新节点从 Map 中查找匹配的老节点复用 → updateFromMap
     *   - 复用过的老节点从 Map 中删除，最后 Map 中剩下的就是需要删除的节点
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
        // 当前正在比较的老节点（从 current 树的第一个子节点开始）
        let oldFiber = currentFirstChild;
        // 下一个待比较的老节点（提前存好，避免 oldFiber 被覆盖后丢失）
        let nextOldFiber = null;
        // 新子节点数组的下标（从左到右递增）
        let newIndex = 0;
        // 上一个复用节点在「老链表」中的位置，用于判断是否需要移动 DOM（见 placeChild）
        let lastPlaceIndex = 0;

        // ===== 第一步：从左到右逐个比较，能复用则复用，不能复用就退出本轮 =====
        for (; oldFiber !== null && newIndex < newChildren.length; newIndex++) {
            if (oldFiber.index > newIndex) {
                // 老节点的 index 比新下标还靠后，说明中间有节点被删了，
                // 老节点链表出现「跳跃」，无法直接对应，退出第一轮走 Map 匹配
                nextOldFiber = oldFiber;
                oldFiber = null;
            } else {
                // 正常情况下，保存 oldFiber 的兄弟节点作为下一个候选
                nextOldFiber = oldFiber.sibling;
            }
            // 尝试复用：key（文本节点则看类型）相同时返回复用后的 Fiber，否则返回 null
            const newFiber = updateSlot(returnFiber, oldFiber, newChildren[newIndex]);
            if (newFiber === null) {
                // 无法复用 → 退出第一轮，进入第三步（Map 匹配）
                if (oldFiber === null) {
                    // 上面因为 index 跳跃把 oldFiber 置空了，这里恢复它
                    oldFiber = nextOldFiber;
                }
                break;
            }
            if (shouldTrackSideEffects) {
                // 复用了老节点（alternate 非 null），但 key 相同 type 不同导致新建了 Fiber
                //newFiber?.alternate === null：表示新 Fiber 没有对应的旧 Fiber，即它不是复用的旧节点，而是全新创建的。
                // （alternate === null）→ 老节点需要删除
                if (oldFiber && newFiber?.alternate === null) {
                    deleteChild(returnFiber, oldFiber);
                }
            }

            // 判断节点在 DOM 中的相对位置是否发生变化，变了就标记 Placement（需要移动）
            lastPlaceIndex = placeChild(newFiber, lastPlaceIndex, newIndex);

            // 构建 sibling 链表
            if (previousNewFiber === null) {
                // 第一个有效子节点 → 作为链表头
                resultFirstChild = newFiber;
            } else {
                // 后续节点 → 链接到上一个节点的 sibling
                previousNewFiber.sibling = newFiber;
            }
            previousNewFiber = newFiber;
            oldFiber = nextOldFiber;
        }

        // ===== 第二步 2.1：老节点还有、新节点没了 → 删除剩余的老节点 =====
        if (newIndex === newChildren.length) {
            deleteRemainingChildren(returnFiber, oldFiber);
            return resultFirstChild;
        }

        // ===== 第二步 2.2：新节点还有、老节点没了 → 剩余的新节点直接创建 =====
        // （首次渲染时 oldFiber 一开始就是 null，也走这里）
        if (oldFiber === null) {
            for (; newIndex < newChildren.length; newIndex++) {
                const newFiber = createChild(returnFiber, newChildren[newIndex]);

                // 无法创建 Fiber 的元素（如 null/undefined/boolean）跳过
                if (newFiber == null) {
                    continue;
                }

                //判断节点在dom的相对位置是否发生变化,变化了则需要移动
                lastPlaceIndex=placeChild(newFiber,lastPlaceIndex,newIndex)

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
        // ===== 第三步 2.3：新老节点都还有剩余（第一轮因 key 不匹配提前退出）=====
        // 把剩余老节点按 key（无 key 则按 index）建立 Map，便于 O(1) 查找复用
        const existingChildren = mapRemainingChildren(oldFiber);

        for (; newIndex < newChildren.length; newIndex++) {
            // 从 Map 中查找匹配的老节点复用（文本按 index，元素按 key）
            const newFiber = updateFromMap(existingChildren, returnFiber, newIndex, newChildren[newIndex]);
            if (newFiber !== null) {
                if (shouldTrackSideEffects) {
                    // 该老节点已被复用，从 Map 中移除，剩下的就是需要删除的节点
                    existingChildren.delete(newFiber.key === null ? newIndex : newFiber.key);
                }
                lastPlaceIndex = placeChild(newFiber, lastPlaceIndex, newIndex);
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
        }

        // ===== 第四步：新节点已构建完，Map 中剩下的老节点都是多余的 → 删除 =====
        if (shouldTrackSideEffects) {
            existingChildren.forEach(child => deleteChild(returnFiber, child));
        }
        return resultFirstChild;
    }

    /**
     * mapRemainingChildren —— 将剩余老节点按 key/index 存入 Map
     *
     * 在多节点 Diff 第三步使用：第一轮逐个比较因 key 不匹配而提前退出后，
     * 剩余的 oldFiber 链表会被收集到 Map 中，以便新节点快速查找复用。
     *
     * Map 的 key 规则：
     * - 老节点有 key → 用 key 作为 Map 的键（key 是节点的唯一标识）
     * - 老节点无 key → 用 index 作为 Map 的键（无 key 时按位置匹配）
     *
     * @param oldFiber - 剩余老节点链表的头节点
     * @returns key/index → Fiber 的映射表
     */
    function mapRemainingChildren(oldFiber: Fiber): Map<string | number, Fiber> {
        const existingChildren: Map<string | number, Fiber> = new Map();
        let existingChild: Fiber | null = oldFiber;
        while (existingChild !== null) {
            if (existingChild.key !== null) {
                existingChildren.set(existingChild.key, existingChild);
            } else {
                existingChildren.set(existingChild.index, existingChild);
            }
            existingChild = existingChild.sibling;
        }
        return existingChildren;
    }

    /**
     * updateFromMap —— 从 Map 中查找匹配的老节点并复用/创建新 Fiber
     *
     * 在多节点 Diff 第三步使用：根据新子节点的类型，从 existingChildren Map 中
     * 取出对应的老节点，交给 updateTextNode / updateElement 完成复用或新建。
     *
     * 匹配规则：
     * - 文本节点：以 index 为键查找老节点
     * - ReactElement：以 key（无 key 则用 index）为键查找老节点
     *
     * @param existingChildren - 剩余老节点的 key/index → Fiber 映射表
     * @param returnFiber      - 父 Fiber
     * @param newIndex         - 新节点在当前数组中的位置
     * @param newChild         - 新的子节点（文本或 ReactElement）
     * @returns 复用或新建的 Fiber；无法处理（如 null/boolean）时返回 null
     */
    function updateFromMap(
        existingChildren: Map<string | number, Fiber>,
        returnFiber: Fiber,
        newIndex: number,
        newChild: any
    ): Fiber | null {
        if (isText(newChild)) {
            // 文本节点无 key，只能按 index 匹配老节点
            const matchedFiber = existingChildren.get(newIndex) || null;
            return updateTextNode(returnFiber, matchedFiber, newChild + '');
        } else if (typeof newChild === 'object' && newChild !== null) {
            // ReactElement 优先按 key 匹配，无 key 时退回按 index 匹配
            const matchedFiber = existingChildren.get(newChild.key === null ? newIndex : newChild.key) || null;
            return updateElement(returnFiber, matchedFiber, newChild);
        }
        return null;
    }

    /**
     * placeChild —— 标记节点是否需要移动（Placement），并维护 lastPlaceIndex
     *
     * 这是「移动而非删除重建」的关键：通过比较新 Fiber 复用到的老节点
     * 在 oldChildren 中的 index 与 lastPlaceIndex 的大小关系，判断节点
     * 在新链表中的相对顺序是否改变，进而决定是否需要移动 DOM。
     *
     * 判断逻辑：
     * - 无副作用跟踪（mount）：只更新 index，直接返回原 lastPlaceIndex
     * - 复用节点（alternate 非 null）：
     *     oldIndex < lastPlaceIndex → 顺序变了，标记 Placement，lastPlaceIndex 不变
     *     oldIndex >= lastPlaceIndex → 顺序没变，返回 oldIndex（更新 lastPlaceIndex）
     * - 新增节点（alternate 为 null）：标记 Placement，lastPlaceIndex 不变
     *
     * @param newFiber       - 当前处理的新 Fiber
     * @param lastPlaceIndex - 上一个复用节点在老链表中的 index（单调不降）
     * @param newIndex       - 新节点在数组中的位置
     * @returns 更新后的 lastPlaceIndex
     */
    function placeChild(
        newFiber: Fiber,
        lastPlaceIndex: number,
        newIndex: number,
    ) {
        // 记录新节点在数组中的位置，供后续对比使用
        newFiber.index = newIndex;

        // 首次挂载（mount）不标记 Placement，整棵树一次性插入即可
        if (!shouldTrackSideEffects) {
            return lastPlaceIndex;
        }

        // 老节点（current 树上对应的 Fiber）
        const current = newFiber.alternate;
        if (current !== null) {
            // 复用节点 → 根据老 index 判断相对顺序是否变化
            const oldIndex = current.index;
            if (oldIndex < lastPlaceIndex) {
                // 老位置在 lastPlaceIndex 之前 → 相对顺序变了，需要移动
                newFiber.flags |= Placement;
                return lastPlaceIndex;
            } else {
                // 顺序没变 → 更新 lastPlaceIndex 为老节点的 index
                return oldIndex;
            }
        } else {
            // 新增节点 → 需要插入 DOM
            newFiber.flags |= Placement;
            return lastPlaceIndex;
        }
    }

    /**
     * updateSlot —— 第一轮逐个比较时的「单槽位」复用判断
     *
     * 在多节点 Diff 第一步使用：逐个比较同一下标位置的新老节点，
     * 判断能否复用，能则返回复用后的 Fiber，不能则返回 null（退出第一轮）。
     *
     * 复用条件（任一条不满足即返回 null）：
     * - 文本节点：老节点必须也是文本（key 为 null）
     * - ReactElement：key 必须相同（文本节点的 key 恒为 null）
     *
     * @param returnFiber - 父 Fiber
     * @param oldFiber    - 对应位置的老节点（可能为 null）
     * @param newChild    - 新的子节点
     * @returns 复用后的 Fiber，或 null 表示无法复用
     */
    function updateSlot(
        returnFiber: Fiber,
        oldFiber: Fiber | null,
        newChild: any
    ) {
        // 老节点的 key（老节点为 null 时视为 null）
        const key = oldFiber !== null ? oldFiber.key : null;

        if (isText(newChild)) {
            // 新节点是文本，但老节点有 key → 类型不匹配，无法复用
            if (key !== null) {
                return null;
            }
            return updateTextNode(returnFiber, oldFiber, newChild);
        }

        if (typeof newChild === 'object' && newChild !== null) {
            // 元素节点：key 相同才复用，否则返回 null 退出第一轮
            if (newChild.key === key) {
                return updateElement(returnFiber, oldFiber, newChild);
            } else {
                return null;
            }
        }

        return null;
    }

    /**
     * updateTextNode —— 复用或新建文本 Fiber
     *
     * - 老节点是文本（HostText）→ 复用其 DOM 节点（useFiber）
     * - 老节点不是文本或不存在 → 新建文本 Fiber
     *
     * @param returnFiber - 父 Fiber
     * @param oldFiber    - 候选老节点
     * @param textContent - 新的文本内容
     * @returns 复用或新建的文本 Fiber
     */
    function updateTextNode(
        returnFiber: Fiber,
        oldFiber: Fiber | null,
        textContent: string
    ) {
        if (oldFiber === null || oldFiber.tag !== HostText) {
            // 老节点不是文本节点 → 无法复用，新建
            const createdFiber = createFiberFromText(textContent);
            createdFiber.return = returnFiber;
            return createdFiber;
        } else {
            // 老节点是文本节点 → 复用其 stateNode（真实 DOM 文本节点）
            const existing = useFiber(oldFiber, textContent);
            existing.return = returnFiber;
            return existing;
        }
    }

    /**
     * updateElement —— 复用或新建元素 Fiber
     *
     * - 老节点的 elementType（标签/组件类型）相同 → 复用（useFiber）
     * - 类型不同或老节点不存在 → 新建 Fiber
     *
     * @param returnFiber - 父 Fiber
     * @param oldFiber    - 候选老节点
     * @param element     - 新的 ReactElement
     * @returns 复用或新建的元素 Fiber
     */
    function updateElement(
        returnFiber: Fiber,
        oldFiber: Fiber | null,
        element: ReactElement
    ) {
        const elementType = element.type;
        if (oldFiber !== null) {
            if (oldFiber.elementType === elementType) {
                // 类型相同 → 复用老节点的 DOM（useFiber）
                const existing = useFiber(oldFiber, element.props);
                existing.return = returnFiber;
                return existing;
            }
        }
        // 类型不同或没有老节点 → 新建
        const createdFiber = createFiberFromElement(element);
        createdFiber.return = returnFiber;
        return createdFiber;
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
