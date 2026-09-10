import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FineAnnotation, KeyframePoint, WorkContext } from "../../../shared/api/types";
import { annotationHands, handLabel } from "../model/gripperKeyframes";

function videoContentBox(video: HTMLVideoElement) {
  const width = video.clientWidth;
  const height = video.clientHeight;
  const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
  const contentWidth = video.videoWidth * scale;
  const contentHeight = video.videoHeight * scale;
  return {
    left: (width - contentWidth) / 2,
    top: (height - contentHeight) / 2,
    width: contentWidth,
    height: contentHeight,
  };
}

function KeyframeMarker({ point, label }: { point: KeyframePoint; label?: string }) {
  const markerRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, visible: false });
  useLayoutEffect(() => {
    const marker = markerRef.current;
    const card = marker?.parentElement;
    const video = card?.querySelector("video");
    if (!card || !video) return;
    const update = () => {
      if (!video.videoWidth || !video.videoHeight) return;
      const cardRect = card.getBoundingClientRect();
      const videoRect = video.getBoundingClientRect();
      const box = videoContentBox(video);
      setPosition({
        left: videoRect.left - cardRect.left + box.left + point.x * box.width,
        top: videoRect.top - cardRect.top + box.top + point.y * box.height,
        visible: true,
      });
    };
    update();
    video.addEventListener("loadedmetadata", update);
    const observer = new ResizeObserver(update);
    observer.observe(video);
    return () => {
      video.removeEventListener("loadedmetadata", update);
      observer.disconnect();
    };
  }, [point]);
  return (
    <span
      ref={markerRef}
      className="video-keyframe-point"
      style={{
        left: position.left,
        top: position.top,
        visibility: position.visible ? "visible" : "hidden",
      }}
      title={`${label || "关键点"} · 帧 ${point.frame}`}
    >
      {label && <span className="video-keyframe-label">{label}</span>}
    </span>
  );
}

export function MultiViewPlayer({
  context,
  registerVideo,
  playAll,
  pauseAll,
  changeRate,
  onFrameChange,
  pointMarking,
  keyframePoint,
  gripperPoints,
  currentFrame,
  onPointMarked,
}: {
  context: WorkContext;
  registerVideo: (key: string, element: HTMLVideoElement | null) => void;
  playAll: () => void;
  pauseAll: () => void;
  changeRate: (rate: number) => void;
  onFrameChange: (frame: number) => void;
  pointMarking: boolean;
  keyframePoint?: KeyframePoint;
  gripperPoints?: FineAnnotation;
  currentFrame: number;
  onPointMarked: (view: string, x: number, y: number) => void;
}) {
  const videoKeys = Object.keys(context.video_urls);
  // Stable refs keep unrelated form renders from resetting a pending native seek.
  const videoRefs = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(context.video_urls).map((key) => [
          key,
          (element: HTMLVideoElement | null) => registerVideo(key, element),
        ]),
      ),
    [context.video_urls, registerVideo],
  );
  const headKey = videoKeys.find((key) => key.includes("head")) || videoKeys[0];
  const orderedKeys = [headKey, ...videoKeys.filter((key) => key !== headKey)].filter(
    (key): key is string => !!key,
  );

  return (
    <div className="video-grid">
      {orderedKeys.map((key, index) => (
        <div
          key={key}
          className={`${index === 0 ? "video-card video-head" : "video-card video-side"}${pointMarking ? " point-marking" : ""}`}
        >
          <div className="video-label">
            {key.includes("head")
              ? "HEAD 主视角"
              : key.includes("left")
                ? "LEFT 左视角"
                : "RIGHT 右视角"}
          </div>
          <video
            ref={videoRefs[key]}
            src={context.video_urls[key]}
            preload={index === 0 ? "auto" : "metadata"}
            muted={index > 0}
            onPlay={index === 0 ? playAll : undefined}
            onPause={index === 0 ? pauseAll : undefined}
            onRateChange={
              index === 0 ? (event) => changeRate(event.currentTarget.playbackRate) : undefined
            }
            onTimeUpdate={
              index === 0
                ? (event) =>
                    onFrameChange(Math.round(event.currentTarget.currentTime * context.fps))
                : undefined
            }
            controls={index === 0}
          />
          {pointMarking && (
            <button
              className="video-point-target"
              type="button"
              aria-label={`在${key}视角标记关键点`}
              onClick={(event) => {
                const video = event.currentTarget.previousElementSibling as HTMLVideoElement | null;
                if (!video || !video.videoWidth || !video.videoHeight) return;
                const rect = video.getBoundingClientRect();
                const box = videoContentBox(video);
                const x = (event.clientX - rect.left - box.left) / box.width;
                const y = (event.clientY - rect.top - box.top) / box.height;
                if (x >= 0 && x <= 1 && y >= 0 && y <= 1) onPointMarked(key, x, y);
              }}
            />
          )}
          {!gripperPoints &&
            keyframePoint?.view === key &&
            keyframePoint.frame === currentFrame && <KeyframeMarker point={keyframePoint} />}
          {gripperPoints &&
            annotationHands(gripperPoints).flatMap((hand) => {
              const group = gripperPoints.gripper_keyframes?.[hand];
              if (!group || group.view !== key || group.frame !== currentFrame) return [];
              return (["left", "right"] as const).map((side) => {
                const point = group[side];
                return point?.visibility === "visible" ? (
                  <KeyframeMarker
                    key={hand + side}
                    point={{ frame: group.frame, view: group.view, x: point.x, y: point.y }}
                    label={handLabel(hand) + (side === "left" ? "左夹" : "右夹")}
                  />
                ) : null;
              });
            })}
        </div>
      ))}
    </div>
  );
}
