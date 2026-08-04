/**
 * Fiber 副作用标记（Flags）
 *
 * React 使用二进制位掩码来表示 Fiber 节点需要的 DOM 操作类型。
 * 每个标记占用一个二进制位，可以通过位运算（| &）高效地组合和检测多个标记。
 *
 * 例如：
 * - Placement | Update = 0b110 → 表示该节点既需要插入又需要更新
 * - flags & Placement  → 检测是否需要插入操作
 *
 * 当前已启用的标记：
 * - Placement      (0b...010):  需要插入 DOM
 * - Update         (0b...100):  需要更新 DOM 属性
 * - ChildDeletion  (0b...1000): 需要删除子节点
 * - ContentReset   (0b...10000):需要重置文本内容
 * - Incomplete     : 渲染未完成，需要重新处理
 * - Forked         : 节点被克隆（用于 Suspense 等场景）
 */

export type Flags = number;

/** 无副作用标记——初始状态，表示不需要执行任何 DOM 操作 */
export const NoFlags = /*                      */ 0b000000000000000000000000;

/** 插入标记——需要将对应 DOM 节点插入到父节点中 */
export const Placement = /*                    */ 0b000000000000000000000010;
/** 更新标记——需要更新 DOM 节点的属性（如 className、style、事件等） */
export const Update = /*                       */ 0b000000000000000000000100;
/** 删除子节点标记——需要删除该 Fiber 的子 DOM 节点 */
export const ChildDeletion = /*                */ 0b00000000000000000000001000;
/** 重置文本内容标记——需要重置文本节点的内容 */
export const ContentReset = /*                 */ 0b00000000000000000000010000;

// 以下标记不是传统意义上的副作用，但复用 Flags 字段存储：
/** 未完成标记——该 Fiber 的渲染未完成，需要重新处理（用于错误边界等场景） */
export const Incomplete = /*                   */ 0b00000000000100000000000000;
/** 克隆标记——该 Fiber 被克隆了一份（用于 Suspense 的 offscreen 切换等场景） */
export const Forked = /*                       */ 0b00000010000000000000000000;
