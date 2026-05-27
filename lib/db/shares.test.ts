import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./index";
import {
  deleteShare,
  getAllShares,
  getShare,
  putShare,
  replaceProjectSharedData,
} from "./shares";
import type { Marker, Task, TaskType } from "@/lib/types";

beforeEach(async () => {
  await Promise.all([
    db.tasks.clear(),
    db.markers.clear(),
    db.taskTypes.clear(),
    db.shares.clear(),
  ]);
});

const tt = (id: string, projectId: string): TaskType => ({
  id,
  projectId,
  name: id,
  mode: "tint",
  k: 0.5,
  order: 0,
  createdAt: 0,
});
const task = (id: string, projectId: string): Task => ({
  id,
  projectId,
  taskTypeId: `${projectId}-type`,
  title: id,
  startDate: "2026-05-01",
  endDate: "2026-05-02",
  createdAt: 0,
  updatedAt: 0,
});
const marker = (id: string, projectId: string): Marker => ({
  id,
  kind: "event",
  label: id,
  date: "2026-05-03",
  projectId,
  createdAt: 0,
});

describe("share registry CRUD", () => {
  it("round-trips editToken and publishedAt", async () => {
    await putShare({
      projectId: "pA",
      token: "viewtok0123456789",
      editToken: "edittok0123456789",
      url: "https://blob/x.json",
      publishedAt: 1234,
    });
    const got = await getShare("pA");
    expect(got?.token).toBe("viewtok0123456789");
    expect(got?.editToken).toBe("edittok0123456789");
    expect(got?.publishedAt).toBe(1234);
    expect(typeof got?.updatedAt).toBe("number");

    await deleteShare("pA");
    expect(await getShare("pA")).toBeUndefined();
    expect(await getAllShares()).toHaveLength(0);
  });
});

describe("replaceProjectSharedData (pull)", () => {
  it("replaces only the target project's tasks and markers", async () => {
    // Two projects' data already local.
    await db.tasks.bulkPut([task("a1", "pA"), task("a2", "pA"), task("b1", "pB")]);
    await db.markers.bulkPut([marker("am", "pA"), marker("bm", "pB")]);
    await db.taskTypes.bulkPut([tt("pA-type", "pA"), tt("pB-type", "pB")]);

    // Pull pA's shared copy: one different task, no markers.
    await replaceProjectSharedData("pA", {
      taskTypes: [tt("pA-type", "pA")],
      tasks: [task("a9", "pA")],
      markers: [],
    });

    const tasks = await db.tasks.toArray();
    const markers = await db.markers.toArray();
    // pA's old tasks gone, replaced by the pulled one; pB untouched.
    expect(tasks.map((t) => t.id).sort()).toEqual(["a9", "b1"]);
    // pA's marker removed (the pulled copy had none); pB's marker stays.
    expect(markers.map((m) => m.id).sort()).toEqual(["bm"]);
  });

  it("upserts the project's task types from the snapshot", async () => {
    await db.taskTypes.bulkPut([tt("pA-type", "pA")]);
    await replaceProjectSharedData("pA", {
      taskTypes: [{ ...tt("pA-type", "pA"), name: "renamed" }],
      tasks: [],
      markers: [],
    });
    expect((await db.taskTypes.get("pA-type"))?.name).toBe("renamed");
  });
});
