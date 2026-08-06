// ReactDOM 入口 —— createRoot API

import type {ReactNodeList} from 'shared/ReactTypes'
import type {Container, FiberRoot} from 'react-reconciler/src/ReactInternalTypes'
import {createFiberRoot} from 'react-reconciler/src/ReactFiberRoot'
import {updateContainer} from 'react-reconciler/src/ReactFiberReconciler'

type RootType = {
    render: (children: ReactNodeList) => void,
    _internalRoot: FiberRoot,
}

// 创建 React 根节点，绑定到 DOM 容器
export function createRoot(container: Container): RootType {
    const root: FiberRoot = createFiberRoot(container)
    return new ReactDOMRoot(root)
}

// ReactDOMRoot 构造函数 —— 持有 FiberRoot 引用
function ReactDOMRoot(_internalRoot: FiberRoot) {
    this._internalRoot = _internalRoot
}

// render 方法：触发更新调度
ReactDOMRoot.prototype.render = function (children: ReactNodeList) {
    updateContainer(children, this._internalRoot)
}
export default {
    createRoot
}