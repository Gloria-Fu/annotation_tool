import { describe, expect, it } from "vitest";
import { boundaryLimits, clampFrame, durationSeconds, frameToPercent } from "./timelineMath";

describe("timelineMath", () => {
  it("clamps frames to the episode", () => {
    expect(clampFrame(-2, 10)).toBe(0);
    expect(clampFrame(12, 10)).toBe(10);
  });

  it("converts frames and durations consistently", () => {
    expect(frameToPercent(5, 10)).toBe(50);
    expect(durationSeconds(10, 40, 30)).toBe(1);
  });

  it("keeps a boundary inside its neighboring segments", () => {
    expect(
      boundaryLimits(
        [
          { start_frame: 0, end_frame: 4 },
          { start_frame: 4, end_frame: 8 },
          { start_frame: 8, end_frame: 10 },
        ],
        1,
        10,
      ),
    ).toEqual({ min: 1, max: 7 });
  });
});
