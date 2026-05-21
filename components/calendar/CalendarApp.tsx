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
  createTask,
  getAllProjects,
  getAllTaskTypes,
  getAllTasks,
  seedIfEmpty,
} from "@/lib/db";
import type { DateString, Project, Task, TaskType } from "@/lib/types";
import { CalendarView } from "./CalendarView";
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

  // Seed (idempotent) then load all data on mount. Seeding here avoids a race
  // with <DbInit> so the popover always has a project/task-type to pick.
  useEffect(() => {
    let alive = true;
    (async () => {
      await seedIfEmpty();
      const [ps, tts, ts] = await Promise.all([
        getAllProjects(),
        getAllTaskTypes(),
        getAllTasks(),
      ]);
      if (!alive) return;
      setProjects(ps);
      setTaskTypes(tts);
      setTasks(ts);
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

  // --- Panel -> calendar highlight ------------------------------------------
  // `highlightNonce` bumps on every click so repeat-clicking the same row
  // re-triggers the scroll; `highlightedTaskId` drives the bar ring.
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [highlightNonce, setHighlightNonce] = useState(0);
  const hlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return (
    <>
      <CalendarView
        projects={projects}
        taskTypes={taskTypes}
        tasks={tasks}
        projectsById={projectsById}
        taskTypesById={taskTypesById}
        onCreateTask={handleCreateTask}
        highlightedTaskId={highlightedTaskId}
        highlightNonce={highlightNonce}
        addNonce={addNonce}
      />
      <TaskListPanel
        tasks={tasks}
        projectsById={projectsById}
        taskTypesById={taskTypesById}
        onSelectTask={handleSelectTask}
        selectedTaskId={highlightedTaskId}
        onAdd={handleAdd}
      />
    </>
  );
}
