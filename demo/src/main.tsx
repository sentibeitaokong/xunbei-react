/**
 * main.tsx —— Mini-React Demo 入口文件
 *
 * 这个文件展示了 mini-react 的核心能力：
 * 1. 函数组件 + useReducer / useState Hook
 * 2. 类组件（extends Component）
 * 3. Fragment 组件（<>...</>）
 * 4. useEffect / useLayoutEffect 副作用 Hook
 * 5. useMemo / useCallback / useRef / memo 性能优化 API
 * 6. JSX 编译后的渲染流程
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
import {memo} from "react";

import {
    Component,
    Fragment,
    ReactDOM,
    useCallback,
    useEffect,
    useLayoutEffect,
    useReducer,
    useRef,
    useState,
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
function FunctionComponent(props: { name: string }) {
    // useReducer 返回 [state, dispatch]
    // reducer: (x) => x + 1   —— 每次 dispatch 时状态 +1
    // initialArg: 0            —— 初始状态值
    const [count, setCount] = useReducer((x) => x + 1, 2);

    // useState 示例：基于 useReducer 实现（reducer 传 null），点击按钮时 count2 +1
    // 注意：useState 与 useReducer 共用同一套 Hook 链表，两者按调用顺序依次入链
    const [count2, setCount2] = useState(0);

    // useEffect —— 被动副作用（passive effect）
    // 1. 首次渲染后：effect 回调在 commit 阶段的「被动效果」里异步执行（flushPassiveEffects）
    // 2. count2 变化后：先执行上一次返回的 cleanup，再执行新的 effect 回调
    // 3. 组件卸载时：执行最后一次 cleanup
    // 依赖数组 [count2] 决定 effect 何时重新执行：浅比较，count2 变化才触发
    useEffect(() => {
      console.log("omg useEffect", count2);
      return () => console.log("cleanup useEffect", count2);
    }, [count2]);

    // useLayoutEffect —— 布局副作用（layout effect）
    // 与 useEffect 的区别在于执行时机：
    // - useLayoutEffect 在 DOM 变更（mutation）之后、浏览器绘制之前「同步」执行
    // - useEffect 则在绘制之后「异步」执行
    // 因此 useLayoutEffect 适合读取/修改布局信息（会阻塞绘制），useEffect 适合非阻塞逻辑（如请求、订阅）
    // 源码对应：hook.memoizedState 中的 effectTag 区分 Passive / Layout 两种 tag
    useLayoutEffect(() => {
      console.log("omg useLayoutEffect", count2);
      return () => console.log("cleanup useLayoutEffect", count2);
    }, [count2]);

    return (
        <div className="border">
            {/* <p>{props.name}</p> */}
            <button onClick={() => setCount()}>{count}</button>
            <button onClick={() => setCount2(count1 => count1 + 1)}>{count2}</button>
            {/* 以下三行用于验证协调阶段对「空值」子节点的处理：
                null / undefined / boolean 都不渲染任何 DOM，
                对应 reconcileChildFibers 中 return null 的分支 */}
            {count % 2 === 0 ? <h1>null</h1> : null}
            {count % 2 === 0 ? <h1>undefined</h1> : undefined}
            {count % 2 === 0 && <h1>boolean</h1>}

            {/* 点击按钮 → dispatch → reducer 计算新状态 → 调度更新 → 重新渲染 */}
            {/*{*/}
            {/*    count%2===0?(*/}
            {/*        <button*/}
            {/*            onClick={() => {*/}
            {/*                setCount(count + 1);*/}
            {/*            }}>*/}
            {/*            {count}*/}
            {/*        </button>*/}
            {/*    ):(*/}
            {/*      <span  onClick={() => {*/}
            {/*          setCount(count + 1);*/}
            {/*      }}>react</span>*/}
            {/*    )*/}
            {/*}*/}

            {/* 条件渲染示例（注释掉）：根据 count 奇偶性切换标签类型 */}
            {/* {count % 2 ? <div>omg</div> : <span>123</span>} */}

            {/* Diff 算法示例（注释掉）：展示 key 在列表 Diff 中的作用
                当 count2 === 2 时切换数组顺序，触发节点的移动/复用 */}
            {/*<ul>*/}
            {/*  {count %2==0*/}
            {/*    ? [3,2,0,4,1].map((item) => <li key={item}>{item}</li>)*/}
            {/*    : [0, 1, 2,3, 4].map((item) => <li key={item}>{item}</li>)}*/}
            {/*</ul>*/}
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
        <FunctionComponent name="函数组件"/>
    </div>
);

/**
 * UseMemoPage —— useMemo 用法示例组件
 *
 * 说明：当前代码刻意「注释掉」了 useMemo 版本，改用普通函数 expensive() 做对比，
 * 便于观察 useMemo 的缓存价值：
 * - 不使用 useMemo：每次渲染都会重新执行 expensive() 计算（哪怕 value 变化也会重算）
 * - 使用 useMemo：只有当依赖数组 [count] 变化时才重新计算，value 变化时直接返回缓存值
 *
 * useRef 用法：
 * - useRef(0) 返回一个 { current: 0 } 的可变引用对象
 * - 修改 ref.current 不会触发组件重新渲染（区别于 setState）
 * - 常用于保存不参与渲染的可变数据、或获取 DOM 节点引用
 */
export default function UseMemoPage(props) {
    const [count, setCount] = useState(0);
    const [value, setValue] = useState(1);
    // useRef 示例：ref.current 初始为 0，通过 handleClick 累加并 alert，
    // 但 ref 变化不会引起重新渲染（点击 click 按钮后界面上的 count/value 不变）
    let ref = useRef(0)

    // 使用 useMemo 的版本（被注释掉）：
    // 当 count 变化时才重新执行计算，value 变化时直接返回上一次的缓存结果
    // const expensive = useMemo(() => {
    //     console.log("compute");
    //     let sum = 0;
    //     for (let i = 0; i < count; i++) {
    //         sum += i;
    //     }
    //     return sum;
    //     //只有count变化，这里才重新执行
    // }, [count]);
    console.log("render", {count, value});

    // 普通函数版本：每次渲染都会被调用重新计算（对比 useMemo 的缓存行为）
    const expensive = () => {
        console.log("compute", {count});

        let sum = 0;
        for (let i = 0; i < count; i++) {
            sum += i;
        }
        return sum;
        //只有count变化，这里才重新执行
    };

    // 累加 ref.current 并弹出：演示 ref 变化不触发渲染
    function handleClick() {
        ref.current = ref.current + 1;
        alert(ref.current);
    }

    return (
        <div>
            <h3>UseMemoPage</h3>
            {value}
            <p>expensive:{expensive()}</p>
            <p>{count}</p>
            <button onClick={() => setCount(count + 1)}>add</button>
            <button onClick={() => handleClick()}>click</button>
        </div>
    );
}

/**
 * UseCallbackPage —— useCallback 用法示例组件
 *
 * useCallback 的作用：缓存函数引用，避免子组件因「函数每次渲染都是新引用」而被迫重新渲染。
 * 依赖数组 [count] 变化时才会返回新的函数；否则每次渲染返回同一个函数引用。
 *
 * 典型场景：配合 React.memo 使用 —— 只有当 addClick 引用变化时，ChildMemo 才会重新渲染，
 * 否则即使父组件 UseCallbackPage 因 value 变化而重渲染，ChildMemo 也能被跳过。
 */
function UseCallbackPage(props) {
    const [count, setCount] = useState(0);
    // useCallback 缓存 addClick：依赖 [count]，仅当 count 变化才重新创建函数
    const addClick = useCallback(() => {
        let sum = 0;
        for (let i = 0; i < count; i++) {
            sum += i;
        }
        return sum;
    }, [count]);

    // 不使用 useCallback 的版本（被注释掉）：每次渲染都会生成新函数引用，
    // 传给 memo 包裹的 ChildMemo 后会导致其每次都被重新渲染，失去 memo 的优化效果
    // const addClick = () => {
    //   let sum = 0;
    //   for (let i = 0; i < count; i++) {
    //     sum += i;
    //   }
    //   return sum;
    // };
    const [value, setValue] = useState("");
    return (
        <div>
            <h3>UseCallbackPage</h3>
            <p>{count}</p>
            <button onClick={() => setCount(count + 1)}>add</button>
            {/* value 变化只影响自身，不改变 addClick 引用，因此 ChildMemo 不会重渲染 */}
            <input value={value} onChange={(event) => setValue(event.target.value)}/>
            <ChildMemo addClick={addClick}/>
        </div>
    );
}

/**
 * ChildMemo —— memo 高阶组件示例
 *
 * React.memo 的作用：对函数组件做「浅比较」优化，
 * 仅当传入的 props 发生浅层变化时才重新渲染，否则直接复用上一次的渲染结果。
 *
 * 与 useCallback 配合：addClick 引用不变 → memo 判定 props 未变 → 跳过 ChildMemo 重渲染。
 * 调试技巧：通过 console.log("Child") 观察 ChildMemo 是否被重新渲染。
 */
const ChildMemo = memo(function Child({addClick}) {
    // useEffect(() => {
    //     return () => {
    //         console.log("destroy"); //sy-log
    //     };
    // }, []);
    console.log("Child"); //sy-log
    return (
        <div className="border">
            <button onClick={() => console.log(addClick())}>add</button>
        </div>
    );
});

/**
 * FunctionComponent2 —— useEffect / useLayoutEffect 对比示例组件
 *
 * 这个组件是当前 demo 的「入口组件」（见文件末尾 render(<FunctionComponent2/>)），
 * 用于观察两类副作用 Hook 的执行时机与清理时机：
 *
 * 1. useLayoutEffect（layout effect，同步）：
 *    - 依赖 [count1]，点击第一个按钮 count1 变化时触发
 *    - 在 DOM 变更后、浏览器绘制前「同步」执行，可用于读取/修改布局
 * 2. useEffect（passive effect，异步）：
 *    - 依赖 [count2]，点击第二个按钮 count2 变化时触发
 *    - 在浏览器绘制后「异步」执行，不阻塞绘制
 *
 * cleanup 执行顺序（React 官方语义）：
 * - 更新前：先执行「上一次」effect 返回的 cleanup，再执行「新的」effect
 * - 卸载前：执行最后一次 cleanup
 * 通过控制台的打印顺序可验证 layout effect 与 passive effect 的执行先后。
 */
function FunctionComponent2() {
    // count1：使用 useReducer，reducer (x) => x + 1 使状态每次 +1
    const [count1, setCount1] = useReducer((x: any) => x + 1, 0);
    // count2：使用 useState，初值 1
    const [count2, setCount2] = useState(1);
    // const [txt, setTxt] = useState("");
    //layoutEffect —— 布局副作用：依赖 [count1]
    useLayoutEffect(() => {
        console.log("useLayoutEffect"); //sy-log
        return () => {
            console.log("useLayoutEffect: before update or before unmount"); //sy-log
        };
    }, [count1]);
    //passiveEffect —— 被动副作用：依赖 [count2]
    useEffect(() => {
        console.log("useEffect"); //sy-log
        return () => {
            console.log("useEffect: before update or before unmount"); //sy-log
        };
    }, [count2]);
    return (
        <div className="border">

            {/* 点击触发 setCount1(count1 + 1)：count1 变化 → 对应 useLayoutEffect 重新执行 */}
            <button
                onClick={() => {
                    setCount1(count1 + 1);
                }}
            >
                {count1}
            </button>
            {/* 点击触发 setCount2(count2 + 1)：count2 变化 → 对应 useEffect 重新执行 */}
            <button
                onClick={() => {
                    setCount2(count2 + 1);
                }}
            >
                {count2}
            </button>
            {/* 把 count1、count2 传给子组件 Child，观察父子组件各自 effect 的执行顺序 */}
            <Child count1={count1} count2={count2}></Child>
            {/*{count1 % 3 !== 0 ? <Child count1={count1} count2={count2} /> : null}*/}

            {/*<input*/}
            {/*  type="text"*/}
            {/*  value={txt}*/}
            {/*  onChange={(e) => {*/}
            {/*    console.log(*/}
            {/*      "%c [  ]-31",*/}
            {/*      "font-size:13px; background:pink; color:#bf2c9f;",*/}
            {/*      e.target.value*/}
            {/*    );*/}
            {/*    setTxt(e.target.value);*/}
            {/*  }}*/}
            {/*/>*/}
        </div>
    );
}

/**
 * Child —— 子组件，用于观察父子组件 effect 的执行顺序
 *
 * 接收 count1、count2 两个 props，分别驱动自己的 useLayoutEffect 与 useEffect：
 * - useLayoutEffect 依赖 [count1]：count1 变化时同步执行
 * - useEffect      依赖 [count2]：count2 变化时异步执行
 *
 * 执行顺序验证：effect 先子后父（commit 阶段自底向上），
 * 而 useLayoutEffect 先于 useEffect 执行（layout 在绘制前、passive 在绘制后）。
 */
function Child({ count1, count2 }: { count1: number, count2: number }) {
    useLayoutEffect(() => {
        console.log("useLayoutEffect Child"); //sy-log
        return () => {
            console.log("useLayoutEffect: before update or before unmount"); //sy-log
        };
    }, [count1]);

    useEffect(() => {
        console.log("useEffect Child"); //sy-log
        return () => {
            console.log("useEffect: before update or before unmount"); //sy-log
        };
    }, [count2]);

    return <div>Child</div>;
}

/**
 * 启动整个 React 应用
 *
 * ReactDOM.createRoot(container) 的执行流程：
 * 1. 创建 FiberRoot 容器对象（包含 current、containerInfo 等）
 * 2. .render(jsx) → 将 jsx 存入 root.current.memoizedState.element
 * 3. 调用 scheduleUpdateOnFiber(root, hostFiber) 启动调度
 * 4. Scheduler 回调 performConcurrentWorkOnroot → Render + Commit
 */
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<FunctionComponent2/>);
