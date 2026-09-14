import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useVideoSync } from "./useVideoSync";

function mockVideoPlayback(video: HTMLVideoElement) {
  let paused = true;
  Object.defineProperty(video, "paused", {
    configurable: true,
    get: () => paused,
  });
  const play = vi.spyOn(video, "play").mockImplementation(() => {
    paused = false;
    return Promise.resolve();
  });
  const pause = vi.spyOn(video, "pause").mockImplementation(() => {
    paused = true;
  });
  return { play, pause };
}

it("does not reset a native seek when the same video ref is reattached", () => {
  const { result } = renderHook(() => useVideoSync(100, 10));
  const video = document.createElement("video");
  act(() => result.current.registerVideo("head", video));
  video.currentTime = 1;
  act(() => {
    result.current.registerVideo("head", null);
    result.current.registerVideo("head", video);
  });
  expect(video.currentTime).toBe(1);
  act(() => result.current.syncFrame(10));
  expect(result.current.currentFrame).toBe(10);
  const replacement = document.createElement("video");
  act(() => result.current.registerVideo("head", replacement));
  expect(replacement.currentTime).toBe(1);
});

it("plays and pauses every registered view together", () => {
  const { result } = renderHook(() => useVideoSync(100, 10));
  const head = document.createElement("video");
  const left = document.createElement("video");
  const right = document.createElement("video");
  const headPlayback = mockVideoPlayback(head);
  const leftPlayback = mockVideoPlayback(left);
  const rightPlayback = mockVideoPlayback(right);

  act(() => {
    result.current.registerVideo("head", head);
    result.current.registerVideo("left", left);
    result.current.registerVideo("right", right);
    result.current.playSegment(20, 60);
  });
  expect(result.current.playing).toBe(true);
  expect(headPlayback.play).toHaveBeenCalledOnce();
  expect(leftPlayback.play).toHaveBeenCalledOnce();
  expect(rightPlayback.play).toHaveBeenCalledOnce();

  act(() => result.current.pauseAll());
  expect(result.current.playing).toBe(false);
  expect(headPlayback.pause).toHaveBeenCalled();
  expect(leftPlayback.pause).toHaveBeenCalled();
  expect(rightPlayback.pause).toHaveBeenCalled();
});

it("does not re-control the source video from its native playback event", () => {
  const { result } = renderHook(() => useVideoSync(100, 10));
  const head = document.createElement("video");
  const side = document.createElement("video");
  const headPlayback = mockVideoPlayback(head);
  const sidePlayback = mockVideoPlayback(side);

  act(() => {
    result.current.registerVideo("head", head);
    result.current.registerVideo("left", side);
    void sidePlayback.play();
    result.current.pauseAll(head);
  });

  expect(headPlayback.pause).not.toHaveBeenCalled();
  expect(sidePlayback.pause).toHaveBeenCalledOnce();
});

it("ignores stale native pause and play events", () => {
  const { result } = renderHook(() => useVideoSync(100, 10));
  const head = document.createElement("video");
  const side = document.createElement("video");
  const headPlayback = mockVideoPlayback(head);
  const sidePlayback = mockVideoPlayback(side);

  act(() => {
    result.current.registerVideo("head", head);
    result.current.registerVideo("left", side);
    result.current.playSegment(0, 10);
  });
  expect(result.current.playing).toBe(true);
  const sidePausesBeforeStaleEvent = sidePlayback.pause.mock.calls.length;
  act(() => result.current.pauseAll(head));
  expect(result.current.playing).toBe(true);
  expect(sidePlayback.pause).toHaveBeenCalledTimes(sidePausesBeforeStaleEvent);

  act(() => result.current.pauseAll());
  const headPlaysBeforeStaleEvent = headPlayback.play.mock.calls.length;
  act(() => result.current.playAll(head));
  expect(result.current.playing).toBe(false);
  expect(headPlayback.play).toHaveBeenCalledTimes(headPlaysBeforeStaleEvent);
});

it("pauses playback when jumping to a keyframe", () => {
  const { result } = renderHook(() => useVideoSync(100, 10));
  const head = document.createElement("video");
  const side = document.createElement("video");
  const headPlayback = mockVideoPlayback(head);
  const sidePlayback = mockVideoPlayback(side);

  act(() => {
    result.current.registerVideo("head", head);
    result.current.registerVideo("left", side);
    result.current.playSegment(0, 50);
  });
  expect(result.current.playing).toBe(true);

  act(() => result.current.pauseAtFrame(20));

  expect(result.current.playing).toBe(false);
  expect(result.current.currentFrame).toBe(20);
  expect(head.currentTime).toBe(2);
  expect(side.currentTime).toBe(2);
  expect(headPlayback.pause).toHaveBeenCalled();
  expect(sidePlayback.pause).toHaveBeenCalled();
});

it("keeps the video registration callback stable across frame updates", () => {
  const { result, rerender } = renderHook(() => useVideoSync(100, 10));
  const registerVideo = result.current.registerVideo;

  act(() => result.current.syncFrame(10));
  rerender();

  expect(result.current.registerVideo).toBe(registerVideo);
});
