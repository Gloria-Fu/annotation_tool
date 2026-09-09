import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useVideoSync } from "./useVideoSync";

describe("useVideoSync", () => {
  it("keeps registered videos on the selected frame and playback rate", () => {
    const { result } = renderHook(() => useVideoSync(20, 10));
    const video = document.createElement("video");
    const play = vi.fn(() => Promise.resolve());
    const pause = vi.fn();
    video.play = play;
    video.pause = pause;

    act(() => result.current.registerVideo("cam.head", video));
    expect(video.currentTime).toBe(0);
    expect(video.playbackRate).toBe(1);

    act(() => result.current.syncFrame(12));
    expect(result.current.currentFrame).toBe(12);
    expect(video.currentTime).toBeCloseTo(1.2);

    act(() => result.current.changeRate(0.5));
    expect(result.current.rate).toBe(0.5);
    expect(video.playbackRate).toBe(0.5);

    act(() => result.current.playAll());
    expect(play).toHaveBeenCalled();
    expect(result.current.playing).toBe(true);

    act(() => result.current.pauseAll());
    expect(pause).toHaveBeenCalled();
    expect(result.current.playing).toBe(false);
  });

  it("clamps frame sync to the episode length", () => {
    const { result } = renderHook(() => useVideoSync(20, 10));

    act(() => result.current.syncFrame(999));

    expect(result.current.currentFrame).toBe(20);
  });

  it("plays a selected segment and pauses at its end", () => {
    const { result } = renderHook(() => useVideoSync(20, 10));
    const video = document.createElement("video");
    const play = vi.fn(() => Promise.resolve());
    const pause = vi.fn();
    video.play = play;
    video.pause = pause;

    act(() => result.current.registerVideo("cam.head", video));
    act(() => result.current.playSegment(5, 12));

    expect(video.currentTime).toBeCloseTo(0.5);
    expect(play).toHaveBeenCalledOnce();
    expect(result.current.currentFrame).toBe(5);
    expect(result.current.playing).toBe(true);

    act(() => result.current.syncFrame(12));

    expect(pause).toHaveBeenCalledOnce();
    expect(result.current.playing).toBe(false);
  });
});
