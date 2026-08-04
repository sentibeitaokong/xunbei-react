import {FiberRoot} from "./ReactInternalTypes";
import {scheduleCallback} from 'scheduler/src/Scheduler'
import {NormalPriority} from 'scheduler/src/SchedulerPriorities'

export function ensureRootIsScheduled(root:FiberRoot){
    queueMicrotask(()=>{
        scheduleTaskForRootDuringMincrotask(root);
    })
}

function scheduleTaskForRootDuringMincrotask(root:FiberRoot){
    scheduleCallback(NormalPriority,performConcurrentWorkOnroot.bind(null,root))
}