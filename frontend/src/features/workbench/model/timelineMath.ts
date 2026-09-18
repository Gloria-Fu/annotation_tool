export function clampFrame(frame: number, length: number) {
  return Math.max(0, Math.min(length, Math.round(frame)));
}

export function frameToPercent(frame: number, length: number) {
  if (!length) return 0;
  return (clampFrame(frame, length) / length) * 100;
}

export function uncoveredFrameRanges(
  segments: { start_frame: number; end_frame: number }[],
  length: number,
) {
  const ranges: { start_frame: number; end_frame: number }[] = [];
  if (length <= 0) return ranges;
  let coveredUntil = 0;
  for (const segment of [...segments].sort((left, right) => left.start_frame - right.start_frame)) {
    const start = clampFrame(segment.start_frame, length);
    const end = clampFrame(segment.end_frame, length);
    if (end <= start) continue;
    if (start > coveredUntil) ranges.push({ start_frame: coveredUntil, end_frame: start });
    coveredUntil = Math.max(coveredUntil, end);
  }
  if (coveredUntil < length) ranges.push({ start_frame: coveredUntil, end_frame: length });
  return ranges;
}

export function durationSeconds(
  startFrame: number,
  endFrame: number,
  fps: number,
  displayTimeScale = 1,
) {
  return ((endFrame - startFrame) / fps) * displayTimeScale;
}

export function displaySeconds(frame: number, fps: number, displayTimeScale = 1) {
  return (frame / fps) * displayTimeScale;
}

export function formatFrameTime(frame: number, fps: number, displayTimeScale = 1) {
  return `${displaySeconds(frame, fps, displayTimeScale).toFixed(2)}s`;
}

export function boundaryLimits(
  segments: { start_frame: number; end_frame: number }[],
  index: number,
  length: number,
) {
  const left = segments[index - 1];
  const right = segments[index];
  if (!left || !right) return { min: 0, max: length };
  return {
    min: index > 1 ? segments[index - 2].end_frame + 1 : 1,
    max: index < segments.length - 1 ? segments[index + 1].start_frame - 1 : length - 1,
  };
}
