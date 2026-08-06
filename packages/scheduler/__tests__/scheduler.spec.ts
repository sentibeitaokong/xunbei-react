// Scheduler 任务调度测试

import {describe, expect, it} from "vitest";
import {ImmediatePriority, NormalPriority,scheduleCallback, UserBlockingPriority,} from "../index";

describe("任务", () => {
    it("2个相同优先级的任务", () => {
        let eventTasks: Array<string> = [];

        scheduleCallback(NormalPriority, () => {
            eventTasks.push("Task1");

            expect(eventTasks).toEqual(["Task1"]);
        });

        scheduleCallback(NormalPriority, () => {
            eventTasks.push("Task2");
            expect(eventTasks).toEqual(["Task1", "Task2"]);
        });
    });

    it("3个不同优先级的任务", () => {
        let eventTasks: Array<string> = [];

        scheduleCallback(NormalPriority, () => {
            eventTasks.push("Task1");
            expect(eventTasks).toEqual(["Task3", "Task2", "Task1"]);
        });

        scheduleCallback(UserBlockingPriority, () => {
            eventTasks.push("Task2");
            expect(eventTasks).toEqual(["Task3", "Task2"]);
        });

        scheduleCallback(ImmediatePriority, () => {
            eventTasks.push("Task3");
            expect(eventTasks).toEqual(["Task3"]);
        });
    });

    it("4个不同优先级的任务", () => {
        let eventTasks: Array<string> = [];

        scheduleCallback(NormalPriority, () => {
            eventTasks.push("Task1");
            expect(eventTasks).toEqual(["Task3", "Task2", "Task1"]);
        });

        scheduleCallback(UserBlockingPriority, () => {
            eventTasks.push("Task2");
            expect(eventTasks).toEqual(["Task3", "Task2"]);
        });

        scheduleCallback(ImmediatePriority, () => {
            eventTasks.push("Task3");
            expect(eventTasks).toEqual(["Task3"]);
        });

        scheduleCallback(NormalPriority, () => {
            eventTasks.push("Task4");

            expect(eventTasks).toEqual(["Task3", "Task2", "Task1", "Task4"]);
        });
    });
});
