export function clampFrame(frame: number, length: number) {
  return Math.max(0, Math.min(length, Math.round(frame)));
}

export function frameToPercent(frame: number, length: number) {
  if (!length) return 0;
  return (clampFrame(frame, length) / length) * 100;
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
