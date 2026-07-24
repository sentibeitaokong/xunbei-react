import {T} from "vitest/dist/chunks/traces.d.D2T_R8rx";

export type Heap<T extends Node>=Array<T>
export type Node={
    id:number, //唯一标识
    sortIndex: number //排序依据
}
// ! 取出堆顶元素
export  function peek<T extends Node>(heap:Heap<T>):T | null {
    return heap.length === 0 ? null : heap[0]
}

// ! 给堆添加元素
export function push<T extends Node>(heap:Heap<T>,node:T):void{
     //1.把node节点放在最后面,并记录堆最后一个节点的下标
    const index=heap.length;
    heap.push(node)
    //2.调整最小堆，从下往上堆
    shiftUp(heap,node,index)
}
// ! 从下往上堆
function shiftUp<T extends Node>(heap:Heap<T>,node:T,index:number):void{
    while(index>0){
        //获取堆最后一个节点的父节点的下标
        const parentIndex=(index-1)>>>1
        const parent=heap[parentIndex]
        //如果父节点比当前节点大，交换位置
        if(compare(parent,node)>0){
            heap[parentIndex]=node
            heap[index]=parent
            index=parentIndex
        }else{
            return
        }
    }
}

// ! 删除堆顶元素
export function pop<T extends Node>(heap:Heap<T>):T|null{
    if(heap.length===0){
        return null
    }
    const first=heap[0]
    const last=heap.pop()
    //说明有两个以上的节点
    if(first!==last){
        //把堆顶元素换成最后一个元素，然后从上到下排列堆
        heap[0]=last;
        shiftDown(heap,last,0)
    }
    return first
}

function shiftDown<T extends Node>(heap: Heap<T>, node: T, index: number):void{
    const length=heap.length
    //取到左边堆的长度，可能不包含这个堆的最下最右的那个节点
    const halfLength=length>>>1
    //遍历堆的左边
    while(index<halfLength){
        //获取左边堆的左右索引和节点
        const leftIndex=(index+1)*2-1
        const left=heap[leftIndex]
        const rightIndex=leftIndex+1
        const right=heap[rightIndex] //rigth不一定存在
        //如果左节点比当前节点小，就替换当前节点
        if(compare(left,node)<0){
            //rigth存在，并且比左节点小就交换位置
            if(rightIndex<length&&compare(right,left)<0){
                heap[index]=right
                heap[rightIndex]=node
                index=rightIndex
            }else{
                //left最小，或者right不存在
                heap[index]=left
                heap[leftIndex]=node
                index=leftIndex
            }
        }else if(rightIndex<length&&compare(right,node)<0){
            heap[index]=right
            heap[rightIndex]=node
            index=rightIndex
        }else{
            return;
        }
    }
}

function compare(a:Node,b:Node){
    const diff=a.sortIndex-b.sortIndex;
    return diff!==0?diff:a.id-b.id
}