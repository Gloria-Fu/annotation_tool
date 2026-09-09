import { useCallback, useRef, useState } from "react";
import { clampFrame } from "../model/timelineMath";

type VideoMap = Record<string, HTMLVideoElement | null>;

export function useVideoSync(length: number, fps: number) {
  const videos = useRef<VideoMap>({});
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);

  const registerVideo = useCallback(
    (key: string, element: HTMLVideoElement | null) => {
      videos.current[key] = element;
      if (element) {
        element.playbackRate = rate;
        element.currentTime = currentFrame / fps;
      }
    },
    [currentFrame, fps, rate],
  );
  const syncFrame = useCallback(
    (frame: number) => {
      const bounded = clampFrame(frame, length);
      setCurrentFrame(bounded);
      Object.values(videos.current).forEach((video) => {
        if (video && Math.abs(video.currentTime - bounded / fps) > 0.08) {
          video.currentTime = bounded / fps;
        }
      });
    },
    [fps, length],
  );
  const playAll = useCallback(() => {
    Object.values(videos.current).forEach((video) => void video?.play());
    setPlaying(true);
  }, []);
  const pauseAll = useCallback(() => {
    Object.values(videos.current).forEach((video) => video?.pause());
    setPlaying(false);
  }, []);
  const changeRate = useCallback((nextRate: number) => {
    setRate(nextRate);
    Object.values(videos.current).forEach((video) => {
      if (video) video.playbackRate = nextRate;
    });
  }, []);

  return {
    videos,
    currentFrame,
    playing,
    rate,
    registerVideo,
    syncFrame,
    playAll,
    pauseAll,
    changeRate,
  };
}
