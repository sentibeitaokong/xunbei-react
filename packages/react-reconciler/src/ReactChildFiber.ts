// 子节点协调 —— 将 ReactElement 转换为 Fiber 节点

import type {Fiber} from "./ReactInternalTypes";
import {REACT_ELEMENT_TYPE} from 'shared/ReactSymbols'
import type {ReactElement} from 'shared/ReactTypes'
import {createFiberFromElement, createFiberFromText} from "./ReactFiber";
import {Placement} from "./ReactFiberFlags";
import {isArray} from 'shared/utils'

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
    //协调单个文本节点
    function reconcileSingleTextNode(
        returnFiber: Fiber,
        currentFirstChild: Fiber | null,
        textContent: string,
    ){
        let createdFiber = createFiberFromText(textContent);
        createdFiber.return = returnFiber;
        return createdFiber;
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
    //多个子节点创建FIber节点
    function createChild(
        returnFiber: Fiber,
        newChild: any
    ):Fiber|null{
        //单个文本节点
        if(isText(newChild)){
            let createdFiber = createFiberFromText(newChild+'');
            createdFiber.return = returnFiber;
            return createdFiber;
        }
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
    //协调多个子节点
    function reconcileChildArray(
        returnFiber: Fiber,
        currentFirstChild: Fiber | null,
        newChildren: Array<any>,
    ){
        //头节点
        let resultFirstChild:Fiber | null=null;
        let previousNewFiber:Fiber | null=null;
        //初次渲染没有老节点
        let oldFiber=currentFirstChild;
        let newIndex=0
        if(oldFiber===null){
            for(;newIndex<newChildren.length;newIndex++){
                const newFiber=createChild(returnFiber,newChildren[newIndex])
                if(newFiber==null){
                    continue;
                }
                //记录FIber节点下标，更新阶段有助于Diff算法
                newFiber.index=newIndex
                if(previousNewFiber===null){
                    resultFirstChild=newFiber
                }else{
                    previousNewFiber.sibling=newFiber
                }
                previousNewFiber=newFiber
            }
            return resultFirstChild
        }
        return resultFirstChild;
    }
    function isText(newChild:any){
        return (
            (typeof newChild==='string'&&newChild!=='')||
                (typeof newChild==='number')
        )
    }
    // 派发 newChild 到对应的协调函数（按类型：单个元素 / 文本 / 数组）
    function reconcileChildFibers(
        returnFiber: Fiber,
        currentFirstChild: Fiber | null,
        newChild: any,
    ) {
        //单个文本节点
        if(isText(newChild)){
            return placeSingleChild(reconcileSingleTextNode(returnFiber, currentFirstChild, newChild+''))
        }
        //单个React Element子节点
        if (typeof newChild === 'object' && newChild !== null) {
            switch (newChild.$$typeof) {
                case REACT_ELEMENT_TYPE: {
                    return placeSingleChild(
                        reconcileSingleElement(returnFiber, currentFirstChild, newChild)
                    )
                }
            }
        }
        //子节点是数组
        if(isArray(newChild)){
            return reconcileChildArray(returnFiber, currentFirstChild, newChild)
        }
        // TODO: 支持文本节点和数组子节点
        return null
    }
    return reconcileChildFibers;
}