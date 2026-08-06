// beginWork —— Fiber 树构建的"递"阶段

import type {Fiber} from "./ReactInternalTypes";
import {HostRoot, HostComponent} from "./ReactWorkTags";
import {mountChildFibers, reconcileChildFibers} from "./ReactChildFiber";
import {shouldSetTextContent} from '../../react-dom/client/ReactDOMHostConfig'

// 处理当前 Fiber 节点，根据 tag 分发到对应的更新函数，返回子节点
export function beginWork(
    current: Fiber | null,
    workInProgress: Fiber
): Fiber | null {
    switch (workInProgress.tag) {
        case HostRoot:
            return updateHostRoot(current, workInProgress);
        case HostComponent:
            return updateHostComponent(current, workInProgress);
    }
    throw new Error(
        `Unknown unit of work tag (${workInProgress.tag}). This error is likely caused by a bug in ` +
        'React. Please file an issue.',
    );
}

// 处理 HostRoot Fiber：从 memoizedState 取出子元素，协调生成子 Fiber
function updateHostRoot(
    current: Fiber | null,
    workInProgress: Fiber
) {
    const nextChildren = workInProgress.memoizedState.element
    reconcileChildren(current, workInProgress, nextChildren)
    return workInProgress.child
}

// 处理原生标签（div, span 等）
// 首次挂载 → 直接 mount；后续更新 → reconcile（含 bailout 复用）
function updateHostComponent(
    current: Fiber | null,
    workInProgress: Fiber
) {
    const {type, pendingProps} = workInProgress;
    const isDirectTextChild = shouldSetTextContent(type, pendingProps);
    // 单个文本子节点不生成单独的 Fiber，作为父节点的属性处理
    if (isDirectTextChild) {
        return null
    }
    const nextChildren = workInProgress.pendingProps.children
    reconcileChildren(current, workInProgress, nextChildren)
    return workInProgress.child
}

// 协调子节点：根据是否存在 current 选择 mount 或 reconcile 策略
function reconcileChildren(current: Fiber | null, workInProgress: Fiber, nextChildren: any) {
    if (current === null) {
        // 初次挂载：不添加副作用标记
        workInProgress.child = mountChildFibers(workInProgress, null, nextChildren);
    } else {
        // 更新：需要标记副作用（Placement、ChildDeletion 等）
        workInProgress.child = reconcileChildFibers(
            workInProgress,
            current.child,
            nextChildren,
        );
    }
}