// 子节点协调 —— 将 ReactElement 转换为 Fiber 节点

import type {Fiber} from "./ReactInternalTypes";
import {REACT_ELEMENT_TYPE} from 'shared/ReactSymbols'
import type {ReactElement} from 'shared/ReactTypes'
import {createFiberFromElement} from "./ReactFiber";
import {Placement} from "./ReactFiberFlags";

type ChildReconciler = (
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    newChild: any,
) => Fiber | null;

// 更新时协调（会标记 Placement 等副作用）
export const reconcileChildFibers: ChildReconciler = createChildReconciler(true)
// 首次挂载（不标记副作用，提升性能）
export const mountChildFibers: ChildReconciler = createChildReconciler(false)

// 创建子节点协调器的工厂函数
// shouldTrackSideEffects: 是否标记副作用（mount 时为 false，update 时为 true）
function createChildReconciler(shouldTrackSideEffects: boolean) {
    // 为新创建的 Fiber 添加 Placement 标记（仅在更新时）
    function placeSingleChild(newFiber: Fiber) {
        if (shouldTrackSideEffects && newFiber.alternate === null) {
            newFiber.flags |= Placement
        }
        return newFiber;
    }

    // 协调单个 ReactElement：创建 Fiber 并设置 return 指针
    function reconcileSingleElement(
        returnFiber: Fiber,
        currentFirstChild: Fiber | null,
        newChild: ReactElement,
    ) {
        let createdFiber = createFiberFromElement(newChild);
        createdFiber.return = returnFiber;
        return createdFiber;
    }

    // 派发 newChild 到对应的协调函数（按类型：单个元素 / 文本 / 数组）
    function reconcileChildFibers(
        returnFiber: Fiber,
        currentFirstChild: Fiber | null,
        newChild: any,
    ) {
        if (typeof newChild === 'object' && newChild !== null) {
            switch (newChild.$$typeof) {
                case REACT_ELEMENT_TYPE: {
                    return placeSingleChild(
                        reconcileSingleElement(returnFiber, currentFirstChild, newChild)
                    )
                }
            }
        }
        // TODO: 支持文本节点和数组子节点
        return null
    }
    return reconcileChildFibers;
}