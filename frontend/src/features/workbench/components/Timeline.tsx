import { useEffect, useRef } from "react";
import type { Segment } from "../../../shared/api/types";
import { formatFrameTime, frameToPercent } from "../model/timelineMath";

export function Timeline({
  segments,
  selectedId,
  currentFrame,
  length,
  fps,
  zoom,
  onSelect,
  onSeek,
  onMoveBoundary,
  onBoundaryDragStart,
  onBoundaryDragEnd,
}: {
  segments: Segment[];
  selectedId?: string;
  currentFrame: number;
  length: number;
  fps: number;
  zoom: number;
  onSelect: (segment: Segment) => void;
  onSeek: (frame: number) => void;
  onMoveBoundary: (index: number, frame: number) => void;
  onBoundaryDragStart: () => void;
  onBoundaryDragEnd: () => void;
}) {
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ index: number } | null>(null);
  const seekRef = useRef(false);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const frame = Math.round(ratio * length);
      if (seekRef.current) onSeek(frame);
      if (dragRef.current) onMoveBoundary(dragRef.current.index, frame);
    };
    const up = () => {
      if (dragRef.current) onBoundaryDragEnd();
      dragRef.current = null;
      seekRef.current = false;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [length, onBoundaryDragEnd, onBoundaryDragStart, onMoveBoundary, onSeek]);

  return (
    <div className="timeline-scroll">
      <div
        className="timeline-track"
        ref={timelineRef}
        style={{ width: `${zoom * 100}%` }}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          onSeek(Math.round(((event.clientX - rect.left) / rect.width) * length));
        }}
      >
        <div
          className="timeline-playhead"
          style={{ left: `${frameToPercent(currentFrame, length)}%` }}
        />
        {segments.map((segment, index) => (
          <div
            key={segment.id}
            className={`timeline-segment ${segment.id === selectedId ? "active" : ""}`}
            style={{
              left: `${frameToPercent(segment.start_frame, length)}%`,
              width: `${frameToPercent(segment.end_frame - segment.start_frame, length)}%`,
            }}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(segment);
              onSeek(segment.start_frame);
            }}
          >
            <span>{index + 1}. {segment.text || "未填写"}</span>
            {index > 0 && (
              <i
                className="timeline-divider"
                aria-label="拖动调整片段分界"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onBoundaryDragStart();
                  dragRef.current = { index };
                }}
              />
            )}
          </div>
        ))}
        <div className="timeline-axis">
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <span key={ratio} style={{ left: `${ratio * 100}%` }}>
              {formatFrameTime(Math.round(length * ratio), fps)}
            </span>
          ))}
        </div>
        <div
          className="timeline-handle"
          title="拖动定位播放位置"
          style={{ left: `${frameToPercent(currentFrame, length)}%` }}
          onPointerDown={(event) => {
            event.stopPropagation();
            seekRef.current = true;
          }}
        />
      </div>
    </div>
  );
}
