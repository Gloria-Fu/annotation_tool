import { describe, expect, it } from "vitest";
import type { TaskItem } from "../../shared/api/types";
import { eligibleQualityItems, selectQualitySample } from "./sampling";

function item(index: number, qaStatus: TaskItem["qa_status"] = "unchecked"): TaskItem {
  return {
    id: `item-${index}`,
    package_id: "package",
    episode_id: `episode-${index}`,
    claim_order: index,
    status: "completed",
    annotator_id: "annotator",
    reviewer_id: "reviewer",
    qa_status: qaStatus,
    updated_at: "2026-09-13T00:00:00Z",
  };
}

describe("quality sampling", () => {
  const items = [item(3), item(1, "passed"), item(2), item(4)];

  it("filters checked items when requested", () => {
    expect(eligibleQualityItems(items, true).map((entry) => entry.id)).toEqual([
      "item-2",
      "item-3",
      "item-4",
    ]);
  });

  it("selects a deterministic ratio sample", () => {
    const first = selectQualitySample(items, {
      mode: "ratio",
      percent: 50,
      count: 10,
      seed: "demo",
      onlyUnchecked: false,
    }).map((entry) => entry.id);
    const second = selectQualitySample(items, {
      mode: "ratio",
      percent: 50,
      count: 10,
      seed: "demo",
      onlyUnchecked: false,
    }).map((entry) => entry.id);

    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
  });

  it("caps count samples by eligible size", () => {
    expect(
      selectQualitySample(items, {
        mode: "count",
        percent: 10,
        count: 20,
        seed: "demo",
        onlyUnchecked: true,
      }),
    ).toHaveLength(3);
  });
});
