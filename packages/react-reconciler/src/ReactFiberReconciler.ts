// Reconciler 对外 API —— updateContainer

import type {FiberRoot} from "./ReactInternalTypes";
import type {ReactNodeList} from 'shared/ReactTypes'
import {scheduleUpdateOnFiber} from "./ReactFiberWorkLoop";

// 更新容器内容：将 React 元素写入 HostRoot 的 memoizedState，触发调度
export function updateContainer(element: ReactNodeList, container: FiberRoot): void {
    const current = container.current;
    current.memoizedState = {element}
    scheduleUpdateOnFiber(container, current)
}