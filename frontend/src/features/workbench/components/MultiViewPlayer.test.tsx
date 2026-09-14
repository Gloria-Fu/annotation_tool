import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { WorkContext } from "../../../shared/api/types";
import { MultiViewPlayer } from "./MultiViewPlayer";

const context: WorkContext = {
  item: {
    id: "item-1",
    package_id: "package-1",
    episode_id: "episode-1",
    claim_order: 0,
    status: "annotating",
    annotator_id: "annotator-1",
    reviewer_id: null,
    qa_status: "unchecked",
    updated_at: "2026-01-01T00:00:00Z",
  },
  episode_index: 0,
  length: 100,
  fps: 10,
  tasks: ["pick"],
  data_url: "/data",
  video_urls: {
    head: "/head.mp4",
    left: "/left.mp4",
    right: "/right.mp4",
  },
  latest_revision: null,
};

it("forwards native HEAD playback events to the sync controller", () => {
  const onPlay = vi.fn();
  const onPause = vi.fn();
  const { container } = render(
    <MultiViewPlayer
      context={context}
      registerVideo={vi.fn()}
      changeRate={vi.fn()}
      onPlay={onPlay}
      onPause={onPause}
      onFrameChange={vi.fn()}
      pointMarking={false}
      currentFrame={0}
      onPointMarked={vi.fn()}
    />,
  );
  const videos = container.querySelectorAll("video");
  fireEvent.play(videos[0]);
  fireEvent.pause(videos[0]);

  expect(videos).toHaveLength(3);
  expect(onPlay).toHaveBeenCalledWith(videos[0]);
  expect(onPause).toHaveBeenCalledWith(videos[0]);
});
