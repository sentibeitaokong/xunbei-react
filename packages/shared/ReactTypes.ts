// 共享类型定义 —— React 核心类型

// 源码位置信息
export type Source = {
  fileName: string;
  lineNumber: number;
};

export type ReactElement = {
  $$typeof: any;  // 元素类型标识（Symbol），用于安全校验
  type: any;       // 组件类型：函数/类/字符串标签名
  key: any;        // diff 算法中标识身份的 key
  ref: any;        // ref 引用
  props: any;      // 组件属性
  _owner: any;     // 创建该元素的父 Fiber（内部使用）
};

export type ReactNode = ReactElement | ReactText | ReactFragment;

export type ReactEmpty = null | void | boolean;

export type ReactFragment = ReactEmpty | Iterable<ReactNode>;

export type ReactNodeList = ReactEmpty | ReactNode;

export type ReactText = string | number;
