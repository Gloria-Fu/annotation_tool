import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useVideoSync } from "./useVideoSync";

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
