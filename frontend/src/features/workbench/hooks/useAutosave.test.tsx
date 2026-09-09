import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Segment } from "../../../shared/api/types";
import { useAutosave } from "./useAutosave";
import { workbenchApi } from "../api";

vi.mock("../api", () => ({
  workbenchApi: {
    saveDraft: vi.fn(() => Promise.resolve({ id: "item-1" })),
    revisionInput: vi.fn((segments: Segment[]) => ({
      schema_version: "segments.v1",
      payload: { schema_version: "segments.v1", segments },
      base_revision_id: null,
    })),
  },
}));

const segments: Segment[] = [{ id: "one", start_frame: 0, end_frame: 10, text: "pick" }];

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useAutosave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves a dirty draft after the debounce interval", async () => {
    const onSaved = vi.fn();
    renderHook(
      () =>
        useAutosave({
          itemId: "item-1",
          segments,
          dirty: true,
          disabled: false,
          revision: null,
          onSaved,
        }),
      { wrapper },
    );

    expect(workbenchApi.saveDraft).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
      await Promise.resolve();
    });

    expect(workbenchApi.saveDraft).toHaveBeenCalledOnce();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("does not autosave while disabled", async () => {
    renderHook(
      () =>
        useAutosave({
          itemId: "item-1",
          segments,
          dirty: true,
          disabled: true,
          revision: null,
        }),
      { wrapper },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(workbenchApi.saveDraft).not.toHaveBeenCalled();
  });
});
