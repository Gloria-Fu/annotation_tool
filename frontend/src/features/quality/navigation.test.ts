import { describe, expect, it } from "vitest";
import { qualityPagePath, qualitySelectionFromSearch, qualityWorkbenchPath } from "./navigation";

describe("quality navigation", () => {
  it("keeps the selected package and batch in quality routes", () => {
    expect(qualityPagePath({ packageId: "package-1", batchId: "batch-1" })).toBe(
      "/quality?package_id=package-1&batch_id=batch-1",
    );
    expect(qualityWorkbenchPath("item-1", { packageId: "package-1", batchId: "batch-1" })).toBe(
      "/work/item-1?package_id=package-1&batch_id=batch-1",
    );
  });

  it("restores selection from URL search params", () => {
    expect(
      qualitySelectionFromSearch(new URLSearchParams("package_id=package-1&batch_id=batch-1")),
    ).toEqual({
      packageId: "package-1",
      batchId: "batch-1",
    });
  });
});
