/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

/**
 * ReactHookEffectTags.ts —— Effect Hook 的标记位定义
 *
 * 与 ReactFiberFlags（Fiber 节点的副作用标记）不同，
 * 这里的 HookFlags 专门用于「单个 Effect 对象」上，描述一个 effect 的
 * 「是否需要执行」以及「在哪个阶段执行」。
 *
 * 位掩码设计（4 位二进制，可用位运算 | & 组合）：
 * - HasEffect      (0b0001): 是否需要「触发」该 effect
 * - HookInsertion  (0b0010): 插入阶段执行（useInsertionEffect 专用，本实现暂未使用）
 * - HookLayout     (0b0100): 布局阶段执行（useLayoutEffect 专用）
 * - HookPassive    (0b1000): 被动阶段执行（useEffect 专用）
 *
 * 组合示例：
 * - HookLayout | HasEffect   = 0b0101 → 需要在布局阶段触发的 effect
 * - HookPassive | HasEffect  = 0b1001 → 需要在被动阶段触发的 effect
 * - 检测：effect.tag & HookPassive → 判断是否属于被动 effect
 */

// HookFlags 的类型别名：底层就是 number（位掩码）
export type HookFlags = number;

/** 无标记 —— 表示该 effect 无需任何处理 */
export const NoFlags = /*   */ 0b0000;

// Represents whether effect should fire.
// 表示该 effect 是否需要「触发」（执行 create 回调）。
// 依赖未变化时，此位不被置上，effect 会被跳过执行。
export const HasEffect = /* */ 0b0001;

// Represents the phase in which the effect (not the clean-up) fires.
// 以下三位表示 effect 的执行阶段（注意：cleanup 的执行时机由 React 统一调度，不由此位决定）
// useInsertionEffect：在 DOM 变更前同步执行（供 CSS-in-JS 库注入样式），本实现暂未使用
export const HookInsertion = /* */ 0b0010;
// useLayoutEffect：在 DOM 变更后、浏览器绘制前同步执行
export const HookLayout = /*    */ 0b0100;
// useEffect：在浏览器绘制后异步执行（不阻塞绘制）
export const HookPassive = /*   */ 0b1000;
