/**
 * which-react.ts —— Demo 应用的模块导出中转站
 *
 * 这个文件的作用是将本地 mini-react 源码包中实现的 API
 * 统一导出，供 demo 应用以类似真实 React 的方式使用。
 *
 * 设计意图：
 * - 在 demo 中 import { ReactDOM, useReducer, ... } from "../which-react"
 *   就像在实际项目中 import ReactDOM from "react-dom/client" 一样
 * - 底层实际导入的是本地 packages 目录中的源码实现
 * - 方便在真实 react 和 mini-react 之间切换：只需修改这个文件即可
 *
 * 对应关系：
 * - ReactDOM  ← react-dom/client/ReactDomRoot.ts（自定义 reconciler 的入口）
 * - Fragment   ← shared/ReactSymbols（React.Fragment 的 symbol 标识）
 * - Component  ← react/src/ReactBaseClasses（类组件的基类）
 * - useReducer ← react-reconciler/src/ReactFiberHooks（Hook 实现）
 * - useState   ← react-reconciler/src/ReactFiberHooks（基于 useReducer 实现）
 */

// 以下是使用真实 React 时的导入方式（注释掉作为参考）：
// import React, { useReducer, useState, Component, useEffect, useLayoutEffect } from "react";
// import ReactDOM from "react-dom/client";
// import { Component, useReducer, useState, useEffect, useLayoutEffect } from "../packages/react/src";

import {Fragment, Component, useReducer,useState,useMemo,useCallback,useRef} from '../packages/react/src/index.ts'
import ReactDOM from "../packages/react-dom/client/ReactDomRoot.ts";

export {
    ReactDOM,
    Fragment,
    Component,
    useReducer,
    useState,
    useMemo,
    useCallback,
    useRef
    // useEffect,
    // useLayoutEffect
};
