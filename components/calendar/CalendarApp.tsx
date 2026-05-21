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
  deleteMarker,
  deleteProject,
  deleteTask,
  getAllMarkers,
  getAllProjects,
  getAllTaskTypes,
  getAllTasks,
  seedIfEmpty,
  updateMarker,
  updateProject,
  updateTask,
  type MarkerChanges,
  type MarkerInput,
} from "@/lib/db";
import { defaultProjectId, nextProjectOrder } from "@/lib/project/manage";
import type { DateString, Marker, Project, Task, TaskType } from "@/lib/types";
import { CalendarView } from "./CalendarView";
import type { EditTaskDraft } from "./EditPopover";
import {
  ProjectPopover,
  type DeleteProjectMode,
  type ProjectDraft,
} from "./ProjectPopover";
import { TaskListPanel } from "./TaskListPanel";

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
      if (!dest) {
        const removed = new Set(affected.map((t) => t.id));
        setHighlightedTaskId((cur) => (cur && removed.has(cur) ? null : cur));
      }
      setProjectPopover(null);
    },
    [projectPopover, tasks, projects],
  );

  return (
    <>
      <CalendarView
        projects={projects}
        taskTypes={taskTypes}
        tasks={tasks}
        markers={markers}
        projectsById={projectsById}
        taskTypesById={taskTypesById}
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
        tasks={tasks}
        projects={projects}
        projectsById={projectsById}
        taskTypesById={taskTypesById}
        onSelectTask={handleSelectTask}
        selectedTaskId={highlightedTaskId}
        onAdd={handleAdd}
        onAddMarker={handleAddMarker}
        onAddProject={openProjectCreate}
        onEditProject={openProjectEdit}
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
    </>
  );
}
