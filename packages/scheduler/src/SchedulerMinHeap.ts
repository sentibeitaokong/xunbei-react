// 最小堆实现 —— 用于任务调度器按优先级排序

export type Heap<T extends Node> = Array<T>

export type Node = {
    id: number, // 唯一标识，同优先级时按 id 排序兜底
    sortIndex: number // 排序依据（任务队列中为 expirationTime）
}

// 取出堆顶元素（最小值），不删除
export function peek<T extends Node>(heap: Heap<T>): T | null {
    return heap.length === 0 ? null : heap[0]
}

// 向最小堆添加元素，自底向上调整
export function push<T extends Node>(heap: Heap<T>, node: T): void {
    const index = heap.length
    heap.push(node)
    shiftUp(heap, node, index)
}

// 自底向上调整：将节点与父节点比较，若更小则交换
function shiftUp<T extends Node>(heap: Heap<T>, node: T, index: number): void {
    while(index>0){
        const parentIndex = (index - 1) >>> 1
        const parent = heap[parentIndex]
        // 父节点比当前节点大 → 交换位置
        if (compare(parent, node) > 0) {
            heap[parentIndex]=node
            heap[index]=parent
            index=parentIndex
        }else{
            return
        }
    }
}

// 弹出堆顶元素（最小值），将最后一个元素移到堆顶后自顶向下调整
export function pop<T extends Node>(heap: Heap<T>): T | null {
    if (heap.length === 0) {
        return null
    }
    const first = heap[0]
    const last = heap.pop()
    // 有两个及以上节点时，将最后元素移到堆顶，重新调整
    if (first !== last) {
        heap[0] = last as T;
        shiftDown(heap, last as T, 0)
    }
    return first
}

// 自顶向下调整：将节点与左右子节点中较小者比较，若更大则下沉
function shiftDown<T extends Node>(heap: Heap<T>, node: T, index: number): void {
    const length = heap.length
    // 只需遍历前半部分（非叶子节点）
    const halfLength = length >>> 1
    while (index < halfLength) {
        const leftIndex = (index + 1) * 2 - 1
        const left = heap[leftIndex]
        const rightIndex = leftIndex + 1
        const right = heap[rightIndex] // right 不一定存在

        if (compare(left, node) < 0) {
            // 左子节点更小
            if (rightIndex < length && compare(right, left) < 0) {
                // 右子节点比左子节点还小 → 与右子节点交换
                heap[index] = right
                heap[rightIndex] = node
                index = rightIndex
            } else {
                // 左子节点最小（或右子节点不存在）→ 与左子节点交换
                heap[index] = left
                heap[leftIndex] = node
                index = leftIndex
            }
        } else if (rightIndex < length && compare(right, node) < 0) {
            // 仅右子节点更小 → 与右子节点交换
            heap[index] = right
            heap[rightIndex] = node
            index = rightIndex
        } else {
            return
        }
    }
}

// 比较函数：先按 sortIndex 排序，相同时按 id 排序（保证稳定性）
function compare(a: Node, b: Node) {
    const diff = a.sortIndex - b.sortIndex;
    return diff !== 0 ? diff : a.id - b.id
}