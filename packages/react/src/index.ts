/**
 * React 包的公共 API 入口
 *
 * 这是 mini-react 的"门面"，对外暴露 React 的核心 API。
 * 在真实 React 源码中，这个文件会导出 useState、useEffect、
 * createElement、createContext 等数十个 API。
 *
 * 当前实现导出了三个最基础的能力：
 *
 * 1. Fragment（React.Fragment）
 *    - 对应 shared/ReactSymbols 中的 REACT_FRAGMENT_TYPE
 *    - 用于在不额外创建 DOM 节点的情况下包裹多个子元素
 *    - JSX 中的 <>...</> 编译后就是 Fragment
 *
 * 2. useReducer / useState
 *    - 对应 react-reconciler/src/ReactFiberHooks 中的实现
 *    - useReducer 通过 reducer 函数管理组件状态，是 useState 的底层实现
 *    - useState 是 useReducer 的语法糖（reducer 传 null），返回 [state, setState]
 *
 * 3. Component
 *    - 对应当前包的 ReactBaseClasses 模块
 *    - 所有类组件的基类，提供 setState 等能力
 *    - 通过 extends Component 来定义类组件
 *
 * 依赖关系：
 * react 包依赖 react-reconciler（调度协调）和 shared（共享工具/Symbol）
 * 使用者（demo/应用层）只依赖 react 和 react-dom，不直接接触 reconciler
 */

export {REACT_FRAGMENT_TYPE as Fragment} from "shared/ReactSymbols";
export {useReducer,useState} from 'react-reconciler/src/ReactFiberHooks'
export {Component} from './ReactBaseClasses'
