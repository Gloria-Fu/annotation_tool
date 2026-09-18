import { describe, expect, it } from "vitest";
import {
  boundaryLimits,
  clampFrame,
  displaySeconds,
  durationSeconds,
  formatFrameTime,
  frameToPercent,
  uncoveredFrameRanges,
} from "./timelineMath";

describe("timelineMath", () => {
  it("clamps frames to the episode", () => {
    expect(clampFrame(-2, 10)).toBe(0);
    expect(clampFrame(12, 10)).toBe(10);
  });

  it("converts frames and durations consistently", () => {
    expect(frameToPercent(5, 10)).toBe(50);
    expect(durationSeconds(10, 40, 30)).toBe(1);
    const previewTimeScale = 1 / 1.3;
    expect(displaySeconds(39, 30, previewTimeScale)).toBeCloseTo(1);
    expect(durationSeconds(0, 39, 30, previewTimeScale)).toBeCloseTo(1);
    expect(formatFrameTime(39, 30, previewTimeScale)).toBe("1.00s");
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

  it("finds timeline ranges that are not covered by segments", () => {
    expect(
      uncoveredFrameRanges(
        [
          { start_frame: 5, end_frame: 10 },
          { start_frame: 0, end_frame: 3 },
          { start_frame: 8, end_frame: 12 },
        ],
        15,
      ),
    ).toEqual([
      { start_frame: 3, end_frame: 5 },
      { start_frame: 12, end_frame: 15 },
    ]);
  });
});
