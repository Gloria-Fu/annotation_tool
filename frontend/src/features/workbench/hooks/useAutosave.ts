import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApiError } from "../../../shared/api/client";
import type { RevisionSnapshot, Segment } from "../../../shared/api/types";
import { queryKeys } from "../../../shared/queryKeys";
import { workbenchApi } from "../api";

export function useAutosave({
  itemId,
  segments,
  dirty,
  disabled,
  revision,
  onSaved,
}: {
  itemId: string;
  segments: Segment[];
  dirty: boolean;
  disabled: boolean;
  revision: RevisionSnapshot | null;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const [saveState, setSaveState] = useState("未修改");
  const mutation = useMutation({
    mutationFn: (snapshot: Segment[]) =>
      workbenchApi.saveDraft(itemId, workbenchApi.revisionInput(snapshot, revision)),
    onMutate: () => setSaveState("保存中"),
    onSuccess: () => {
      setSaveState("已保存");
      onSaved?.();
      void queryClient.invalidateQueries({ queryKey: queryKeys.workContext(itemId) });
    },
    onError: (error: ApiError) => setSaveState(`保存失败：${error.message}`),
  });

  useEffect(() => {
    if (!dirty || disabled || mutation.isPending) return;
    const timer = window.setTimeout(() => mutation.mutate(segments), 2000);
    return () => window.clearTimeout(timer);
  }, [dirty, disabled, mutation, segments]);

  return { saveState, saveDraft: mutation.mutate, isSaving: mutation.isPending };
}
