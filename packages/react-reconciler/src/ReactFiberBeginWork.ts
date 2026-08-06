import type {Fiber} from "./ReactInternalTypes";
import {HostRoot,HostComponent} from "./ReactWorkTags";
import {mountChildFibers,reconcileChildFibers} from "./ReactChildFiber";
import {shouldSetTextContent} from '../../react-dom/client/ReactDOMHostConfig'

//1.处理当前Fiber,因为不同组件对应的fiber处理方式不同
//2.返回子节点child
export function beginWork(
    current: Fiber|null,
    workInProgress:Fiber
):Fiber|null {
    switch (workInProgress.tag) {
        case HostRoot:
            return updateHostRoot(current, workInProgress);
        case HostComponent:
            return updateHostComponent(current, workInProgress);
    }
    //todo
    throw new Error(
        `Unknown unit of work tag (${workInProgress.tag}). This error is likely caused by a bug in ` +
        'React. Please file an issue.',
    );
}

function updateHostRoot(
    current: Fiber|null,
    workInProgress:Fiber
){
    const nextChildren=workInProgress.memoizedState.element
    reconcileChildren(current, workInProgress,nextChildren)
    return workInProgress.child
}
//原生标签，div,span
//初次渲染 协调 bailout(复用）
function updateHostComponent(
    current: Fiber|null,
    workInProgress:Fiber
){
    const {type,pendingProps} = workInProgress;
    const isDirectTextChild=shouldSetTextContent(type, pendingProps);
    if(isDirectTextChild){
        //文本属性
        return null
    }
    // 如果原生标签只有一个文本，这个时候文本不会再生成fiber节点，而是当作这个原生标签的属性
    const nextChildren=workInProgress.pendingProps.children
    reconcileChildren(current, workInProgress,nextChildren)
    return workInProgress.child
}

function reconcileChildren(current: Fiber|null, workInProgress:Fiber,nextChildren:any){
    if(current===null){
        //初次挂载
        workInProgress.child=mountChildFibers(workInProgress,null,nextChildren);
    }else {
        workInProgress.child = reconcileChildFibers(
            workInProgress,
            current.child,
            nextChildren,
        );
    }
}