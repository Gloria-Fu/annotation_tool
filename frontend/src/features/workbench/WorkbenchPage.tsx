import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal, Typography, message } from "antd";
import { useNavigate, useParams } from "react-router-dom";
import { useShell } from "../../app/shellContext";
import type { Segment, WorkContext } from "../../shared/api/types";
import { queryKeys } from "../../shared/queryKeys";
import { PageHeading } from "../../shared/ui/PageHeading";
import { workbenchApi } from "./api";
import { MultiViewPlayer } from "./components/MultiViewPlayer";
import { SegmentEditor } from "./components/SegmentEditor";
import { Timeline } from "./components/Timeline";
import { WorkbenchToolbar } from "./components/WorkbenchToolbar";
import { useAutosave } from "./hooks/useAutosave";
import { useVideoSync } from "./hooks/useVideoSync";
import { createBlankSegment, createWorkbenchState, segmentReducer } from "./model/segmentReducer";
import { formatFrameTime } from "./model/timelineMath";

function initialSegments(context: WorkContext): Segment[] {
  const segments = context.latest_revision?.payload.segments;
  return Array.isArray(segments) && segments.length > 0
    ? segments
    : [createBlankSegment(context.length)];
}

export function WorkbenchPage() {
  const { itemId = "" } = useParams();
  const { user } = useShell();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(segmentReducer, [], () => createWorkbenchState());
  const [selectedId, setSelectedId] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [revision, setRevision] = useState<WorkContext["latest_revision"]>(null);
  const initialized = useRef(false);
  const { data: context } = useQuery({
    queryKey: queryKeys.workContext(itemId),
    queryFn: () => workbenchApi.context(itemId),
    enabled: !!itemId,
  });

  useEffect(() => {
    if (!context || initialized.current) return;
    const segments = initialSegments(context);
    dispatch({ type: "replace", segments });
    setSelectedId(segments[0]?.id);
    setRevision(context.latest_revision);
    initialized.current = true;
  }, [context]);

  const fps = Number(context?.fps || 30);
  const length = context?.length || 0;
  const videoSync = useVideoSync(length, fps);
  const selected = state.segments.find((segment) => segment.id === selectedId) || state.segments[0];
  const reviewing = context?.item.reviewer_id === user.id;
  const autosave = useAutosave({
    itemId,
    segments: state.segments,
    dirty,
    disabled: reviewing,
    revision,
    onSaved: () => {
      setDirty(false);
      setRevision(null);
    },
  });

  const saveDraft = useMutation({
    mutationFn: () =>
      workbenchApi.saveDraft(itemId, workbenchApi.revisionInput(state.segments, revision)),
    onSuccess: () => {
      setDirty(false);
      setRevision(null);
      message.success("草稿已保存");
      void queryClient.invalidateQueries({ queryKey: queryKeys.workContext(itemId) });
    },
    onError: (error: Error) => message.error(error.message),
  });
  const clearServer = useMutation({
    mutationFn: () => workbenchApi.clear(itemId),
    onSuccess: () => {
      setDirty(false);
      setRevision(null);
      setClearOpen(false);
      message.success("已清空当前任务标注");
      void queryClient.invalidateQueries({ queryKey: queryKeys.workContext(itemId) });
    },
    onError: (error: Error) => message.error(error.message),
  });
  const submit = useMutation({
    mutationFn: () =>
      workbenchApi.submit(itemId, workbenchApi.revisionInput(state.segments, revision)),
    onSuccess: () => {
      message.success("已提交审核");
      void queryClient.invalidateQueries({ queryKey: queryKeys.myTasks(false) });
      void navigate(-1);
    },
    onError: (error: Error) => message.error(error.message),
  });
  const review = useMutation({
    mutationFn: (decision: "approve" | "request_changes") =>
      workbenchApi.review(itemId, {
        decision,
        comment: decision === "approve" ? undefined : "请修改标注",
        payload: { schema_version: "segments.v1", segments: state.segments },
      }),
    onSuccess: () => {
      message.success("审核操作成功");
      void queryClient.invalidateQueries({ queryKey: queryKeys.myTasks(true) });
      void navigate(-1);
    },
    onError: (error: Error) => message.error(error.message),
  });

  const onTextChange = useCallback(
    (text: string) => {
      if (!selected) return;
      dispatch({ type: "update-text", id: selected.id, text });
      setDirty(true);
    },
    [selected],
  );
  const split = useCallback(() => {
    if (!selected) {
      message.info("请先选择一个标注段");
      return;
    }
    const newId = `${selected.id}-split-${Date.now()}`;
    dispatch({ type: "split", id: selected.id, frame: videoSync.currentFrame, newId });
    if (
      videoSync.currentFrame > selected.start_frame &&
      videoSync.currentFrame < selected.end_frame
    ) {
      setSelectedId(newId);
      setDirty(true);
    } else {
      message.info("请将播放头放在当前片段内部");
    }
  }, [selected, videoSync.currentFrame]);
  const clear = useCallback(() => setClearOpen(true), []);
  const confirmClear = () => {
    dispatch({ type: "clear", length });
    setSelectedId("segment-1");
    setDirty(false);
    void clearServer.mutateAsync();
  };
  const onMoveBoundary = useCallback(
    (index: number, frame: number) => {
      dispatch({ type: "move-boundary", index, frame, length });
      setDirty(true);
    },
    [length],
  );
  const onBoundaryDragStart = useCallback(() => dispatch({ type: "begin-boundary" }), []);
  const onBoundaryDragEnd = useCallback(() => dispatch({ type: "commit" }), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.code !== "Space" || target?.matches("input, textarea, [contenteditable='true']")) {
        return;
      }
      event.preventDefault();
      split();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [split]);

  if (!context) return null;
  const submitDisabled =
    !state.segments.length || state.segments.some((segment) => !segment.text.trim());
  return (
    <>
      <PageHeading
        title={`Episode ${context.episode_index}`}
        subtitle={`${context.length} 帧 · ${(context.length / fps).toFixed(2)} 秒 · ${context.tasks.join(" / ")}`}
        action={
          <Typography.Text
            type={autosave.saveState.startsWith("保存失败") ? "danger" : "secondary"}
          >
            {autosave.saveState}
          </Typography.Text>
        }
      />
      <div className="annotation-workbench">
        <section className="workbench-main">
          <MultiViewPlayer
            context={context}
            registerVideo={videoSync.registerVideo}
            playAll={videoSync.playAll}
            pauseAll={videoSync.pauseAll}
            changeRate={videoSync.changeRate}
            onFrameChange={videoSync.syncFrame}
          />
          <WorkbenchToolbar
            currentFrame={videoSync.currentFrame}
            length={context.length}
            fps={fps}
            zoom={zoom}
            rate={videoSync.rate}
            canUndo={state.past.length > 0}
            canRedo={state.future.length > 0}
            onSplit={split}
            onClear={clear}
            onZoomChange={setZoom}
            onRateChange={videoSync.changeRate}
            onUndo={() => {
              dispatch({ type: "undo" });
              setDirty(true);
            }}
            onRedo={() => {
              dispatch({ type: "redo" });
              setDirty(true);
            }}
          />
          <Timeline
            segments={state.segments}
            selectedId={selected?.id}
            currentFrame={videoSync.currentFrame}
            length={context.length}
            fps={fps}
            zoom={zoom}
            onSelect={(segment) => setSelectedId(segment.id)}
            onSeek={videoSync.syncFrame}
            onMoveBoundary={onMoveBoundary}
            onBoundaryDragStart={onBoundaryDragStart}
            onBoundaryDragEnd={onBoundaryDragEnd}
          />
        </section>
        <SegmentEditor
          selected={selected}
          reviewing={reviewing}
          fps={fps}
          onTextChange={onTextChange}
          onSave={() => saveDraft.mutate()}
          onSubmit={() => submit.mutate()}
          onReview={(decision) => review.mutate(decision)}
          isSaving={saveDraft.isPending || autosave.isSaving}
          isSubmitting={submit.isPending || review.isPending}
          canSubmit={!submitDisabled}
        />
      </div>
      <Modal
        open={clearOpen}
        title="清空全部标注？"
        okText="清空"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        confirmLoading={clearServer.isPending}
        onCancel={() => {
          if (!clearServer.isPending) setClearOpen(false);
        }}
        onOk={confirmClear}
      >
        <p>当前任务中的标注文字会清空并合并为一个完整片段，原始数据文件不会改变。</p>
      </Modal>
      <span className="sr-only">{formatFrameTime(videoSync.currentFrame, fps)}</span>
    </>
  );
}
