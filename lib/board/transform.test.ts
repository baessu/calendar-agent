import { describe, expect, it } from "vitest";
import {
  activeTasksFromPages,
  groupByProject,
  sortTasks,
  toTask,
  type NotionPage,
} from "./transform";
import { UNGROUPED, type BoardTask } from "./types";

/** Build a Notion page with the properties the board reads. */
function page(
  id: string,
  over: {
    title?: string;
    project?: string | null;
    tag?: string | null;
    status?: string | null;
    due?: string | null;
    hours?: number | null;
  } = {},
): NotionPage {
  const {
    title = "T",
    project = null,
    tag = null,
    status = null,
    due = null,
    hours = null,
  } = over;
  return {
    id,
    url: `https://notion.so/${id}`,
    properties: {
      Task: { title: title ? [{ plain_text: title }] : [] },
      Project: { select: project ? { name: project } : null },
      "액션 태그": { select: tag ? { name: tag } : null },
      Status: { status: status ? { name: status } : null },
      "Due Date": { date: due ? { start: due } : null },
      "예상 소요시간": { number: hours },
    },
  };
}

describe("toTask", () => {
  it("maps a Notion page to a BoardTask", () => {
    const t = toTask(
      page("p1", {
        title: "설문 보내기",
        project: "MDT",
        tag: "🔴 당장하세요",
        status: "In progress",
        due: "2026-07-14",
        hours: 1.5,
      }),
    );
    expect(t).toEqual({
      id: "p1",
      title: "설문 보내기",
      project: "MDT",
      disposition: "🔴 당장하세요",
      status: "In progress",
      due: "2026-07-14",
      estMinutes: 90, // 1.5h → 90min
      delegate: null,
      url: "https://notion.so/p1",
    });
  });

  it("returns null for an untitled row", () => {
    expect(toTask(page("p1", { title: "" }))).toBeNull();
  });

  it("trims a datetime due to a date and rounds fractional hours", () => {
    const t = toTask(page("p1", { due: "2026-07-14T09:30:00.000+09:00", hours: 0.25 }));
    expect(t?.due).toBe("2026-07-14");
    expect(t?.estMinutes).toBe(15);
  });

  it("tolerates missing optional properties", () => {
    const t = toTask({ id: "p1", properties: { Task: { title: [{ plain_text: "x" }] } } });
    expect(t).toMatchObject({ project: null, disposition: null, due: null, estMinutes: null });
  });
});

describe("activeTasksFromPages", () => {
  it("drops Done and Cancelled tasks", () => {
    const pages = [
      page("a", { status: "In progress" }),
      page("b", { status: "Done" }),
      page("c", { status: "Cancelled" }),
      page("d", { status: "Not started" }),
      page("e", { status: null }),
    ];
    expect(activeTasksFromPages(pages).map((t) => t.id).sort()).toEqual([
      "a",
      "d",
      "e",
    ]);
  });

  it("drops untitled rows", () => {
    const pages = [page("a"), page("b", { title: "" })];
    expect(activeTasksFromPages(pages).map((t) => t.id)).toEqual(["a"]);
  });
});

describe("sortTasks", () => {
  const t = (over: Partial<BoardTask>): BoardTask => ({
    id: "x",
    title: "x",
    project: null,
    disposition: null,
    status: null,
    due: null,
    estMinutes: null,
    delegate: null,
    url: "",
    ...over,
  });

  it("orders by urgency: 🔴 → 📅 → other → untriaged", () => {
    const out = sortTasks([
      t({ id: "untriaged", disposition: null }),
      t({ id: "delegate", disposition: "👋 위임하세요" }),
      t({ id: "now", disposition: "🔴 당장하세요 (중요+긴급)" }),
      t({ id: "schedule", disposition: "📅 일정잡으세요" }),
    ]);
    expect(out.map((x) => x.id)).toEqual(["now", "schedule", "delegate", "untriaged"]);
  });

  it("within a tier, dated tasks lead (earliest first) and undated sink", () => {
    const out = sortTasks([
      t({ id: "undated", disposition: "🔴 당장하세요" }),
      t({ id: "late", disposition: "🔴 당장하세요", due: "2026-08-01" }),
      t({ id: "early", disposition: "🔴 당장하세요", due: "2026-07-01" }),
    ]);
    expect(out.map((x) => x.id)).toEqual(["early", "late", "undated"]);
  });

  it("does not mutate its input", () => {
    const input = [t({ id: "b" }), t({ id: "a" })];
    const copy = [...input];
    sortTasks(input);
    expect(input).toEqual(copy);
  });
});

describe("groupByProject", () => {
  const active = (id: string, project: string | null): BoardTask => ({
    id,
    title: id,
    project,
    disposition: null,
    status: "Not started",
    due: null,
    estMinutes: null,
    delegate: null,
    url: "",
  });

  it("groups by project, larger groups first, 미분류 last", () => {
    const groups = groupByProject([
      active("a", "MDT"),
      active("b", "쇼그렌"),
      active("c", "MDT"),
      active("d", null),
      active("e", "MDT"),
    ]);
    expect(groups.map((g) => [g.project, g.tasks.length])).toEqual([
      ["MDT", 3],
      ["쇼그렌", 1],
      [UNGROUPED, 1],
    ]);
  });

  it("puts ungrouped tasks under 미분류", () => {
    const groups = groupByProject([active("a", null)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].project).toBe(UNGROUPED);
  });

  it("returns nothing for no tasks", () => {
    expect(groupByProject([])).toEqual([]);
  });
});
