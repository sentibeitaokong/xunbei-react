import {createFiber} from "./ReactFiber";
import type {Container, Fiber, FiberRoot} from "./ReactInternalTypes";
import {HostRoot} from "./ReactWorkTags";

/**
 * 创建 Fiber 树的根节点（FiberRoot）
 *
 * FiberRoot 是整个 Fiber 树的顶层容器，它：
 * 1. 持有对真实 DOM 容器（如 document.getElementById('root')）的引用
 * 2. 通过 current 指针指向当前的 Fiber 树（HostRoot Fiber）
 * 3. 通过 finishedWork 指针指向已完成构建、等待提交的新 Fiber 树
 *
 * 调用流程：
 *   createFiberRoot(container)  →  创建 FiberRoot 和 HostRoot Fiber，并互相连接
 *
 * @param containerInfo - 真实的 DOM 容器元素（通常是 <div id="root"></div>）
 * @returns 创建好的 FiberRoot 节点
 */
export function createFiberRoot(containerInfo: Container): FiberRoot {
    // 创建 FiberRoot 容器节点
    const root: FiberRoot = new FiberRootNode(containerInfo);

    // 创建 HostRoot Fiber（tag=3），作为 Fiber 树的根节点
    const uninitializedFiber: Fiber = createFiber(HostRoot, null, null)

    // 双向绑定：FiberRoot.current ↔ uninitializedFiber.stateNode
    root.current = uninitializedFiber;
    uninitializedFiber.stateNode = root

    return root;
}

/**
 * FiberRoot 节点的构造函数（内部使用）
 *
 * FiberRoot 是连接 React 和真实 DOM 的桥梁：
 * - container: 真实的 DOM 容器节点
 * - current: 指向当前页面显示的 Fiber 树（current tree）
 * - finishedWork: 指向构建完成、等待 commit 的 Fiber 树（workInProgress tree）
 *
 * @param containerInfo - 真实的 DOM 容器元素
 */
export function FiberRootNode(containerInfo: Container) {
    this.container = containerInfo;    // 真实 DOM 容器（如 <div id="root">）
    this.current = null;               // 指向当前 Fiber 树的根节点（HostRoot Fiber）
    this.finishedWork = null;          // 指向构建完成的新 Fiber 树，commit 阶段将其渲染到 DOM
}