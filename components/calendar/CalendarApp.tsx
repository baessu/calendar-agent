"use client";

/**
 * Top-level client shell that owns the data shared by the calendar and the
 * right "일정" panel (US-008).
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
  deleteShare,
  deleteTaskTypesByProject,
  getAllMarkers,
  getAllProjects,
  getAllShares,
  getAllTaskTypes,
  getAllTasks,
  putShare,
  seedIfEmpty,
  seedTaskTypesForProject,
  replaceProjectSharedData,
  updateMarker,
  updateProject,
  updateTask,
  updateTaskType,
  type MarkerChanges,
  type MarkerInput,
} from "@/lib/db";
import {
  filterMarkersByProject,
  filterMarkersByVisibleProjects,
  filterTasksByProject,
  filterTasksByTaskTypes,
  filterTasksByVisibleProjects,
} from "@/lib/calendar/view";
import { DEFAULT_PROJECT_COLOR } from "@/lib/color/tokens";
import {
  defaultProjectId,
  nextProjectOrder,
  reorderProjects,
} from "@/lib/project/manage";
import {
  defaultTaskTypeId,
  nextTaskTypeOrder,
} from "@/lib/taskType/manage";
import {
  matchTaskTypeAcrossProjects,
  taskTypesForProject,
} from "@/lib/taskType/scope";
import type {
  DateString,
  Marker,
  Project,
  ShareRecord,
  Task,
  TaskType,
} from "@/lib/types";
import type { YearMonth } from "@/lib/calendar/infinite";
import { buildSnapshot, parseSnapshot } from "@/lib/share/snapshot";
import { CalendarView } from "./CalendarView";
import { PrintCalendar } from "./PrintCalendar";
import type { EditTaskDraft } from "./EditPopover";
import {
  ProjectPopover,
  type DeleteProjectMode,
  type ProjectDraft,
} from "./ProjectPopover";
import { SharePopover } from "./SharePopover";
import { TaskListPanel } from "./TaskListPanel";
import { TaskTypePopover, type TaskTypeDraft } from "./TaskTypePopover";

/** A new task's fields; dates come from the calendar's committed selection. */
export interface NewTaskInput {
  projectId: string;
  taskTypeId: string;
  title: string;
  startDate: DateString;
  endDate: DateString;
  /** Optional free-text note (US-019); created alongside the task. */
  note?: string;
}

// How long a panel-selected bar stays ringed in the calendar.
const HIGHLIGHT_MS = 1800;

export function CalendarApp() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);
  // Local share registry (US-025), keyed by projectId — which projects are
  // currently published and to what token/url.
  const [shares, setShares] = useState<Map<string, ShareRecord>>(new Map());
  // Projects whose published snapshot is newer than what the owner last synced
  // — i.e. a collaborator edited via the edit link. Drives the "가져오기" prompt.
  const [staleShareIds, setStaleShareIds] = useState<Set<string>>(() => new Set());

  // Load every table from Dexie into React state. Also used after an account
  // sync, which writes straight to Dexie and would otherwise be invisible to
  // this in-memory copy until a page reload.
  const reloadFromDb = useCallback(async () => {
    const [ps, tts, ts, ms, shs] = await Promise.all([
      getAllProjects(),
      getAllTaskTypes(),
      getAllTasks(),
      getAllMarkers(),
      getAllShares(),
    ]);
    setProjects(ps);
    setTaskTypes(tts);
    setTasks(ts);
    setMarkers(ms);
    setShares(new Map(shs.map((s) => [s.projectId, s])));
  }, []);

  // Seed (idempotent) then load all data on mount. Seeding here avoids a race
  // with <DbInit> so the popover always has a project/task-type to pick.
  useEffect(() => {
    let alive = true;
    (async () => {
      await seedIfEmpty();
      if (!alive) return;
      await reloadFromDb();
    })().catch((err) => console.error("calendar data load failed", err));
    return () => {
      alive = false;
    };
  }, [reloadFromDb]);

  /**
   * Fingerprint of local data for the sync control: any create, edit, or delete
   * moves it. Row count catches creates and deletes; the newest `updatedAt`
   * catches in-place edits, which leave the count unchanged.
   */
  const syncRevision = useMemo(() => {
    let count = 0;
    let newest = 0;
    for (const rows of [projects, taskTypes, tasks, markers]) {
      count += rows.length;
      for (const row of rows) {
        if (row.updatedAt > newest) newest = row.updatedAt;
      }
    }
    return `${count}:${newest}`;
  }, [projects, taskTypes, tasks, markers]);

  // Freshness check (edit links): once shares are loaded, ask the server for
  // each share's current snapshot publishedAt and compare with the time the
  // owner last synced. Newer ⟹ a collaborator edited it ⟹ offer 가져오기. Runs
  // once per shares change, no polling — the user re-opens the popover to act.
  useEffect(() => {
    if (shares.size === 0) return;
    let alive = true;
    (async () => {
      const stale = new Set<string>();
      await Promise.all(
        [...shares.values()].map(async (s) => {
          // Only edit-enabled shares can drift; legacy view-only can't.
          if (!s.editToken) return;
          try {
            const res = await fetch(`/api/share?token=${s.token}`);
            if (!res.ok) return;
            const { publishedAt } = (await res.json()) as { publishedAt: number | null };
            const synced = s.publishedAt ?? s.updatedAt;
            if (typeof publishedAt === "number" && publishedAt > synced) {
              stale.add(s.projectId);
            }
          } catch {
            /* offline / transient — leave it un-stale, retried next mount */
          }
        }),
      );
      if (alive && stale.size > 0) setStaleShareIds(stale);
    })();
    return () => {
      alive = false;
    };
  }, [shares]);

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

  // Visible markers (US-021): markers are scoped per project, so they follow the
  // same view + visibility filters as task bars — narrow to the active tab and
  // drop markers of projects toggled off. (No task-type filter; markers have no
  // task type.) Order preserved; both filters AND together.
  const visibleMarkers = useMemo(
    () =>
      filterMarkersByProject(
        filterMarkersByVisibleProjects(markers, projects),
        selectedProjectId,
      ),
    [markers, projects, selectedProjectId],
  );

  // US-020: task types are per-project. In an individual project view the
  // task-type legend/management shows that project's own types; 전체(통합) view
  // has no single project, so the panel shows a prompt (null = 전체).
  const projectTaskTypes = useMemo(
    () =>
      selectedProjectId
        ? taskTypesForProject(taskTypes, selectedProjectId)
        : null,
    [taskTypes, selectedProjectId],
  );

  // 인쇄(Print): the chosen month range. <PrintCalendar> renders it (print-only),
  // then the effect fires window.print() once it's committed, clearing afterprint.
  const [printRange, setPrintRange] = useState<{ from: YearMonth; to: YearMonth } | null>(null);
  const handlePrint = useCallback((from: YearMonth, to: YearMonth) => {
    setPrintRange({ from, to });
  }, []);
  useEffect(() => {
    if (!printRange) return;
    const id = requestAnimationFrame(() => window.print());
    const done = () => setPrintRange(null);
    window.addEventListener("afterprint", done);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("afterprint", done);
    };
  }, [printRange]);

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
  // so the calendar chips update at once. projectId comes from the popover —
  // markers are scoped per project (US-021).
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

  // Same mechanism for marker panel rows: scroll the calendar to the marker's
  // date and ring its chip. Separate state so a marker and a task don't fight
  // over one highlight.
  const [highlightedMarkerId, setHighlightedMarkerId] = useState<string | null>(null);
  const [markerHighlightNonce, setMarkerHighlightNonce] = useState(0);
  const mkHlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSelectMarker = useCallback((id: string) => {
    setHighlightedMarkerId(id);
    setMarkerHighlightNonce((n) => n + 1);
    if (mkHlTimer.current) clearTimeout(mkHlTimer.current);
    mkHlTimer.current = setTimeout(() => setHighlightedMarkerId(null), HIGHLIGHT_MS);
  }, []);

  useEffect(() => () => {
    if (hlTimer.current) clearTimeout(hlTimer.current);
    if (mkHlTimer.current) clearTimeout(mkHlTimer.current);
  }, []);

  // --- Panel -> calendar "+ 일정 추가" --------------------------------------
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
        // US-020 AC2: a new project starts with its own default 4 task types.
        const seededTypes = await seedTaskTypesForProject(created.id);
        setProjects((prev) => [...prev, created]);
        setTaskTypes((prev) => [...prev, ...seededTypes]);
      }
      setProjectPopover(null);
    },
    [projectPopover, projects],
  );

  // Reorder projects by drag (US-018): move `fromId` into `toId`'s slot, renumber
  // order, and persist only the projects whose order changed. The shared state
  // drives the tabs, the legend, and every view, so the new order lands at once
  // and survives a refresh (order is in IndexedDB).
  const handleReorderProject = useCallback(
    async (fromId: string, toId: string) => {
      const reordered = reorderProjects(projects, fromId, toId);
      if (reordered === projects) return; // no-op
      const prevOrder = new Map(projects.map((p) => [p.id, p.order]));
      await Promise.all(
        reordered
          .filter((p) => prevOrder.get(p.id) !== p.order)
          .map((p) => updateProject(p.id, { order: p.order })),
      );
      setProjects(reordered);
    },
    [projects],
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

      // US-020: task types are per-project, so a reassigned task must also point
      // at the destination project's matching type (by name, else its default).
      const typeRemap = new Map<string, string>();
      if (dest) {
        for (const t of affected) {
          typeRemap.set(
            t.id,
            matchTaskTypeAcrossProjects(t.taskTypeId, taskTypes, dest) ??
              t.taskTypeId,
          );
        }
        await Promise.all(
          affected.map((t) =>
            updateTask(t.id, {
              projectId: dest,
              taskTypeId: typeRemap.get(t.id)!,
            }),
          ),
        );
      } else {
        await Promise.all(affected.map((t) => deleteTask(t.id)));
      }
      // The deleted project's own task types go with it (US-020).
      await deleteTaskTypesByProject(target.id);
      await deleteProject(target.id);

      setTasks((prev) =>
        dest
          ? prev.map((t) =>
              t.projectId === target.id
                ? {
                    ...t,
                    projectId: dest,
                    taskTypeId: typeRemap.get(t.id) ?? t.taskTypeId,
                    updatedAt: Date.now(),
                  }
                : t,
            )
          : prev.filter((t) => t.projectId !== target.id),
      );
      setTaskTypes((prev) => prev.filter((tt) => tt.projectId !== target.id));
      setProjects((prev) => prev.filter((p) => p.id !== target.id));
      // If the deleted project was the active tab, fall back to 전체 (US-013).
      setSelectedProjectId((cur) => (cur === target.id ? null : cur));
      if (!dest) {
        const removed = new Set(affected.map((t) => t.id));
        setHighlightedTaskId((cur) => (cur && removed.has(cur) ? null : cur));
      }
      setProjectPopover(null);
    },
    [projectPopover, tasks, projects, taskTypes],
  );

  // --- Task-type management (US-012, scoped per project in US-020) -----------
  // One popover handles create (taskType:null) and edit/delete. Task types are
  // per-project (US-020); renaming or retoning re-shades every bar of that type
  // at once. `projectId` is the owning project: create uses the active tab's
  // project; edit uses the type's own project.
  const [taskTypePopover, setTaskTypePopover] = useState<{
    taskType: TaskType | null;
    projectId: string;
    x: number;
    y: number;
  } | null>(null);

  // Per-type task counts, for the delete confirmation copy.
  const taskCountByTaskType = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) m.set(t.taskTypeId, (m.get(t.taskTypeId) ?? 0) + 1);
    return m;
  }, [tasks]);

  // Create types for the active tab's project; 전체(통합) view has no project,
  // so creation is disabled there (the legend shows a prompt instead).
  const openTaskTypeCreate = useCallback(
    (x: number, y: number) => {
      if (!selectedProjectId) return;
      setTaskTypePopover({ taskType: null, projectId: selectedProjectId, x, y });
    },
    [selectedProjectId],
  );
  const openTaskTypeEdit = useCallback(
    (taskType: TaskType, x: number, y: number) =>
      setTaskTypePopover({ taskType, projectId: taskType.projectId, x, y }),
    [],
  );
  const closeTaskTypePopover = useCallback(() => setTaskTypePopover(null), []);

  const handleSaveTaskType = useCallback(
    async (draft: TaskTypeDraft) => {
      const pop = taskTypePopover;
      if (!pop) return;
      const editing = pop.taskType;
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
          projectId: pop.projectId,
          name: draft.name,
          mode: draft.mode,
          k: draft.k,
          order: nextTaskTypeOrder(
            taskTypes.filter((tt) => tt.projectId === pop.projectId),
          ),
        });
        setTaskTypes((prev) => [...prev, created]);
      }
      setTaskTypePopover(null);
    },
    [taskTypePopover, taskTypes],
  );

  // Delete a task type (AC4/AC5): its tasks move to its project's default type
  // (the remaining same-project type with the smallest order). The default type
  // never reaches here — the popover hides delete for it (per project, US-020).
  const handleDeleteTaskType = useCallback(async () => {
    const target = taskTypePopover?.taskType;
    if (!target) return;
    const dest = defaultTaskTypeId(
      taskTypes.filter(
        (tt) => tt.projectId === target.projectId && tt.id !== target.id,
      ),
    );
    if (!dest) return; // never delete the project's last task type
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

  // --- Project sharing (US-023~025) ----------------------------------------
  // A snapshot of one project is published to Blob and managed by a per-project
  // link. The popover opens for the active individual project (전체 뷰에는 없음).
  const [sharePopover, setSharePopover] = useState<{
    projectId: string;
    x: number;
    y: number;
  } | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const openShare = useCallback(
    (x: number, y: number) => {
      if (!selectedProjectId) return;
      setShareError(null);
      setSharePopover({ projectId: selectedProjectId, x, y });
    },
    [selectedProjectId],
  );
  const closeShare = useCallback(() => setSharePopover(null), []);

  // Clear a project's "collaborator edited" flag (after the owner publishes or
  // pulls, their local copy and the Blob are back in sync).
  const clearStale = useCallback((pid: string) => {
    setStaleShareIds((prev) => {
      if (!prev.has(pid)) return prev;
      const next = new Set(prev);
      next.delete(pid);
      return next;
    });
  }, []);

  // Publish or refresh: build a fresh snapshot from local data, POST it. The
  // edit token (when present) authorizes overwriting the existing snapshot; the
  // server mints both tokens on first publish or adopts a legacy view-only one.
  // Refresh re-publishes the owner's local copy, so it clears the stale flag.
  const handlePublishShare = useCallback(async () => {
    const pid = sharePopover?.projectId;
    const project = pid ? projectsById.get(pid) : undefined;
    if (!pid || !project) return;
    setShareBusy(true);
    setShareError(null);
    try {
      const snapshot = buildSnapshot(project, taskTypes, tasks, markers);
      const existing = shares.get(pid);
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          snapshot,
          viewToken: existing?.token,
          editToken: existing?.editToken,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        viewToken?: string;
        editToken?: string;
        url?: string;
        publishedAt?: number;
        error?: string;
      };
      if (!res.ok || !data.viewToken || !data.url) {
        throw new Error(data.error || "발행에 실패했습니다.");
      }
      const record = await putShare({
        projectId: pid,
        token: data.viewToken,
        editToken: data.editToken,
        url: data.url,
        publishedAt: data.publishedAt ?? snapshot.publishedAt,
      });
      setShares((prev) => new Map(prev).set(pid, record));
      clearStale(pid);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "발행에 실패했습니다.");
    } finally {
      setShareBusy(false);
    }
  }, [sharePopover, projectsById, taskTypes, tasks, markers, shares, clearStale]);

  // Pull a collaborator's edits: fetch the current snapshot (server-side, so no
  // CORS), replace this project's local tasks/markers with it, and mark the
  // share synced. Last-write-wins — the shared copy wins over local for this
  // project. Other projects are untouched.
  const handlePullShare = useCallback(async () => {
    const pid = sharePopover?.projectId;
    const existing = pid ? shares.get(pid) : undefined;
    if (!pid || !existing) return;
    setShareBusy(true);
    setShareError(null);
    try {
      const res = await fetch(`/api/share?token=${existing.token}&full=1`);
      const data = (await res.json().catch(() => ({}))) as {
        snapshot?: unknown;
        error?: string;
      };
      const snap = parseSnapshot(data.snapshot);
      if (!res.ok || !snap) {
        throw new Error(data.error || "가져오기에 실패했습니다.");
      }
      await replaceProjectSharedData(pid, {
        taskTypes: snap.taskTypes,
        tasks: snap.tasks,
        markers: snap.markers,
      });
      // Mirror into shared state: swap this project's slice for the pulled one.
      setTaskTypes((prev) => [
        ...prev.filter((tt) => tt.projectId !== pid),
        ...snap.taskTypes,
      ]);
      setTasks((prev) => [...prev.filter((t) => t.projectId !== pid), ...snap.tasks]);
      setMarkers((prev) => [
        ...prev.filter((m) => m.projectId !== pid),
        ...snap.markers,
      ]);
      const record = await putShare({
        projectId: pid,
        token: existing.token,
        editToken: existing.editToken,
        url: existing.url,
        publishedAt: snap.publishedAt,
      });
      setShares((prev) => new Map(prev).set(pid, record));
      clearStale(pid);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "가져오기에 실패했습니다.");
    } finally {
      setShareBusy(false);
    }
  }, [sharePopover, shares, clearStale]);

  // Revoke: delete the Blob snapshot + edit key, then drop the local record.
  const handleRevokeShare = useCallback(async () => {
    const pid = sharePopover?.projectId;
    const existing = pid ? shares.get(pid) : undefined;
    if (!pid || !existing) return;
    setShareBusy(true);
    setShareError(null);
    try {
      const res = await fetch("/api/share", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          editToken: existing.editToken,
          viewToken: existing.token,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "해제에 실패했습니다.");
      }
      await deleteShare(pid);
      setShares((prev) => {
        const next = new Map(prev);
        next.delete(pid);
        return next;
      });
      clearStale(pid);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "해제에 실패했습니다.");
    } finally {
      setShareBusy(false);
    }
  }, [sharePopover, shares, clearStale]);

  return (
    <>
      <CalendarView
        projects={projects}
        taskTypes={taskTypes}
        tasks={visibleTasks}
        markers={visibleMarkers}
        projectsById={projectsById}
        taskTypesById={taskTypesById}
        selectedProjectId={selectedProjectId}
        onSelectProject={handleSelectProject}
        onReorderProject={handleReorderProject}
        onCreateTask={handleCreateTask}
        onUpdateTask={handleUpdateTask}
        onMoveTask={handleMoveTask}
        onDeleteTask={handleDeleteTask}
        onCreateMarker={handleCreateMarker}
        onUpdateMarker={handleUpdateMarker}
        onDeleteMarker={handleDeleteMarker}
        highlightedTaskId={highlightedTaskId}
        highlightNonce={highlightNonce}
        highlightedMarkerId={highlightedMarkerId}
        markerHighlightNonce={markerHighlightNonce}
        addNonce={addNonce}
        markerAddNonce={markerAddNonce}
        onPrint={handlePrint}
        onShare={openShare}
        isShared={selectedProjectId ? shares.has(selectedProjectId) : false}
        shareStale={selectedProjectId ? staleShareIds.has(selectedProjectId) : false}
        sync={{ revision: syncRevision, onSynced: reloadFromDb }}
      />
      <TaskListPanel
        tasks={visibleTasks}
        markers={visibleMarkers}
        projects={projects}
        projectsById={projectsById}
        taskTypesById={taskTypesById}
        selectedProjectId={selectedProjectId}
        projectTaskTypes={projectTaskTypes}
        onSelectTask={handleSelectTask}
        selectedTaskId={highlightedTaskId}
        onSelectMarker={handleSelectMarker}
        selectedMarkerId={highlightedMarkerId}
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
          taskTypes={taskTypes.filter(
            (tt) => tt.projectId === taskTypePopover.projectId,
          )}
          previewColor={
            projectsById.get(taskTypePopover.projectId)?.color ||
            DEFAULT_PROJECT_COLOR
          }
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
      {sharePopover && projectsById.get(sharePopover.projectId) && (
        <SharePopover
          project={projectsById.get(sharePopover.projectId)!}
          share={shares.get(sharePopover.projectId) ?? null}
          shareUrl={
            shares.get(sharePopover.projectId)
              ? `${typeof window !== "undefined" ? window.location.origin : ""}/s/${shares.get(sharePopover.projectId)!.token}`
              : null
          }
          editShareUrl={
            shares.get(sharePopover.projectId)?.editToken
              ? `${typeof window !== "undefined" ? window.location.origin : ""}/e/${shares.get(sharePopover.projectId)!.editToken}`
              : null
          }
          stale={staleShareIds.has(sharePopover.projectId)}
          x={sharePopover.x}
          y={sharePopover.y}
          busy={shareBusy}
          error={shareError}
          onPublish={handlePublishShare}
          onPull={handlePullShare}
          onRevoke={handleRevokeShare}
          onClose={closeShare}
        />
      )}

      {/* Print-only render of the chosen month range (인쇄). Same filtered data
          as the live view (WYSIWYG); shown only under @media print. */}
      {printRange && (
        <PrintCalendar
          from={printRange.from}
          to={printRange.to}
          tasks={visibleTasks}
          markers={visibleMarkers}
          projectsById={projectsById}
          taskTypesById={taskTypesById}
        />
      )}
    </>
  );
}
