import type { WorkContext } from "../../../shared/api/types";

export function MultiViewPlayer({
  context,
  registerVideo,
  playAll,
  pauseAll,
  changeRate,
  onFrameChange,
}: {
  context: WorkContext;
  registerVideo: (key: string, element: HTMLVideoElement | null) => void;
  playAll: () => void;
  pauseAll: () => void;
  changeRate: (rate: number) => void;
  onFrameChange: (frame: number) => void;
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
          className={index === 0 ? "video-card video-head" : "video-card video-side"}
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
                ? (event) => onFrameChange(Math.round(event.currentTarget.currentTime * context.fps))
                : undefined
            }
            controls={index === 0}
          />
        </div>
      ))}
    </div>
  );
}
