import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./index";
import { createProject, getAllProjects, getProject, updateProject, deleteProject } from "./projects";
import {
  createTaskType,
  getAllTaskTypes,
  getTaskType,
  updateTaskType,
  deleteTaskType,
} from "./taskTypes";
import {
  createTask,
  getAllTasks,
  getTask,
  getTasksByProject,
  updateTask,
  deleteTask,
} from "./tasks";
import { createMarker, getAllMarkers, getMarker, updateMarker, deleteMarker } from "./markers";
import { seedIfEmpty } from "./seed";
import { DEFAULT_PROJECT_COLOR, DEFAULT_PROJECT_NAME, TASK_TYPE_TONES } from "@/lib/color/tokens";

/** Wipe every table before each test for isolation. */
beforeEach(async () => {
  await Promise.all([
    db.projects.clear(),
    db.taskTypes.clear(),
    db.tasks.clear(),
    db.markers.clear(),
  ]);
});

describe("project CRUD", () => {
  it("creates, reads, updates, and deletes", async () => {
    const created = await createProject({
      name: "기본",
      color: DEFAULT_PROJECT_COLOR,
      visible: true,
      order: 0,
    });
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeTypeOf("number");

    expect(await getProject(created.id)).toMatchObject({ name: "기본", visible: true });

    await updateProject(created.id, { name: "마케팅", visible: false });
    expect(await getProject(created.id)).toMatchObject({ name: "마케팅", visible: false });

    await deleteProject(created.id);
    expect(await getProject(created.id)).toBeUndefined();
  });

  it("lists projects ordered by `order`", async () => {
    await createProject({ name: "C", color: "#3175B9", visible: true, order: 2 });
    await createProject({ name: "A", color: "#B9313D", visible: true, order: 0 });
    await createProject({ name: "B", color: "#31B96A", visible: true, order: 1 });
    expect((await getAllProjects()).map((p) => p.name)).toEqual(["A", "B", "C"]);
  });
});

describe("task type CRUD", () => {
  it("creates, reads, updates, and deletes", async () => {
    const created = await createTaskType({ name: "마감", mode: "dark", k: 0.4, order: 0 });
    expect(await getTaskType(created.id)).toMatchObject({ mode: "dark", k: 0.4 });

    await updateTaskType(created.id, { name: "데드라인", k: 0.5 });
    expect(await getTaskType(created.id)).toMatchObject({ name: "데드라인", k: 0.5 });

    await deleteTaskType(created.id);
    expect(await getTaskType(created.id)).toBeUndefined();
  });
});

describe("task CRUD", () => {
  it("creates with createdAt === updatedAt and bumps updatedAt on update", async () => {
    const task = await createTask({
      projectId: "p1",
      taskTypeId: "t1",
      title: "기획서 작성",
      startDate: "2026-05-21",
      endDate: "2026-05-24",
    });
    expect(task.createdAt).toBe(task.updatedAt);

    await updateTask(task.id, { title: "기획서 검토", endDate: "2026-05-25" });
    const updated = await getTask(task.id);
    expect(updated).toMatchObject({ title: "기획서 검토", endDate: "2026-05-25" });
    expect(updated!.updatedAt).toBeGreaterThanOrEqual(updated!.createdAt);

    await deleteTask(task.id);
    expect(await getTask(task.id)).toBeUndefined();
  });

  it("orders by startDate and filters by project", async () => {
    await createTask({ projectId: "p1", taskTypeId: "t1", title: "B", startDate: "2026-05-10", endDate: "2026-05-11" });
    await createTask({ projectId: "p2", taskTypeId: "t1", title: "A", startDate: "2026-05-01", endDate: "2026-05-02" });
    await createTask({ projectId: "p1", taskTypeId: "t1", title: "C", startDate: "2026-05-20", endDate: "2026-05-21" });

    expect((await getAllTasks()).map((t) => t.title)).toEqual(["A", "B", "C"]);
    expect((await getTasksByProject("p1")).map((t) => t.title).sort()).toEqual(["B", "C"]);
  });
});

describe("marker CRUD", () => {
  it("creates event/deadline markers, updates, lists by date, and deletes", async () => {
    const deadline = await createMarker({ kind: "deadline", label: "발표", date: "2026-05-30" });
    const event = await createMarker({ kind: "event", label: "워크숍", date: "2026-05-15", projectId: "p1" });

    expect(await getMarker(deadline.id)).toMatchObject({ kind: "deadline", label: "발표" });
    expect(event.projectId).toBe("p1");

    await updateMarker(deadline.id, { label: "최종 발표" });
    expect(await getMarker(deadline.id)).toMatchObject({ label: "최종 발표" });

    expect((await getAllMarkers()).map((m) => m.label)).toEqual(["워크숍", "최종 발표"]);

    await deleteMarker(event.id);
    expect(await getMarker(event.id)).toBeUndefined();
  });
});

describe("seedIfEmpty", () => {
  it("seeds one default project + 4 task types on first run", async () => {
    await seedIfEmpty();

    const projects = await getAllProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      name: DEFAULT_PROJECT_NAME,
      color: DEFAULT_PROJECT_COLOR,
      visible: true,
    });

    const taskTypes = await getAllTaskTypes();
    expect(taskTypes.map((t) => t.name)).toEqual(TASK_TYPE_TONES.map((t) => t.name));
    expect(taskTypes.map((t) => `${t.mode}:${t.k}`)).toEqual(
      TASK_TYPE_TONES.map((t) => `${t.mode}:${t.k}`),
    );
  });

  it("is idempotent (does not duplicate on a second call)", async () => {
    await seedIfEmpty();
    await seedIfEmpty();
    expect(await getAllProjects()).toHaveLength(1);
    expect(await getAllTaskTypes()).toHaveLength(TASK_TYPE_TONES.length);
  });
});
