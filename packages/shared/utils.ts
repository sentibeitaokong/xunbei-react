// 共享工具函数

// 获取当前高精度时间戳（ms），用于时间切片计算
export function getCurrentTime(): number {
    return performance.now();
}

export function isArray(sth: any) {
    return Array.isArray(sth);
}

export function isNum(sth: any) {
    return typeof sth === "number";
}

export function isObject(sth: any) {
    return typeof sth === "object";
}

export function isFn(sth: any) {
    return typeof sth === "function";
}

export function isStr(sth: any) {
    return typeof sth === "string";
}
