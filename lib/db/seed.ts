import {
  DEFAULT_PROJECT_COLOR,
  DEFAULT_PROJECT_NAME,
  TASK_TYPE_TONES,
} from "@/lib/color/tokens";
import { db } from "./index";
import { newId, now } from "./util";

/**
 * First-run seeding: one default project ("기본") + the 4 global task types
 * (마감/작업/회의/리서치) from docs/design/color-system.md.
 *
 * Idempotent — does nothing if either table already has rows, so it is safe
 * to call on every client mount.
 */
export async function seedIfEmpty(): Promise<void> {
  const [projectCount, taskTypeCount] = await Promise.all([
    db.projects.count(),
    db.taskTypes.count(),
  ]);
  if (projectCount > 0 || taskTypeCount > 0) return;

  const ts = now();
  await db.transaction("rw", db.projects, db.taskTypes, async () => {
    await db.projects.add({
      id: newId(),
      name: DEFAULT_PROJECT_NAME,
      color: DEFAULT_PROJECT_COLOR,
      visible: true,
      order: 0,
      createdAt: ts,
    });
    await db.taskTypes.bulkAdd(
      TASK_TYPE_TONES.map((t) => ({
        id: newId(),
        name: t.name,
        mode: t.mode,
        k: t.k,
        order: t.order,
        createdAt: ts,
      })),
    );
  });
}
