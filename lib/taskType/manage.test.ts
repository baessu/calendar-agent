import { describe, expect, it } from "vitest";
import { TONE_LADDER } from "@/lib/color/tokens";
import type { TaskType } from "@/lib/types";
import {
  RECOMMENDED_TASK_TYPE_MAX,
  TONE_STEPS,
  defaultTaskTypeId,
  exceedsRecommendedTaskTypes,
  isDefaultTaskType,
  nearestToneStepIndex,
  nextTaskTypeOrder,
  toneStepIndex,
  unusedToneStep,
  usedToneStepIndices,
} from "./manage";

/** Build a TaskType with only the fields a given test cares about. */
function taskType(p: Partial<TaskType> & { id: string }): TaskType {
  return {
    projectId: "p1",
    name: p.id,
    mode: "tint",
    k: 0.32,
    order: 0,
    createdAt: 0,
    ...p,
  };
}

describe("TONE_STEPS", () => {
  it("mirrors the 8-step tone ladder (mode + k)", () => {
    expect(TONE_STEPS).toHaveLength(8);
    expect(TONE_STEPS).toEqual(
      TONE_LADDER.map((t) => ({ mode: t.mode, k: t.k })),
    );
  });
});

describe("defaultTaskTypeId", () => {
  it("returns null for no task types", () => {
    expect(defaultTaskTypeId([])).toBeNull();
  });

  it("picks the smallest order (seeded types share one createdAt)", () => {
    const tts = [
      taskType({ id: "research", order: 3, createdAt: 100 }),
      taskType({ id: "deadline", order: 0, createdAt: 100 }),
      taskType({ id: "meeting", order: 2, createdAt: 100 }),
    ];
    expect(defaultTaskTypeId(tts)).toBe("deadline");
  });

  it("breaks order ties by earliest createdAt then smallest id", () => {
    const tts = [
      taskType({ id: "z", order: 0, createdAt: 200 }),
      taskType({ id: "m", order: 0, createdAt: 100 }),
      taskType({ id: "a", order: 0, createdAt: 100 }),
    ];
    expect(defaultTaskTypeId(tts)).toBe("a");
  });

  it("isDefaultTaskType reflects the chosen default", () => {
    const tts = [
      taskType({ id: "deadline", order: 0 }),
      taskType({ id: "work", order: 1 }),
    ];
    expect(isDefaultTaskType("deadline", tts)).toBe(true);
    expect(isDefaultTaskType("work", tts)).toBe(false);
  });
});

describe("nextTaskTypeOrder", () => {
  it("is 0 when there are no task types", () => {
    expect(nextTaskTypeOrder([])).toBe(0);
  });

  it("is one past the current max order", () => {
    expect(nextTaskTypeOrder([{ order: 0 }, { order: 3 }, { order: 1 }])).toBe(4);
  });
});

describe("exceedsRecommendedTaskTypes", () => {
  it("is false below the recommended max", () => {
    expect(exceedsRecommendedTaskTypes(3)).toBe(false);
  });

  it("is true once the count reaches the recommended max (next would exceed)", () => {
    expect(exceedsRecommendedTaskTypes(RECOMMENDED_TASK_TYPE_MAX)).toBe(true);
    expect(exceedsRecommendedTaskTypes(9)).toBe(true);
  });

  it("honors a custom max", () => {
    expect(exceedsRecommendedTaskTypes(2, 3)).toBe(false);
    expect(exceedsRecommendedTaskTypes(3, 3)).toBe(true);
  });
});

describe("toneStepIndex", () => {
  it("finds the matching confirmed step", () => {
    expect(toneStepIndex("dark", 0.5)).toBe(0);
    expect(toneStepIndex("tint", 0.82)).toBe(7);
  });

  it("returns -1 for a value outside the ladder", () => {
    expect(toneStepIndex("tint", 0.5)).toBe(-1);
  });
});

describe("nearestToneStepIndex", () => {
  it("returns the exact index for an on-ladder tone", () => {
    expect(nearestToneStepIndex("dark", 0.5)).toBe(0);
    expect(nearestToneStepIndex("tint", 0.82)).toBe(7);
  });

  it("maps a legacy off-ladder tone to the nearest step of the same mode", () => {
    // Old seeds before the 8-step ladder: 마감 dark 0.40, 리서치 tint 0.80.
    expect(nearestToneStepIndex("dark", 0.4)).toBe(1); // dark 0.43, not 0.36
    expect(nearestToneStepIndex("tint", 0.8)).toBe(7); // tint 0.82
  });

  it("never crosses dark↔tint even when the other mode's k is closer", () => {
    // tint 0.30 is numerically nearer dark 0.36, but mode must match → tint 0.32.
    expect(nearestToneStepIndex("tint", 0.3)).toBe(3);
  });
});

describe("usedToneStepIndices", () => {
  it("claims each type's nearest step, including legacy tones", () => {
    const used = usedToneStepIndices([
      { mode: "dark", k: 0.4 }, // → step 1
      { mode: "tint", k: 0.8 }, // → step 7
      { mode: "tint", k: 0.32 }, // → step 3
    ]);
    expect([...used].sort((a, b) => a - b)).toEqual([1, 3, 7]);
  });
});

describe("unusedToneStep", () => {
  it("recommends the darkest step when none are used", () => {
    expect(unusedToneStep([])).toEqual(TONE_STEPS[0]);
  });

  it("skips tone steps already in use", () => {
    const used = [
      { mode: TONE_STEPS[0].mode, k: TONE_STEPS[0].k },
      { mode: TONE_STEPS[1].mode, k: TONE_STEPS[1].k },
    ];
    expect(unusedToneStep(used)).toEqual(TONE_STEPS[2]);
  });

  it("skips the nearest step of a legacy off-ladder tone", () => {
    // dark 0.40 claims step 1 (dark 0.43); the first free step is step 0.
    const rec = unusedToneStep([{ mode: "dark", k: 0.4 }]);
    expect(usedToneStepIndices([rec])).not.toContain(1);
    expect(rec).toEqual(TONE_STEPS[0]);
  });

  it("falls back to the darkest step once all are used", () => {
    const used = TONE_STEPS.map((s) => ({ mode: s.mode, k: s.k }));
    expect(unusedToneStep(used)).toEqual(TONE_STEPS[0]);
  });
});
