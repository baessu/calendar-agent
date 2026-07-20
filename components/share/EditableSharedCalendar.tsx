"use client";

/**
 * Collaborative edit view for an edit-link share (`/e/{editToken}`).
 *
 * Mirrors <CalendarApp>, but backed by the published Blob snapshot instead of
 * the viewer's IndexedDB: the snapshot seeds local React state, the recipient
 * edits tasks and markers through the same <CalendarView>, and every change is
 * debounce-saved back to the same Blob (POST { snapshot, editToken }). The
 * viewer's own local store is never touched, and they can't re-share.
 *
 * Sync is point-in-time, last-write-wins: there is no realtime channel, so the
 * owner sees these edits by pulling them (freshness check in the owner app),
 * and an owner 갱신 would overwrite them. Scope is day-to-day editing — tasks
 * and markers; project / task-type management stays with the owner.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarView } from "@/components/calendar/CalendarView";
import { PrintCalendar } from "@/components/calendar/PrintCalendar";
import { TaskListPanel } from "@/components/calendar/TaskListPanel";
import { filterTasksByTaskTypes } from "@/lib/calendar/view";
import type { NewTaskInput } from "@/components/calendar/CalendarApp";
import type { EditTaskDraft } from "@/components/calendar/EditPopover";
import { buildSnapshot, type ShareSnapshot } from "@/lib/share/snapshot";
import type { YearMonth } from "@/lib/calendar/infinite";
import type { MarkerChanges, MarkerInput } from "@/lib/db";
import { newId, now } from "@/lib/db/util";
import type { DateString, Marker, Project, Task, TaskType } from "@/lib/types";

type SaveState = "saved" | "saving" | "error";

// Wait this long after the last edit before persisting, so a burst of changes
// (a drag, then a quick retitle) collapses into one upload.
const SAVE_DEBOUNCE_MS = 800;

// How long a panel-row click keeps its calendar target ringed (mirrors the app).
const HIGHLIGHT_MS = 1800;

export function EditableSharedCalendar({
  snapshot,
  editToken,
}: {
  snapshot: ShareSnapshot;
  editToken: string;
}) {
  // The single shared project, reconstructed from the snapshot (read-only).
  const project: Project = useMemo(
    () => ({
      id: snapshot.project.id,
      name: snapshot.project.name,
      color: snapshot.project.color,
      visible: true,
      order: 0,
      createdAt: snapshot.publishedAt,
      updatedAt: snapshot.publishedAt,
    }),
    [snapshot.project, snapshot.publishedAt],
  );

  // Editable data, seeded once from the snapshot.
  const [tasks, setTasks] = useState<Task[]>(() => snapshot.tasks);
  const [markers, setMarkers] = useState<Marker[]>(() => snapshot.markers);
  // Task types come from the owner; collaborators pick among them but can't edit
  // them, so this stays as published.
  const taskTypes = useMemo<TaskType[]>(() => snapshot.taskTypes, [snapshot.taskTypes]);

  const projectsById = useMemo(
    () => new Map<string, Project>([[project.id, project]]),
    [project],
  );
  const taskTypesById = useMemo(
    () => new Map<string, TaskType>(taskTypes.map((tt) => [tt.id, tt])),
    [taskTypes],
  );

  // --- Task handlers (mirror CalendarApp, but mutate local state only) -------
  const handleCreateTask = useCallback((input: NewTaskInput) => {
    const ts = now();
    setTasks((prev) => [
      ...prev,
      { ...input, id: newId(), createdAt: ts, updatedAt: ts },
    ]);
  }, []);

  const handleUpdateTask = useCallback((id: string, changes: EditTaskDraft) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...changes, updatedAt: now() } : t)),
    );
  }, []);

  const handleMoveTask = useCallback(
    (id: string, startDate: DateString, endDate: DateString) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, startDate, endDate, updatedAt: now() } : t,
        ),
      );
    },
    [],
  );

  const handleDeleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // --- Marker handlers -------------------------------------------------------
  const handleCreateMarker = useCallback((input: MarkerInput) => {
    const ts = now();
    setMarkers((prev) => [
      ...prev,
      { ...input, id: newId(), createdAt: ts, updatedAt: ts },
    ]);
  }, []);

  const handleUpdateMarker = useCallback((id: string, changes: MarkerChanges) => {
    setMarkers((prev) => prev.map((m) => (m.id === id ? { ...m, ...changes } : m)));
  }, []);

  const handleDeleteMarker = useCallback((id: string) => {
    setMarkers((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // --- Task-type filter (US-015) — the panel's one view control --------------
  // Ephemeral, viewer-local; narrows the bars shown (markers carry no type).
  // Edits still save the full set — the filter never drops data from the Blob.
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
  const visibleTasks = useMemo(
    () => filterTasksByTaskTypes(tasks, hiddenTaskTypeIds),
    [tasks, hiddenTaskTypeIds],
  );

  // --- Panel row click -> scroll + ring the bar/chip (US-008) ----------------
  // CalendarView already does the scroll+ring; we just drive it via the nonce.
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [highlightNonce, setHighlightNonce] = useState(0);
  const hlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [highlightedMarkerId, setHighlightedMarkerId] = useState<string | null>(null);
  const [markerHighlightNonce, setMarkerHighlightNonce] = useState(0);
  const mkHlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSelectTask = useCallback((id: string) => {
    setHighlightedTaskId(id);
    setHighlightNonce((n) => n + 1);
    if (hlTimer.current) clearTimeout(hlTimer.current);
    hlTimer.current = setTimeout(() => setHighlightedTaskId(null), HIGHLIGHT_MS);
  }, []);
  const handleSelectMarker = useCallback((id: string) => {
    setHighlightedMarkerId(id);
    setMarkerHighlightNonce((n) => n + 1);
    if (mkHlTimer.current) clearTimeout(mkHlTimer.current);
    mkHlTimer.current = setTimeout(() => setHighlightedMarkerId(null), HIGHLIGHT_MS);
  }, []);
  useEffect(
    () => () => {
      if (hlTimer.current) clearTimeout(hlTimer.current);
      if (mkHlTimer.current) clearTimeout(mkHlTimer.current);
    },
    [],
  );

  // --- Print (reuse the app's print path) ------------------------------------
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

  // --- Debounced save back to the shared Blob --------------------------------
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [savedAt, setSavedAt] = useState<number>(snapshot.publishedAt);
  // Latest data, read inside the (possibly delayed) save without re-binding it.
  const dataRef = useRef({ tasks, markers, taskTypes });
  useEffect(() => {
    dataRef.current = { tasks, markers, taskTypes };
  });
  const firstRun = useRef(true);

  const saveNow = useCallback(async () => {
    setSaveState("saving");
    const cur = dataRef.current;
    const snap = buildSnapshot(project, cur.taskTypes, cur.tasks, cur.markers);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshot: snap, editToken }),
      });
      if (!res.ok) throw new Error("save failed");
      setSaveState("saved");
      setSavedAt(snap.publishedAt);
    } catch {
      setSaveState("error");
    }
  }, [project, editToken]);

  useEffect(() => {
    // Don't save the snapshot we just loaded — only real edits.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSaveState("saving");
    const handle = setTimeout(saveNow, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [tasks, markers, saveNow]);

  const savedLabel = new Date(savedAt).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="app-shell edit-shell">
      <header className="edit-banner share-screen">
        <div className="edit-id">
          <span className="share-dot" style={{ background: project.color }} aria-hidden />
          <div>
            <h1 className="edit-ttl">{project.name}</h1>
            <p className="edit-sub">편집 가능한 공유 · 변경은 자동 저장돼요</p>
          </div>
        </div>
        <div className="edit-save" role="status" aria-live="polite">
          {saveState === "saving" && <span className="edit-save-busy">저장 중…</span>}
          {saveState === "saved" && (
            <span className="edit-save-ok">저장됨 · {savedLabel}</span>
          )}
          {saveState === "error" && (
            <span className="edit-save-err">
              저장 실패
              <button type="button" className="edit-retry" onClick={saveNow}>
                다시 시도
              </button>
            </span>
          )}
        </div>
      </header>

      <div className="edit-body share-screen">
        <CalendarView
          projects={[project]}
          taskTypes={taskTypes}
          tasks={visibleTasks}
          markers={markers}
          projectsById={projectsById}
          taskTypesById={taskTypesById}
          selectedProjectId={project.id}
          onSelectProject={() => {}}
          onReorderProject={() => {}}
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
          addNonce={0}
          markerAddNonce={0}
          onPrint={handlePrint}
          onShare={() => {}}
          isShared={false}
          canShare={false}
        />
        <TaskListPanel
          readOnly
          tasks={visibleTasks}
          markers={markers}
          projects={[project]}
          projectsById={projectsById}
          taskTypesById={taskTypesById}
          selectedProjectId={project.id}
          projectTaskTypes={taskTypes}
          onSelectTask={handleSelectTask}
          selectedTaskId={highlightedTaskId}
          onSelectMarker={handleSelectMarker}
          selectedMarkerId={highlightedMarkerId}
          hiddenTaskTypeIds={hiddenTaskTypeIds}
          onToggleTaskType={handleToggleTaskType}
        />
      </div>

      {printRange && (
        <PrintCalendar
          from={printRange.from}
          to={printRange.to}
          tasks={visibleTasks}
          markers={markers}
          projectsById={projectsById}
          taskTypesById={taskTypesById}
        />
      )}
    </div>
  );
}
