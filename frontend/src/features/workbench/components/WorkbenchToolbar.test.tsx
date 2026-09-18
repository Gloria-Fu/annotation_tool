import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { WorkbenchToolbar } from "./WorkbenchToolbar";

function renderToolbar(overrides: Partial<Parameters<typeof WorkbenchToolbar>[0]> = {}) {
  const props: Parameters<typeof WorkbenchToolbar>[0] = {
    currentFrame: 10,
    length: 100,
    fps: 10,
    displayTimeScale: 1,
    zoom: 1,
    rate: 1,
    playing: false,
    canUndo: false,
    canRedo: false,
    onSplit: vi.fn(),
    onClear: vi.fn(),
    onZoomChange: vi.fn(),
    onRateChange: vi.fn(),
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onSeek: vi.fn(),
    onPreviousSegment: vi.fn(),
    onNextSegment: vi.fn(),
    onMerge: vi.fn(),
    canMergePrevious: false,
    canMergeNext: false,
    ...overrides,
  };
  render(<WorkbenchToolbar {...props} />);
  return props;
}

it("does not pass the click event to playback callbacks", () => {
  const onPause = vi.fn();
  renderToolbar({ playing: true, onPause });

  fireEvent.click(screen.getByRole("button", { name: "暂停" }));

  expect(onPause).toHaveBeenCalledWith();
});
