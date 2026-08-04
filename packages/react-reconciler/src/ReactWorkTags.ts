/**
 * Fiber 节点类型标签（WorkTag）
 *
 * 每个 Fiber 节点都有一个 tag 属性，标识该节点的类型。
 * 不同类型的 Fiber 在 reconcile（协调）和 commit（提交）阶段有不同的处理逻辑。
 *
 * 使用数字常量而非字符串，是为了在运行时进行高效的 switch-case 比较。
 */

/** WorkTag 联合类型——所有可能的 Fiber 类型标签值 */
export type WorkTag =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25;

// ==================== 基础组件类型 ====================

/** 0 - 函数组件（Function Component）：通过 function 定义的组件 */
export const FunctionComponent = 0;
/** 1 - 类组件（Class Component）：通过 class 定义的组件 */
export const ClassComponent = 1;
/** 2 - 待确定类型（Indeterminate Component）：尚未确定是函数组件还是类组件，首次渲染时根据实际调用情况判断 */
export const IndeterminateComponent = 2; // Before we know whether it is function or class

// ==================== 宿主环境相关类型 ====================

/** 3 - 根节点（Host Root）：Fiber 树的根节点，通常是 ReactDOM.createRoot() 创建的 */
export const HostRoot = 3; // Root of a host tree. Could be nested inside another node.
/** 4 - 传送门（Host Portal）：用于 ReactDOM.createPortal()，将子节点渲染到不同的 DOM 节点中 */
export const HostPortal = 4; // A subtree. Could be an entry point to a different renderer.
/** 5 - 原生 DOM 组件（Host Component）：对应真实的 DOM 元素，如 <div>、<span>、<p> 等 */
export const HostComponent = 5;
/** 6 - 文本节点（Host Text）：对应 DOM 中的文本节点 */
export const HostText = 6;

// ==================== 内置组件类型 ====================

/** 7 - Fragment：<React.Fragment> 或 <>...</>，不生成额外的 DOM 节点 */
export const Fragment = 7;
/** 8 - Mode：<React.StrictMode> 等模式组件 */
export const Mode = 8;
/** 9 - Context 消费者（Context Consumer）：使用 useContext() 或 <Context.Consumer> */
export const ContextConsumer = 9;
/** 10 - Context 提供者（Context Provider）：<Context.Provider value={...}> */
export const ContextProvider = 10;

// ==================== 高级特性组件类型 ====================

/** 11 - ForwardRef：React.forwardRef() 创建的组件，用于转发 ref */
export const ForwardRef = 11;
/** 12 - Profiler：<React.Profiler>，用于性能分析 */
export const Profiler = 12;
/** 13 - Suspense：<React.Suspense>，用于代码分割和异步加载 */
export const SuspenseComponent = 13;
/** 14 - Memo 组件：React.memo() 创建的组件，用于性能优化（浅比较 props） */
export const MemoComponent = 14;
/** 15 - Simple Memo 组件：React.memo() 包裹的函数组件的内部表示 */
export const SimpleMemoComponent = 15;
/** 16 - Lazy 组件：React.lazy() 创建的懒加载组件 */
export const LazyComponent = 16;
/** 17 - 未完成的类组件：类组件在构建过程中出错时的临时标记 */
export const IncompleteClassComponent = 17;
/** 18 - Dehydrated Fragment：SSR 水合过程中的 Fragment */
export const DehydratedFragment = 18;
/** 19 - SuspenseList：<SuspenseList>，控制多个 Suspense 的显示顺序 */
export const SuspenseListComponent = 19;

// ==================== 实验性 / 内部组件类型 ====================

/** 21 - Scope 组件：用于 CSS 作用域隔离的实验性组件 */
export const ScopeComponent = 21;
/** 22 - Offscreen 组件：用于离屏渲染（如 keep-alive、tab 切换保持状态） */
export const OffscreenComponent = 22;
/** 23 - Legacy Hidden 组件：旧版的隐藏组件 */
export const LegacyHiddenComponent = 23;
/** 24 - Cache 组件：用于数据缓存的组件 */
export const CacheComponent = 24;
/** 25 - Tracing Marker 组件：用于性能追踪标记的组件 */
export const TracingMarkerComponent = 25;
