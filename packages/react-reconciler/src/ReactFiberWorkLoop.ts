import type {FiberRoot,Fiber} from "./ReactInternalTypes";
import {ensureRootIsScheduled} from "./ReactFiberRootScheduler";
import {createWorkInProgress} from "./ReactFiber";
import {beginWork} from "./ReactFiberBeginWork";

type ExecutionContext = number;

// 代表当前 React 处于空闲状态，什么也没做
export const NoContext = /*             */ 0b0000000;
// 代表当前处于批量更新的上下文中（比如 React 包裹的点击事件中）
const BatchedContext = /*               */ 0b0000001;
// 代表当前正在执行 Render 阶段（正在构建 Fiber 树，调用组件函数）
export const RenderContext = /*         */ 0b0001000;
// 代表当前正在执行 Commit 阶段（正在将变化同步到真实 DOM 上）
export const CommitContext = /*         */ 0b0010000;
// 代表当前处于错误重试的上下文中
export const RetryAfterError = /*       */ 0b0100000;

// 全局变量，记录当前的执行上下文，默认是 NoContext (0)
let executionContext: ExecutionContext = NoContext;

let workInProgress :Fiber|null=null
let workProgressRoot:FiberRoot|null=null;

export function scheduleUpdateOnFiber(root:FiberRoot,fiber:Fiber){
    workProgressRoot=root;
    workInProgress = fiber;
    ensureRootIsScheduled(root)
}

export function performConcurrentWorkOnroot(root:FiberRoot){
    //! 1.render构建Fiber树VDom
    renderRootSync(root)
    //! 2.commit，VDom->Dom
    // commitRoot(root)
}

function renderRootSync(root:FiberRoot){
    //! 1.render阶段开始
    const prevExecutionContext = executionContext;
    executionContext|=RenderContext
    //! 2.初始化
    prepareFreshStack(root);
    //! 3.遍历构建Fiber树
    wookLoopSync()
    //! 4.render结束
    executionContext=prevExecutionContext
    workProgressRoot=null
}

function prepareFreshStack(root:FiberRoot):Fiber{
    root.finishedWork=null
    workProgressRoot=root; //FiberRoot
    const rootWorkInProgress=createWorkInProgress(root.current,null) //Fiber
    workInProgress=rootWorkInProgress;  //Fiber
    return rootWorkInProgress
}

function wookLoopSync(){
    while(workInProgress!==null){
        performUnitOfWork(workInProgress);
    }
}

function performUnitOfWork(unitOfWork:Fiber){
    const current=unitOfWork.alternate;
    // ! 1.beginWork
    let next=beginWork(current,unitOfWork)
    // 1.1 执行自己
    if(next===null){
        completeUnitOfWork(unitOfWork)
    }else{
        workInProgress=next;
    }
    // 1.2 (协调,bailout) 返回子节点
    // ! 2.completeWork
}
//深度优先遍历，子节点，兄弟节点，叔叔节点，爷爷的兄弟节点
function completeUnitOfWork(unitOfWork:Fiber){
    let completedWork=unitOfWork;
    do{
        let next=completeWork(unitOfWork);
        if(next!==null){
            workInProgress=next;
            return
        }
        const siblingFiber=completedWork.sibling;
        if(siblingFiber!==null){
            workInProgress=siblingFiber;
            return
        }
        completedWork=completedWork.return
        workInProgress=completedWork
    }while(completedWork!==null);
}



