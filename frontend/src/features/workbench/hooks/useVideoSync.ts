import { useCallback, useEffect, useRef, useState } from "react";
import { clampFrame, DEFAULT_PREVIEW_RATE } from "../model/timelineMath";

type VideoMap = Record<string, HTMLVideoElement | null>;

function nativePlaybackRate(displayRate: number) {
  return displayRate * DEFAULT_PREVIEW_RATE;
}

export function useVideoSync(length: number, fps: number) {
  const videos = useRef<VideoMap>({});
  const initializedVideos = useRef(new WeakSet<HTMLVideoElement>());
  const playbackRange = useRef<{ endFrame: number } | null>(null);
  const currentFrameRef = useRef(0);
  const rateRef = useRef(1);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    currentFrameRef.current = currentFrame;
  }, [currentFrame]);

  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);

  const primaryVideo = (): HTMLVideoElement | undefined => {
    const headEntry = Object.entries(videos.current).find(
      ([key, video]) => key.toLowerCase().includes("head") && video,
    );
    if (headEntry?.[1]) return headEntry[1];
    return Object.values(videos.current).find((video): video is HTMLVideoElement => video !== null);
  };
  const playVideo = (video: HTMLVideoElement) => {
    if (!video.paused) return;
    void video.play().catch(() => undefined);
  };
  const pauseVideo = (video: HTMLVideoElement) => {
    if (video.paused) return;
    video.pause();
  };

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const endFrame = playbackRange.current?.endFrame;
      const head = primaryVideo();
      if (endFrame === undefined || !head || head.currentTime * fps < endFrame) return;
      playbackRange.current = null;
      Object.values(videos.current).forEach((video) => {
        if (video) pauseVideo(video);
      });
      setCurrentFrame(Math.max(0, endFrame - 1));
      setPlaying(false);
    }, 30);
    return () => window.clearInterval(timer);
  }, [fps, playing]);

  const registerVideo = useCallback(
    (key: string, element: HTMLVideoElement | null) => {
      videos.current[key] = element;
      if (element && !initializedVideos.current.has(element)) {
        initializedVideos.current.add(element);
        element.playbackRate = nativePlaybackRate(rateRef.current);
        element.currentTime = currentFrameRef.current / fps;
      }
    },
    [fps],
  );
  const syncFrame = useCallback(
    (frame: number) => {
      const bounded = clampFrame(frame, length);
      currentFrameRef.current = bounded;
      setCurrentFrame(bounded);
      if (playbackRange.current && bounded >= playbackRange.current.endFrame) {
        playbackRange.current = null;
        Object.values(videos.current).forEach((video) => {
          if (video) pauseVideo(video);
        });
        setPlaying(false);
      }
      Object.values(videos.current).forEach((video) => {
        if (video && Math.abs(video.currentTime - bounded / fps) > 0.08) {
          video.currentTime = bounded / fps;
        }
      });
    },
    [fps, length],
  );
  const playAll = useCallback((source?: HTMLVideoElement) => {
    // A stale native play event can arrive after a newer pause. The current
    // media state is the only reliable way to reject that event.
    if (source?.paused) return;
    Object.values(videos.current).forEach((video) => {
      if (video && video !== source) playVideo(video);
    });
    setPlaying(true);
  }, []);
  const pauseAll = useCallback((source?: HTMLVideoElement) => {
    // A stale native pause event can arrive after a newer play. Ignore it if
    // the source has already resumed.
    if (source && !source.paused) return;
    playbackRange.current = null;
    Object.values(videos.current).forEach((video) => {
      if (video && video !== source) pauseVideo(video);
    });
    setPlaying(false);
  }, []);
  const pauseAtFrame = useCallback(
    (frame: number) => {
      playbackRange.current = null;
      const bounded = clampFrame(frame, length);
      currentFrameRef.current = bounded;
      setCurrentFrame(bounded);
      Object.values(videos.current).forEach((video) => {
        if (!video) return;
        pauseVideo(video);
        video.currentTime = bounded / fps;
      });
      setPlaying(false);
    },
    [fps, length],
  );
  const playSegment = useCallback(
    (startFrame: number, endFrame: number) => {
      const start = clampFrame(startFrame, length);
      const end = clampFrame(endFrame, length);
      if (end <= start) return;
      playbackRange.current = { endFrame: end };
      const position = start / fps;
      Object.values(videos.current).forEach((video) => {
        if (!video) return;
        video.playbackRate = nativePlaybackRate(rate);
        video.currentTime = position;
        playVideo(video);
      });
      currentFrameRef.current = start;
      setCurrentFrame(start);
      setPlaying(true);
    },
    [fps, length, rate],
  );
  const changeRate = useCallback((nextRate: number) => {
    setRate(nextRate);
    Object.values(videos.current).forEach((video) => {
      if (video) video.playbackRate = nativePlaybackRate(nextRate);
    });
    rateRef.current = nextRate;
  }, []);

  return {
    videos,
    currentFrame,
    playing,
    rate,
    registerVideo,
    syncFrame,
    playAll,
    playSegment,
    pauseAll,
    pauseAtFrame,
    changeRate,
  };
}
