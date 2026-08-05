import type {FiberRoot} from "./ReactInternalTypes";
import {scheduleCallback} from 'scheduler/src/Scheduler'
import {NormalPriority} from 'scheduler/src/SchedulerPriorities'
import {performConcurrentWorkOnroot} from "./ReactFiberWorkLoop";

export function ensureRootIsScheduled(root:FiberRoot){
    queueMicrotask(()=>{
        scheduleTaskForRootDuringMincrotask(root);
    })
}

function scheduleTaskForRootDuringMincrotask(root:FiberRoot){
    scheduleCallback(NormalPriority,performConcurrentWorkOnroot.bind(null,root))
}