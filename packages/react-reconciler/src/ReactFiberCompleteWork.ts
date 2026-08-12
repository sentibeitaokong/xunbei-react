/**
 * ReactFiberCompleteWork.ts —— Fiber 树构建的"归"阶段
 *
 * 在深度优先遍历 Fiber 树的过程中，beginWork 负责"递"（向下深入），
 * completeWork 负责"归"（向上回溯）。
 *
 * completeWork 的主要职责：
 * 1. 为 HostComponent（原生 DOM 标签）创建真实的 DOM 节点
 * 2. 初始化 DOM 属性（props → DOM attributes）
 * 3. 将子 DOM 节点挂载到父 DOM 节点上，构建真实 DOM 树
 * 4. 处理组件实例的生命周期和 ref
 *
 * 执行时机：当一个 Fiber 的所有子节点都已处理完毕后，开始处理该 Fiber 自身
 * 执行顺序：子节点 → 兄弟节点 → 父节点（自底向上）
 */

import type {Fiber} from "./ReactInternalTypes";
import {HostComponent, HostRoot, HostText, Fragment, ClassComponent, FunctionComponent} from "./ReactWorkTags";
import {isStr,isNum} from "shared/utils"

/**
 * 完成一个 Fiber 节点的工作（"归"阶段的核心函数）
 *
 * 根据 Fiber 的 tag 类型执行不同的处理逻辑：
 * - HostRoot：根节点无需创建 DOM，直接返回
 * - HostComponent：原生 DOM 标签，创建真实 DOM 并初始化属性
 *
 * 对于 HostComponent，需要完成三件事：
 * 1. 创建真实的 DOM 元素（document.createElement）
 * 2. 初始化 DOM 属性（设置 children/textContent 及其他 attributes）
 * 3. 将子 DOM 挂载到当前 DOM 上（appendChild），构建完整的 DOM 子树
 *
 * @param current        - current 树中对应的 Fiber 节点（可能为 null，首次渲染时）
 * @param workInProgress - 当前正在处理的 workInProgress Fiber
 * @returns 下一个需要处理的 Fiber，或 null 表示当前子树已处理完毕
 */
export function completeWork(
    current: Fiber | null,
    workInProgress: Fiber
): Fiber | null {
    const newProps=workInProgress.pendingProps
    switch(workInProgress.tag) {
        case Fragment:
        case ClassComponent:
        case FunctionComponent:
        case HostRoot:{
            // 根 Fiber 没有对应的 DOM 节点，直接返回 null 继续向上回溯
            return null
        }
        case HostComponent:{
            // 原生 DOM 标签（如 div、span、p），type 就是标签名字符串
            const {type} = workInProgress;
            if(current!==null&&workInProgress.stateNode!=null){
                //update
                updateHostComponent(current,workInProgress,type,newProps)
            }else{
                //mount
                // 1. 创建真实的 DOM 节点：document.createElement('div')
                const instance=document.createElement(type);
                // 2. 初始化 DOM 属性：children 设为 textContent，其他属性直接赋值
                finalizeInitialChildren(instance,null,newProps)
                // 3. 将所有子 Fiber 对应的真实 DOM 挂载到当前 DOM 上
                //    通过递归遍历 child → sibling 链表，收集所有后代 DOM 节点
                appendAllChildren(instance,workInProgress)
                // 将创建好的 DOM 节点关联到 Fiber.stateNode，供 commit 阶段使用
                workInProgress.stateNode=instance
            }
            return null
        }
        case HostText:{
            workInProgress.stateNode=document.createTextNode(newProps)
            return null
        }
    }
    throw new Error(
        `Unknown unit of work tag (${workInProgress.tag}). This error is likely caused by a bug in ` +
        'React. Please file an issue.',
    );
}
function updateHostComponent(
    current: Fiber | null,
    workInProgress: Fiber,
    type:string,
    newProps:any,
){
    if(current?.memoizedProps===newProps){
        return
    }
    finalizeInitialChildren(
        workInProgress.stateNode as Element,
        current?.memoizedProps,
        newProps
    );
}

/**
 * 初始化 DOM 元素的属性
 *
 * 将 Fiber 的 pendingProps 应用到真实的 DOM 元素上：
 * - children 属性特殊处理：如果是字符串或数字，直接设置为 textContent
 * - 其他属性：直接赋值到 DOM 元素上（如 className、style、onClick 等）
 *
 * 注意：此处是简化实现，React 源码中会根据属性类型（事件、样式、DOM 属性等）
 * 做更精细的处理，并对比 oldProps 和 newProps 只更新变化的部分。
 *
 * @param domElement - 需要初始化的真实 DOM 元素
 * @param props      - Fiber 的 pendingProps（即将应用的属性）
 */
function finalizeInitialChildren(domElement:Element,prevProps:any,nextProps:any){
    //遍历老的props
    for(const propKey in prevProps){
        const prevProp = prevProps[propKey];
        if(propKey==='children'){
            if(isStr(prevProp)||isNum(prevProp)){
                (domElement as any).textContent='';
            }
        }else{
            // 将其他属性直接赋值到 DOM 元素上
            if(propKey==='onClick'){
                domElement.removeEventListener("click", prevProp);
            }else{
                if(!(prevProp in nextProps)){
                    (domElement as any)[propKey]='';
                }
            }

        }
    }
    //遍历新的props
    for(const propKey in nextProps){
        const nextProp = nextProps[propKey];
        if(propKey==='children'){
            // children 是字符串/数字时，直接设置为文本内容
            // 复杂 children（数组/Fiber）已在 JSX 编译时展开为 Fiber 树，此处不会出现
            if(isStr(nextProp)||isNum(nextProp)){
                (domElement as any).textContent=nextProp+'';
            }
        }else{
            // 将其他属性直接赋值到 DOM 元素上
            if(propKey==='onClick'){
                domElement.addEventListener("click", nextProp);
            }
            // 简化处理：实际 React 会区分 className→class、事件绑定、style 对象等
            (domElement as any)[propKey]=nextProp;
        }
    }
}

/**
 * 将所有子 Fiber 对应的真实 DOM 节点挂载到父 DOM 下
 *
 * 遍历 workInProgress 的 child 链表，将每个子 Fiber.stateNode（真实 DOM）
 * 通过 appendChild 挂载到父 DOM 元素上，构建完整的 DOM 树。
 *
 * 注意：此处仅挂载第一个子节点。完整的实现需要递归收集所有后代
 * HostComponent 的 stateNode，因为中间可能有非 DOM 的 Fiber（如 FunctionComponent）。
 *
 * @param parent       - 父 DOM 元素（已创建的真实 DOM）
 * @param workInProgress - 当前 Fiber 节点（需要将其子 DOM 挂载到 parent 下）
 */
function appendAllChildren(parent:Element,workInProgress:Fiber){
    let nodeFiber=workInProgress.child  //链表结构
    while(nodeFiber!==null){
        if(isHost(nodeFiber)){
            parent.appendChild(nodeFiber.stateNode)
        }else if(nodeFiber.child!==null){
            nodeFiber=nodeFiber.child
            continue
        }
        if(nodeFiber===workInProgress){
            return
        }
        while (nodeFiber.sibling===null){
            if(nodeFiber.return===null||nodeFiber.return===workInProgress){
                return
            }
            nodeFiber=nodeFiber.return
        }
        nodeFiber=nodeFiber.sibling
    }
}

export function isHost(fiber:Fiber):boolean{
    return fiber.tag===HostComponent||fiber.tag===HostText
}