import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal, Typography, message } from "antd";
import { useNavigate, useParams } from "react-router-dom";
import { useShell } from "../../app/shellContext";
import type { FineAnnotation, Segment, WorkContext } from "../../shared/api/types";
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
import { templateIssues } from "./model/fineAnnotation";
import { isSkillEnabled } from "./skillAvailability";
import { GripperMarkModal, type GripperMarkSession } from "./components/GripperMarkModal";

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
  const pointMarkedCallback = useRef<
    ((point: NonNullable<FineAnnotation["keyframe_point"]>) => void) | undefined
  >(undefined);
  const [pointMarking, setPointMarking] = useState(false);
  const [gripperSession, setGripperSession] = useState<GripperMarkSession>();
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
    disabled:
      reviewing ||
      state.segments.some((segment) => {
        const skill = segment.fine_annotation?.skill || segment.skill;
        return !!skill && !isSkillEnabled(skill);
      }),
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

  const onFineChange = useCallback(
    (fine_annotation: FineAnnotation, text: string) => {
      if (!selected) return;
      pointMarkedCallback.current = undefined;
      setPointMarking(false);
      dispatch({ type: "update-fine", id: selected.id, fine_annotation, text });
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
  const onSelectSegment = useCallback((segment: Segment) => {
    pointMarkedCallback.current = undefined;
    setPointMarking(false);
    setSelectedId(segment.id);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (gripperSession) return;
      const target = event.target as HTMLElement | null;
      if (event.code !== "Space" || target?.matches("input, textarea, [contenteditable='true']")) {
        return;
      }
      event.preventDefault();
      split();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [split, gripperSession]);

  if (!context) return null;
  const submitDisabled =
    !state.segments.length ||
    state.segments.some((segment) => !segment.text.trim() || templateIssues(segment).length > 0);
  return (
    <div className="workbench-page">
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
            pointMarking={pointMarking}
            keyframePoint={selected?.fine_annotation?.keyframe_point}
            gripperPoints={
              selected?.fine_annotation?.skill === "Pick" ? selected.fine_annotation : undefined
            }
            currentFrame={videoSync.currentFrame}
            onPointMarked={(view, x, y) => {
              pointMarkedCallback.current?.({ frame: videoSync.currentFrame, view, x, y });
              pointMarkedCallback.current = undefined;
              setPointMarking(false);
              message.success("关键帧位置已记录");
            }}
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
            onSeek={videoSync.syncFrame}
          />
          <Timeline
            segments={state.segments}
            selectedId={selected?.id}
            currentFrame={videoSync.currentFrame}
            length={context.length}
            fps={fps}
            zoom={zoom}
            onSelect={onSelectSegment}
            onSeek={videoSync.syncFrame}
            onMoveBoundary={onMoveBoundary}
            onBoundaryDragStart={onBoundaryDragStart}
            onBoundaryDragEnd={onBoundaryDragEnd}
            onInteractionStart={videoSync.pauseAll}
          />
        </section>
        <SegmentEditor
          selected={selected}
          reviewing={reviewing}
          fps={fps}
          pointMarking={pointMarking}
          onBeginGripperMark={(hand, onConfirm) => {
            const frame = videoSync.currentFrame;
            if (!selected || frame < selected.start_frame || frame >= selected.end_frame) {
              message.warning("请先把播放头移动到当前标注段内");
              return;
            }
            videoSync.pauseAll();
            const view = Object.keys(context.video_urls).find((key) =>
              key.toLowerCase().includes("head"),
            );
            const video = view ? videoSync.videos.current[view] : undefined;
            if (!view || !video || video.readyState < 2 || !video.videoWidth) {
              message.warning("HEAD 当前帧尚未就绪，请等待视频加载后重试");
              return;
            }
            try {
              const canvas = document.createElement("canvas");
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const drawing = canvas.getContext("2d");
              if (!drawing) throw new Error("Canvas unavailable");
              drawing.drawImage(video, 0, 0);
              setGripperSession({
                image: canvas.toDataURL("image/png"),
                width: canvas.width,
                height: canvas.height,
                frame,
                view,
                hand,
                group: selected.fine_annotation?.gripper_keyframes?.[hand],
                onConfirm,
              });
            } catch {
              message.error("无法读取 HEAD 画面，请检查视频加载状态后重试");
            }
          }}
          onJumpFrame={videoSync.syncFrame}
          onBeginPointMark={(callback) => {
            if (
              !selected ||
              videoSync.currentFrame < selected.start_frame ||
              videoSync.currentFrame >= selected.end_frame
            ) {
              message.warning("请先把播放头移动到当前标注段内");
              return;
            }
            videoSync.pauseAll();
            pointMarkedCallback.current = callback;
            setPointMarking(true);
          }}
          onFineChange={onFineChange}
          onSave={() => saveDraft.mutate()}
          onSubmit={() => submit.mutate()}
          onReview={(decision) => review.mutate(decision)}
          isSaving={saveDraft.isPending || autosave.isSaving}
          isSubmitting={submit.isPending || review.isPending}
          canSubmit={!submitDisabled}
        />
      </div>
      {gripperSession && (
        <GripperMarkModal session={gripperSession} onClose={() => setGripperSession(undefined)} />
      )}
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
    </div>
  );
}
