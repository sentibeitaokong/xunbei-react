/**
 * main.tsx —— Mini-React Demo 入口文件
 *
 * 这个文件展示了 mini-react 的核心能力：
 * 1. 函数组件 + useReducer Hook
 * 2. 类组件（extends Component）
 * 3. Fragment 组件（<>...</>）
 * 4. JSX 编译后的渲染流程
 *
 * 架构说明：
 * - 上方 import 从 "../which-react" 导入（而非真实 react/react-dom 包）
 * - which-react.ts 是一个中转模块，实际从 packages/ 目录导入源码实现
 * - 最终通过 ReactDOM.createRoot(...).render(jsx) 触发整个渲染流程
 */

// 以下是使用真实 React 时的导入方式（注释掉作为参考）：
// import React from "react";
// import ReactDOM from "react-dom";
// import { useReducer } from "react";

import {
    ReactDOM,
    Fragment,
    Component,
    useReducer,
    // useState,
    // useEffect,
    // useLayoutEffect,
} from "../which-react";

import "./index.css";

/**
 * FunctionComponent —— 函数组件示例
 *
 * 展示函数组件的基本用法：
 * - 通过 props 参数接收父组件传入的属性
 * - 使用 useReducer Hook 管理内部状态（点击 +1）
 * - 返回 JSX 描述 UI 结构
 *
 * 与类组件的区别：
 * - 函数组件本身不是一个类，没有 this，没有生命周期方法
 * - 通过 Hook（useReducer、useState 等）管理状态和副作用
 * - 每次状态更新时，React 会重新调用整个函数
 *
 * useReducer 工作原理：
 * 1. 首次渲染（mount）：创建 hook，将 initialState(0) 存入 hook.memoizedState
 * 2. 用户点击按钮 → 调用 dispatch(action) → reducer 计算新状态
 * 3. 调度器安排一次新渲染，函数组件重新执行，useReducer 返回更新后的值
 */
function FunctionComponent(props: {name: string}) {
    // useReducer 返回 [state, dispatch]
    // reducer: (x) => x + 1   —— 每次 dispatch 时状态 +1
    // initialArg: 0            —— 初始状态值
    const [count, setCount] = useReducer((x) => x + 1, 0);

    // 以下是 useState 和 useEffect 的预留位置（尚未实现）：
    // const [count2, setCount2] = useState(0);
    // useEffect(() => {
    //   console.log("omg useEffect", count2);
    // }, [count2]);
    // useLayoutEffect(() => {
    //   console.log("omg useLayoutEffect", count2);
    // }, [count2]);

    return (
        <div className="border">
            {/* <p>{props.name}</p> */}
            {/* <button onClick={() => setCount()}>{count}</button> */}

            {/* 点击按钮 → dispatch → reducer 计算新状态 → 调度更新 → 重新渲染 */}
            <button
                onClick={() => {
                    setCount(count + 1);
                }}>
                {count}
            </button>

            {/* 条件渲染示例（注释掉）：根据 count 奇偶性切换标签类型 */}
            {/* {count % 2 ? <div>omg</div> : <span>123</span>} */}

            {/* Diff 算法示例（注释掉）：展示 key 在列表 Diff 中的作用
                当 count2 === 2 时切换数组顺序，触发节点的移动/复用 */}
            {/* <ul> */}
            {/*   {count2 === 2 */}
            {/*     ? [2, 1, 3, 4].map((item) => <li key={item}>{item}</li>) */}
            {/*     : [0, 1, 2, 3, 4].map((item) => <li key={item}>{item}</li>)} */}
            {/* </ul> */}
        </div>
    );
}

/**
 * ClassComponent —— 类组件示例
 *
 * 展示类组件的基本用法：
 * - 继承自 Component 基类（由 packages/react/src/ReactBaseClasses 提供）
 * - 通过 this.props 访问父组件传入的属性
 * - render() 方法返回 JSX 描述 UI 结构
 *
 * 与函数组件的区别：
 * - 类组件有实例（this），可以持有内部可变数据
 * - 通过 setState() 触发更新（而非 Hook）
 * - 有完整的生命周期方法（componentDidMount、componentDidUpdate 等）
 *
 * 渲染流程：beginWork 阶段调用 new type(pendingProps) 实例化，再调用 render()
 */
class ClassComponent extends Component<any, any> {
    render() {
        return (
            <div className="border">
                <h3>{this.props.name}</h3>
                我是文本
            </div>
        );
    }
}

// function FunctionComponent(props: any) {
//     return (
//         <div>
//             <h3>{props.name}</h3>
//         </div>
//     );
// }

/**
 * FragmentComponent —— Fragment 组件示例
 *
 * 展示 Fragment（<>...</>）的用法：
 * - Fragment 是一个不创建额外 DOM 节点的"透明容器"
 * - 在 Fiber 树中有对应的 Fragment Fiber 节点，但在 DOM 树中不产生元素
 * - 常用于需要返回多个兄弟元素但不想多包一层 <div> 的场景
 *
 * 编译结果：
 * <> <li>part1</li> <li>part2</li> </>
 * 在编译后被转换为：
 * React.createElement(React.Fragment, null, <li>part1</li>, <li>part2</li>)
 *
 * 在 beginWork 中，Fragment 节点直接返回其子节点继续处理
 * 在 completeWork 中，Fragment 节点不创建 DOM，直接返回 null
 */
function FragmentComponent() {
    return (
        <ul>
            <>
                <li>part1</li>
                <li>part2</li>
            </>
        </ul>
    );
}

// 嵌套 Fragment 示例：Fragment 内部可以再包含 Fragment
let fragment = (
    <>
        <>
            <h1>2222</h1>
        </>
        <li>part1</li>
        <li>part2</li>
    </>
);

// 显式使用 Fragment 组件（带 key 属性）
// 在列表中使用 Fragment 时必须提供 key，用于 Diff 算法的节点复用
let fragment1 = (
    <Fragment key='sy'>
        <h3>1</h3>
        <h4>2</h4>
    </Fragment>
);

/**
 * jsx —— 根 JSX 元素
 *
 * 这是整棵虚拟 DOM 树的根节点，会被传入 ReactDOM.createRoot(...).render(jsx)
 *
 * 渲染流程回顾：
 * 1. render(jsx) → 创建 HostRoot Fiber
 * 2. jsx 作为 HostRoot.memoizedState.element 存储
 * 3. beginWork → updateHostRoot → reconcileChildren → 递归处理子节点
 * 4. completeWork → 自底向上创建真实 DOM
 * 5. commitRoot → Mutation 阶段将 DOM 树插入页面
 */
const jsx = (
    // 多种组件类型可以混合使用：
    // <div className="border">
    //     <h1>react</h1>
    //     <a href="https://github.com/bubucuo/mini-react">mini react</a>
    //     <FunctionComponent name="函数组件" />
    //     <ClassComponent name="类组件" />
    //     <FragmentComponent />
    // </div>

    <div className="box border">
        {/* {fragment1} */}
        {/* <h1 className="border">omg</h1> */}
        {/* <h1>react</h1> */}
        {/* 123 */}
        {/* <ClassComponent name="类组件" /> */}
        <FunctionComponent name="函数组件" />
    </div>
);

/**
 * 启动整个 React 应用
 *
 * ReactDOM.createRoot(container) 的执行流程：
 * 1. 创建 FiberRoot 容器对象（包含 current、containerInfo 等）
 * 2. .render(jsx) → 将 jsx 存入 root.current.memoizedState.element
 * 3. 调用 scheduleUpdateOnFiber(root, hostFiber) 启动调度
 * 4. Scheduler 回调 performConcurrentWorkOnroot → Render + Commit
 */
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(jsx);
