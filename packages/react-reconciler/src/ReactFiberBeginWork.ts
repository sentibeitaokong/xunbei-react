import type {Fiber} from "./ReactInternalTypes";

//1.处理当前Fiber,因为不同组件对应的fiber处理方式不同
//2.返回子节点
export function beginWork(
    current: Fiber|null,
    workInProgress:Fiber
):Fiber|null {

}