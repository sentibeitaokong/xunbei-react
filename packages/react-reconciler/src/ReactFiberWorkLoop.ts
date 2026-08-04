import type {FiberRoot,Fiber} from "./ReactInternalTypes";
import {ensureRootIsScheduled} from "./ReactFiberRootScheduler";

let workInProgress :Fiber|null=null
let workProgressRoot:FiberRoot|null=null;

export function scheduleUpdateOnFiber(root:FiberRoot,fiber:Fiber){
    workProgressRoot=root;
    workInProgress = fiber;
    ensureRootIsScheduled(root)
}

export function performConcurrentWorkOnroot(root:FiberRoot){
    //! 1.render构建Fiber树VDom
    //! 2.commit，VDom->Dom

}

