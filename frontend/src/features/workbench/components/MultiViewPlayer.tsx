import { useLayoutEffect, useRef, useState } from "react";
import type { WorkContext } from "../../../shared/api/types";

type KeyframePoint = { frame: number; view: string; x: number; y: number };

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

function KeyframeMarker({ point }: { point: KeyframePoint }) {
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
      title={`帧 ${point.frame}`}
    />
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
  onPointMarked: (view: string, x: number, y: number) => void;
}) {
  const videoKeys = Object.keys(context.video_urls);
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
            ref={(element) => registerVideo(key, element)}
            src={context.video_urls[key]}
            preload="metadata"
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
          {keyframePoint?.view === key && <KeyframeMarker point={keyframePoint} />}
        </div>
      ))}
    </div>
  );
}
