"use client";

/**
 * Top-level client shell that owns the data shared by the calendar and the
 * right "할일" panel (US-008).
 *
 * Centralizing projects / task types / tasks here keeps both views in sync: a
 * task created from a drag-selection appears in the panel immediately, and a
 * panel row click highlights the matching bar in the calendar. Future stories
 * (edit/move, view switch, visibility toggles) mutate this same state.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createMarker,
  createProject,
  createTask,
  createTaskType,
  deleteMarker,
  deleteProject,
  deleteTask,
  deleteTaskType,
  getAllMarkers,
  getAllProjects,
  getAllTaskTypes,
  getAllTasks,
  seedIfEmpty,
  updateMarker,
  updateProject,
  updateTask,
  updateTaskType,
  type MarkerChanges,
  type MarkerInput,
} from "@/lib/db";
import {
  filterTasksByProject,
  filterTasksByTaskTypes,
  filterTasksByVisibleProjects,
} from "@/lib/calendar/view";
import { defaultProjectId, nextProjectOrder } from "@/lib/project/manage";
import {
  defaultTaskTypeId,
  nextTaskTypeOrder,
} from "@/lib/taskType/manage";
import type { DateString, Marker, Project, Task, TaskType } from "@/lib/types";
import { CalendarView } from "./CalendarView";
import type { EditTaskDraft } from "./EditPopover";
import {
  ProjectPopover,
  type DeleteProjectMode,
  type ProjectDraft,
} from "./ProjectPopover";
import { TaskListPanel } from "./TaskListPanel";
import { TaskTypePopover, type TaskTypeDraft } from "./TaskTypePopover";

/** A new task's fields; dates come from the calendar's committed selection. */
export interface NewTaskInput {
  projectId: string;
  taskTypeId: string;
  title: string;
  startDate: DateString;
  endDate: DateString;
}

// How long a panel-selected bar stays ringed in the calendar.
const HIGHLIGHT_MS = 1800;

export function CalendarApp() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);

  // Seed (idempotent) then load all data on mount. Seeding here avoids a race
  // with <DbInit> so the popover always has a project/task-type to pick.
  useEffect(() => {
    let alive = true;
    (async () => {
      await seedIfEmpty();
      const [ps, tts, ts, ms] = await Promise.all([
        getAllProjects(),
        getAllTaskTypes(),
        getAllTasks(),
        getAllMarkers(),
      ]);
      if (!alive) return;
      setProjects(ps);
      setTaskTypes(tts);
      setTasks(ts);
      setMarkers(ms);
    })().catch((err) => console.error("calendar data load failed", err));
    return () => {
      alive = false;
    };
  }, []);

  const projectsById = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  const taskTypesById = useMemo(() => {
    const m = new Map<string, TaskType>();
    for (const tt of taskTypes) m.set(tt.id, tt);
    return m;
  }, [taskTypes]);

  // --- View switch: 전체(통합) ↔ individual project (US-013) -----------------
  // `null` = merged view (all projects, distinguished by hue); a project id =
  // that project's bars only. The same filtered set feeds the calendar and the
  // panel so both stay in sync with the active tab.
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const handleSelectProject = useCallback(
    (id: string | null) => setSelectedProjectId(id),
    [],
  );
  // --- Task-type filter: legend on/off toggles (US-015) ---------------------
  // Ephemeral view state (not persisted) holding the task-type ids toggled off.
  // Empty = every type shown. ANDs with the project filters below.
  const [hiddenTaskTypeIds, setHiddenTaskTypeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const handleToggleTaskType = useCallback((id: string) => {
    setHiddenTaskTypeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Visible set feeding both views: drop tasks of projects toggled off (US-014),
  // narrow to the active tab (US-013), then drop task types toggled off (US-015).
  // All three filters preserve order and compose as an AND.
  const visibleTasks = useMemo(
    () =>
      filterTasksByTaskTypes(
        filterTasksByProject(
          filterTasksByVisibleProjects(tasks, projects),
          selectedProjectId,
        ),
        hiddenTaskTypeIds,
      ),
    [tasks, projects, selectedProjectId, hiddenTaskTypeIds],
  );

  // Toggle a project's visibility (US-014). Persisted to IndexedDB so the state
  // survives a refresh; the shared `projects` state re-derives `visibleTasks`,
  // hiding/showing its bars in the calendar and panel at once.
  const handleToggleProjectVisible = useCallback(
    async (id: string) => {
      const target = projects.find((p) => p.id === id);
      if (!target) return;
      const visible = !target.visible;
      await updateProject(id, { visible });
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, visible } : p)),
      );
    },
    [projects],
  );

  // Persist a new task, then surface it in both views.
  const handleCreateTask = useCallback(async (input: NewTaskInput) => {
    const task = await createTask(input);
    setTasks((prev) => [...prev, task]);
  }, []);

  // Patch an existing task (US-009); both views re-render from this state, so a
  // project/task-type change re-tones the bar and the panel swatch at once.
  const handleUpdateTask = useCallback(
    async (id: string, changes: EditTaskDraft) => {
      await updateTask(id, changes);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, ...changes, updatedAt: Date.now() } : t,
        ),
      );
    },
    [],
  );

  // Move a task's dates while keeping its duration (US-010); only the dates
  // change, so the bar slides and the panel re-sorts on the new start date.
  const handleMoveTask = useCallback(
    async (id: string, startDate: DateString, endDate: DateString) => {
      await updateTask(id, { startDate, endDate });
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, startDate, endDate, updatedAt: Date.now() } : t,
        ),
      );
    },
    [],
  );

  // --- Markers (US-017) -----------------------------------------------------
  // Point-date marks (event / hard deadline). Persist + mirror to shared state
  // so the calendar chips update at once. projectId is left unset (v1).
  const handleCreateMarker = useCallback(async (input: MarkerInput) => {
    const m = await createMarker(input);
    setMarkers((prev) => [...prev, m]);
  }, []);

  const handleUpdateMarker = useCallback(
    async (id: string, changes: MarkerChanges) => {
      await updateMarker(id, changes);
      setMarkers((prev) => prev.map((m) => (m.id === id ? { ...m, ...changes } : m)));
    },
    [],
  );

  const handleDeleteMarker = useCallback(async (id: string) => {
    await deleteMarker(id);
    setMarkers((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // Panel "＋ 마커 추가" asks the calendar to open the marker form for today.
  const [markerAddNonce, setMarkerAddNonce] = useState(0);
  const handleAddMarker = useCallback(() => setMarkerAddNonce((n) => n + 1), []);

  // --- Panel -> calendar highlight ------------------------------------------
  // `highlightNonce` bumps on every click so repeat-clicking the same row
  // re-triggers the scroll; `highlightedTaskId` drives the bar ring.
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [highlightNonce, setHighlightNonce] = useState(0);
  const hlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Delete a task (US-009); drop it from shared state and clear any highlight.
  const handleDeleteTask = useCallback(async (id: string) => {
    await deleteTask(id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setHighlightedTaskId((cur) => (cur === id ? null : cur));
  }, []);

  const handleSelectTask = useCallback((id: string) => {
    setHighlightedTaskId(id);
    setHighlightNonce((n) => n + 1);
    if (hlTimer.current) clearTimeout(hlTimer.current);
    hlTimer.current = setTimeout(() => setHighlightedTaskId(null), HIGHLIGHT_MS);
  }, []);

  useEffect(() => () => {
    if (hlTimer.current) clearTimeout(hlTimer.current);
  }, []);

  // --- Panel -> calendar "+ 할일 추가" --------------------------------------
  // Bumping the nonce asks the calendar to open the create popover for today.
  const [addNonce, setAddNonce] = useState(0);
  const handleAdd = useCallback(() => setAddNonce((n) => n + 1), []);

  // --- Project management (US-011) ------------------------------------------
  // One popover handles create (project:null) and edit/delete. Renaming or
  // recoloring re-tones the bars at once (both views derive bar colors from
  // project.color in this shared state).
  const [projectPopover, setProjectPopover] = useState<{
    project: Project | null;
    x: number;
    y: number;
  } | null>(null);

  // Per-project task counts, for the delete confirmation copy.
  const taskCountByProject = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) m.set(t.projectId, (m.get(t.projectId) ?? 0) + 1);
    return m;
  }, [tasks]);

  const openProjectCreate = useCallback(
    (x: number, y: number) => setProjectPopover({ project: null, x, y }),
    [],
  );
  const openProjectEdit = useCallback(
    (project: Project, x: number, y: number) =>
      setProjectPopover({ project, x, y }),
    [],
  );
  const closeProjectPopover = useCallback(() => setProjectPopover(null), []);

  const handleSaveProject = useCallback(
    async (draft: ProjectDraft) => {
      const editing = projectPopover?.project;
      if (editing) {
        await updateProject(editing.id, { name: draft.name, color: draft.color });
        setProjects((prev) =>
          prev.map((p) => (p.id === editing.id ? { ...p, ...draft } : p)),
        );
      } else {
        const created = await createProject({
          name: draft.name,
          color: draft.color,
          visible: true,
          order: nextProjectOrder(projects),
        });
        setProjects((prev) => [...prev, created]);
      }
      setProjectPopover(null);
    },
    [projectPopover, projects],
  );

  // Delete a project (AC4/AC5). `reassign` moves its tasks to the default
  // project; `deleteTasks` removes them too. Default project never reaches here
  // (the popover hides delete for it).
  const handleDeleteProject = useCallback(
    async (mode: DeleteProjectMode) => {
      const target = projectPopover?.project;
      if (!target) return;
      const affected = tasks.filter((t) => t.projectId === target.id);
      // Reassignment target = the default among the remaining projects.
      const dest =
        mode === "reassign"
          ? defaultProjectId(projects.filter((p) => p.id !== target.id))
          : null;

      if (dest) {
        await Promise.all(
          affected.map((t) => updateTask(t.id, { projectId: dest })),
        );
      } else {
        await Promise.all(affected.map((t) => deleteTask(t.id)));
      }
      await deleteProject(target.id);

      setTasks((prev) =>
        dest
          ? prev.map((t) =>
              t.projectId === target.id
                ? { ...t, projectId: dest, updatedAt: Date.now() }
                : t,
            )
          : prev.filter((t) => t.projectId !== target.id),
      );
      setProjects((prev) => prev.filter((p) => p.id !== target.id));
      // If the deleted project was the active tab, fall back to 전체 (US-013).
      setSelectedProjectId((cur) => (cur === target.id ? null : cur));
      if (!dest) {
        const removed = new Set(affected.map((t) => t.id));
        setHighlightedTaskId((cur) => (cur && removed.has(cur) ? null : cur));
      }
      setProjectPopover(null);
    },
    [projectPopover, tasks, projects],
  );

  // --- Task-type management (US-012) ----------------------------------------
  // One popover handles create (taskType:null) and edit/delete. Task types are
  // global; renaming or retoning re-shades every bar of that type at once (both
  // views derive bar colors from the task type in this shared state).
  const [taskTypePopover, setTaskTypePopover] = useState<{
    taskType: TaskType | null;
    x: number;
    y: number;
  } | null>(null);

  // Per-type task counts, for the delete confirmation copy.
  const taskCountByTaskType = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) m.set(t.taskTypeId, (m.get(t.taskTypeId) ?? 0) + 1);
    return m;
  }, [tasks]);

  const openTaskTypeCreate = useCallback(
    (x: number, y: number) => setTaskTypePopover({ taskType: null, x, y }),
    [],
  );
  const openTaskTypeEdit = useCallback(
    (taskType: TaskType, x: number, y: number) =>
      setTaskTypePopover({ taskType, x, y }),
    [],
  );
  const closeTaskTypePopover = useCallback(() => setTaskTypePopover(null), []);

  const handleSaveTaskType = useCallback(
    async (draft: TaskTypeDraft) => {
      const editing = taskTypePopover?.taskType;
      if (editing) {
        await updateTaskType(editing.id, {
          name: draft.name,
          mode: draft.mode,
          k: draft.k,
        });
        setTaskTypes((prev) =>
          prev.map((tt) => (tt.id === editing.id ? { ...tt, ...draft } : tt)),
        );
      } else {
        const created = await createTaskType({
          name: draft.name,
          mode: draft.mode,
          k: draft.k,
          order: nextTaskTypeOrder(taskTypes),
        });
        setTaskTypes((prev) => [...prev, created]);
      }
      setTaskTypePopover(null);
    },
    [taskTypePopover, taskTypes],
  );

  // Delete a task type (AC4/AC5): its tasks move to the default type (the
  // remaining type with the smallest order). The default type never reaches
  // here — the popover hides delete for it.
  const handleDeleteTaskType = useCallback(async () => {
    const target = taskTypePopover?.taskType;
    if (!target) return;
    const dest = defaultTaskTypeId(taskTypes.filter((tt) => tt.id !== target.id));
    if (!dest) return; // never delete the last task type
    const affected = tasks.filter((t) => t.taskTypeId === target.id);

    await Promise.all(
      affected.map((t) => updateTask(t.id, { taskTypeId: dest })),
    );
    await deleteTaskType(target.id);

    setTasks((prev) =>
      prev.map((t) =>
        t.taskTypeId === target.id
          ? { ...t, taskTypeId: dest, updatedAt: Date.now() }
          : t,
      ),
    );
    setTaskTypes((prev) => prev.filter((tt) => tt.id !== target.id));
    // Drop any lingering filter entry for the removed type (US-015).
    setHiddenTaskTypeIds((prev) => {
      if (!prev.has(target.id)) return prev;
      const next = new Set(prev);
      next.delete(target.id);
      return next;
    });
    setTaskTypePopover(null);
  }, [taskTypePopover, tasks, taskTypes]);

  return (
    <>
      <CalendarView
        projects={projects}
        taskTypes={taskTypes}
        tasks={visibleTasks}
        markers={markers}
        projectsById={projectsById}
        taskTypesById={taskTypesById}
        selectedProjectId={selectedProjectId}
        onSelectProject={handleSelectProject}
        onCreateTask={handleCreateTask}
        onUpdateTask={handleUpdateTask}
        onMoveTask={handleMoveTask}
        onDeleteTask={handleDeleteTask}
        onCreateMarker={handleCreateMarker}
        onUpdateMarker={handleUpdateMarker}
        onDeleteMarker={handleDeleteMarker}
        highlightedTaskId={highlightedTaskId}
        highlightNonce={highlightNonce}
        addNonce={addNonce}
        markerAddNonce={markerAddNonce}
      />
      <TaskListPanel
        tasks={visibleTasks}
        projects={projects}
        taskTypes={taskTypes}
        projectsById={projectsById}
        taskTypesById={taskTypesById}
        onSelectTask={handleSelectTask}
        selectedTaskId={highlightedTaskId}
        onAdd={handleAdd}
        onAddMarker={handleAddMarker}
        onAddProject={openProjectCreate}
        onEditProject={openProjectEdit}
        onToggleProjectVisible={handleToggleProjectVisible}
        onAddTaskType={openTaskTypeCreate}
        onEditTaskType={openTaskTypeEdit}
        hiddenTaskTypeIds={hiddenTaskTypeIds}
        onToggleTaskType={handleToggleTaskType}
      />
      {projectPopover && (
        <ProjectPopover
          project={projectPopover.project}
          x={projectPopover.x}
          y={projectPopover.y}
          projects={projects}
          taskCount={
            projectPopover.project
              ? taskCountByProject.get(projectPopover.project.id) ?? 0
              : 0
          }
          onClose={closeProjectPopover}
          onSave={handleSaveProject}
          onDelete={projectPopover.project ? handleDeleteProject : undefined}
        />
      )}
      {taskTypePopover && (
        <TaskTypePopover
          taskType={taskTypePopover.taskType}
          x={taskTypePopover.x}
          y={taskTypePopover.y}
          taskTypes={taskTypes}
          taskCount={
            taskTypePopover.taskType
              ? taskCountByTaskType.get(taskTypePopover.taskType.id) ?? 0
              : 0
          }
          onClose={closeTaskTypePopover}
          onSave={handleSaveTaskType}
          onDelete={taskTypePopover.taskType ? handleDeleteTaskType : undefined}
        />
      )}
    </>
  );
}
