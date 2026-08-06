import type {FiberRoot} from "./ReactInternalTypes";
import type {ReactNodeList} from 'shared/ReactTypes'
import {scheduleUpdateOnFiber} from "./ReactFiberWorkLoop";

export function updateContainer(element:ReactNodeList,container:FiberRoot):void{
    //! 1.获取current
    const current=container.current;
    current.memoizedState={element}
    // ! 2.调度更新
    scheduleUpdateOnFiber(container,current)
}