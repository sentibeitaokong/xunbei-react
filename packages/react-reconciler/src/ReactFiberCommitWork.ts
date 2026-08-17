/**
 * ReactFiberCommitWork.ts —— Commit 阶段的 Mutation 子阶段
 *
 * Commit 阶段是 React 渲染流程的最后一个阶段，负责将 Render 阶段
 * 计算出的 Fiber 树变更同步到真实 DOM。
 *
 * Commit 阶段分为三个子阶段：
 * 1. BeforeMutation 阶段（此处未实现）：DOM 变更前的准备工作（如 getSnapshotBeforeUpdate）
 * 2. Mutation 阶段（本文件实现）：执行实际的 DOM 操作（插入、更新、删除）
 * 3. Layout 阶段（此处未实现）：DOM 变更后的副作用（如 useEffect、useLayoutEffect）
 *
 * 本文件实现了 Mutation 阶段的核心逻辑：
 * - 深度优先遍历 Fiber 树（递归 + 单链表）
 * - 根据 Fiber.flags 判断需要执行的 DOM 操作（Placement 插入、Update 更新、Deletion 删除）
 * - 找到最近的有 DOM 节点的祖先 Fiber，将子 DOM 挂载到正确的位置
 */

import type {FiberRoot,Fiber} from "./ReactInternalTypes";
import {ChildDeletion, Placement} from "./ReactFiberFlags";
import {HostComponent, HostRoot} from "./ReactWorkTags";
import {isHost} from "./ReactFiberCompleteWork";

/**
 * 提交 Mutation 副作用（Commit 阶段 Mutation 子阶段的入口）
 *
 * 遍历 finishedWork Fiber 树，收集所有有副作用的 Fiber 节点，
 * 并对每个节点调用 commitReconciliationEffects 执行实际的 DOM 操作。
 *
 * 执行流程：
 * 1. recursivelyTraverseMutationEffects：递归遍历子树，先处理子节点，再处理父节点
 * 2. commitReconciliationEffects：处理当前 Fiber 自身的副作用标记
 *
 * 遍历顺序：深度优先（子 → 兄弟 → 父），确保子 DOM 先被创建再被挂载
 *
 * @param root         - FiberRoot（根容器）
 * @param finishedWork - Render 阶段产出的完整 workInProgress 树
 */
export function commitMutationEffects(root:FiberRoot,finishedWork:Fiber){
    // 1. 深度优先遍历：先处理所有子 Fiber 的副作用
    recursivelyTraverseMutationEffects(root,finishedWork);
    // 2. 处理当前 Fiber 自身的副作用（如 Placement 插入 DOM）
    commitReconciliationEffects(finishedWork);
}

/**
 * 递归遍历并提交子 Fiber 的 Mutation 副作用
 *
 * 使用 while 循环遍历单链表（child → sibling），对每个子节点
 * 递归调用 commitMutationEffects，实现深度优先遍历。
 *
 * 为什么用 while 循环而不是递归？
 * - Fiber 树的 child → sibling 结构天然适合链表遍历
 * - 避免了函数调用的栈开销
 *
 * 遍历过程：
 * parentFiber.child → 第一个子节点
 *   → commitMutationEffects(root, child)  // 递归处理子树
 *   → child.sibling → 下一个兄弟节点
 *   → ...直到 sibling 为 null
 *
 * @param root        - FiberRoot（根容器）
 * @param parentFiber - 当前作为父节点的 Fiber
 */
function recursivelyTraverseMutationEffects(root:FiberRoot,parentFiber:Fiber){
    let child=parentFiber.child
    // 遍历 child 开头的单链表（child → sibling → sibling → ...）
    while(child!==null){
        // 递归处理每个子节点的子树
        commitMutationEffects(root,child);
        // 移动到下一个兄弟节点
        child=child.sibling;
    }
}

/**
 * 提交协调阶段产生的副作用（根据 flags 执行对应的 DOM 操作）
 *
 * 检查 finishedWork.flags 中的副作用标记，执行对应的 DOM 操作：
 * - Placement（0b001）：节点需要插入到 DOM 树中
 * - Update（待实现）：节点需要更新 DOM 属性
 * - ChildDeletion（待实现）：子节点需要从 DOM 树中删除
 *
 * 处理完 Placement 后，通过位取反（~Placement）清除该标记，
 * 避免重复处理。
 *
 * @param finishedWork - 需要处理副作用的 Fiber 节点
 */
function commitReconciliationEffects(finishedWork:Fiber){
    const flags=finishedWork.flags;
    // 使用位与运算判断是否有 Placement 标记
    if(flags&Placement){
        // 页面初次渲染，或节点位置发生变化时，执行插入操作
        commitPlacement(finishedWork);
        // 清除 Placement 标记（位取反后位与）：flags = flags & ~Placement
        finishedWork.flags&=~Placement;
    }
    if(flags&ChildDeletion){
        const parentFiber=isHostParent(finishedWork)?finishedWork:getHostParenFiber(finishedWork);
        const parentDom=parentFiber.stateNode
        commitDeletions(finishedWork.deletions,parentDom);
        finishedWork.flags&=~ChildDeletion;
        finishedWork.deletions=null
    }
}

/**
 * 执行删除操作：把待删除节点的真实 DOM 从父 DOM 中移除
 *
 * 遍历 deletions 数组（在协调阶段由 deleteChild 收集），
 * 逐个找到它们对应的真实 DOM 节点并调用 removeChild 删除。
 *
 * @param deletions - 待删除的 Fiber 节点数组
 * @param parentDom - 父 DOM 节点（删除操作的目标父容器）
 */
function commitDeletions(
    deletions:Array<Fiber>,
    parentDom:Element|Document|DocumentFragment
){
    deletions.forEach(deletion=>{
        parentDom.removeChild(getStateNode(deletion))
    })
}

/**
 * 向下查找 Fiber 子树中第一个有真实 DOM 节点的后代
 *
 * 从给定 Fiber 出发，沿 child 指针一直向下，直到找到
 * 一个 isHost（HostComponent/HostRoot 等原生节点）且 stateNode 非空的节点。
 *
 * 为什么需要它？
 * 删除/插入时，FunctionComponent 等节点本身没有 DOM，
 * 需要向下找到其子树中第一个真实的 DOM 节点。
 *
 * @param fiber - 需要查找 DOM 节点的 Fiber
 * @returns 第一个真实 DOM 节点
 */
function getStateNode(fiber:Fiber){
    let node =fiber;
    while(1){
        if(isHost(node)&&node.stateNode){
            return node.stateNode;
        }
        node=node.child as Fiber;
    }
}

/**
 * 执行 DOM 节点的插入操作
 *
 * 将 finishedWork 对应的真实 DOM 节点插入到父 DOM 节点中。
 *
 * 核心步骤：
 * 1. 确认 finishedWork 有对应的真实 DOM 节点（stateNode）且是 HostComponent
 * 2. 通过 getHostParenFiber 向上查找最近的有 DOM 节点的祖先 Fiber
 * 3. 获取父 DOM 节点（注意处理 HostRoot 的情况：其 stateNode 是 FiberRoot，
 *    真实的容器 DOM 在 stateNode.container 中）
 * 4. 找到要插入位置之后的「宿主兄弟节点」before（见 getHostSibling）
 * 5. 若 before 存在则 insertBefore，否则 append 到父 DOM 末尾
 *
 * @param finishedWork - 需要插入 DOM 的 Fiber 节点
 */
function commitPlacement(finishedWork:Fiber){
    // 只处理有真实 DOM 节点的 Fiber（HostComponent），
    // FunctionComponent 等没有 stateNode 的跳过
    if(finishedWork.stateNode&&isHost(finishedWork)){
        // finishedWork 对应的真实 DOM 节点
        const domNode=finishedWork.stateNode;
        // 向上查找最近的有 DOM 节点的祖先 Fiber（HostComponent 或 HostRoot）
        const parentFiber=getHostParenFiber(finishedWork)
        let parentDom=parentFiber.stateNode
        // 如果父 Fiber 是 HostRoot，其 stateNode 是 FiberRoot 对象
        // 真实的容器 DOM（如 <div id="root">）在 FiberRoot.container 中
        if(parentDom.containerInfo){
            //HostRoot
            parentDom=parentDom.containerInfo;
        }
        // 找到插入点：遍历兄弟节点，找到 finishedWork 之后第一个
        // 「有 DOM 且本轮不发生移动」的宿主节点，作为 insertBefore 的锚点
        const before=getHostSibling(finishedWork)
        insertOrAppendPlacementNode(finishedWork,before,parentDom)
        // 旧实现：直接 appendChild —— 只能追加到末尾，无法处理「移动到中间」的场景
        // parentDom.appendChild(domNode);
    }else{
        // 当前 Fiber 没有自己的 DOM（如 FunctionComponent），
        // 递归处理其子节点，直到找到有 DOM 的节点执行插入
        let kid=finishedWork.child;
        while (kid!==null){
            commitPlacement(kid)
            kid=kid.sibling;
        }
    }
}

/**
 * 查找当前 Fiber 之后第一个「稳定」的宿主兄弟节点（DOM 节点）
 *
 * 这是实现节点「移动到正确位置」的关键。当节点被标记 Placement 需要插入时，
 * 不能简单地 appendChild 到末尾，而要找到它后面第一个「本轮不会移动」的
 * 已有 DOM 节点作为锚点，用 insertBefore 插到该锚点之前。
 *
 * 查找逻辑（带标签的 while 循环 + 递归下降）：
 * 1. 从 fiber 出发向右找兄弟节点（sibling）；若当前层没有兄弟，
 *    则沿 return 向上，直到遇到有兄弟的祖先或宿主父节点。
 * 2. 对找到的兄弟节点：如果它不是宿主节点，就向下找它的 child，
 *    直到找到一个宿主节点（跳过那些本身也标记了 Placement 的节点——
 *    它们也会移动，不能作为锚点）。
 * 3. 找到的宿主节点若未标记 Placement（本轮不移动），返回它的 stateNode。
 *
 * @param fiber - 需要确定插入位置的 Fiber
 * @returns 锚点 DOM 节点（插到它之前）；找不到则返回 null（追加到末尾）
 */
function getHostSibling(fiber:Fiber){
    let node=fiber;
    // 标签循环：continue sibling 会跳到这一层，重新开始寻找兄弟
    sibling:while(1){
        // 当前节点没有兄弟 → 沿 return 向上找祖先的兄弟
        while(node.sibling===null){
            // 回溯到根节点 / 宿主父节点 → 没有可用的锚点
            if(node.return===null||isHostParent(node.return)){
                return null
            }
            node=node.return;
        }
        // 向右移动到兄弟节点
        node=node.sibling;
        // 向下寻找兄弟子树中的第一个宿主节点
        while(!isHost(node)){
            // 兄弟节点本身也要移动 → 不能作为锚点，跳过继续找下一个兄弟
            if(node.flags&Placement){
                continue sibling
            }
            if(node.child===null){
                // 该节点没有子节点，向下找不到宿主节点 → 跳过
                continue sibling;
            }else{
                // 有子节点 → 继续向下深入
                node=node.child
            }
        }
        // 找到宿主节点且它本轮不移动 → 作为锚点返回
        if(!(node.flags&Placement)){
            return node.stateNode
        }
    }
}

/**
 * 将节点的真实 DOM 插入到父 DOM 的指定位置
 *
 * - before 存在 → 用 insertBefore 插到锚点之前（保持正确顺序）
 * - before 为 null → 用 append 追加到父 DOM 末尾
 *
 * @param node   - 需要插入的 Fiber
 * @param before - 锚点 DOM 节点（可为 null）
 * @param parent - 父 DOM 节点
 */
function insertOrAppendPlacementNode(
    node:Fiber,
    before:Element,
    parent:Element
){
    if(before){
        // 插到锚点之前：保证「移动到中间」的场景顺序正确
        parent.insertBefore(getStateNode(node),before)
    }else{
        // 没有锚点 → 追加到末尾
        parent.append(getStateNode(node));
    }
}

/**
 * 向上查找最近的有 DOM 节点的祖先 Fiber
 *
 * 从当前 Fiber 开始，沿着 return 指针向上遍历，直到找到
 * 一个 HostComponent（原生 DOM 标签）或 HostRoot（根节点）。
 *
 * 为什么需要这个函数？
 * Fiber 树中可能包含没有 DOM 节点的组件（如 FunctionComponent、Context.Provider 等），
 * 这些组件的子节点需要挂载到更上层的 DOM 祖先中。
 *
 * 例如：
 *   <div>                    ← HostComponent（有 DOM），这是宿主父节点
 *     <MyComponent>          ← FunctionComponent（无 DOM），跳过
 *       <span>hello</span>   ← HostComponent（有 DOM），需要挂到 <div> 下
 *
 * @param fiber - 需要查找宿主父节点的 Fiber
 * @returns 最近的有 DOM 节点的祖先 Fiber
 * @throws 如果向上查找到 null 都没有找到宿主父节点，抛出错误
 */
function getHostParenFiber(fiber:Fiber):Fiber{
    let parent=fiber.return
    // 沿 return 指针向上遍历祖先链
    while(parent!==null){
        if(isHostParent(parent)){
            return parent;
        }
        parent=parent.return
    }
    // 理论上不应该走到这里：至少根节点 HostRoot 一定在祖先链中
    throw new Error('Expected to find a host parent')
}

/**
 * 判断一个 Fiber 是否是有 DOM 节点的"宿主" Fiber
 *
 * 宿主 Fiber 的定义：其 stateNode 是真实的 DOM 节点（或 DOM 容器）。
 * - HostComponent（tag=5）：原生 DOM 标签，stateNode 是 DOM 元素
 * - HostRoot（tag=3）：根节点，stateNode 是 FiberRoot，其 container 属性指向容器 DOM
 *
 * @param fiber - 待判断的 Fiber 节点
 * @returns 如果该 Fiber 拥有 DOM 节点（可作为挂载目标），返回 true
 */
function isHostParent(fiber:Fiber){
    return fiber.tag===HostComponent||fiber.tag===HostRoot;
}