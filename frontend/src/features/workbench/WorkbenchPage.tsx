import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal, Typography, message } from "antd";
import { ArrowLeft } from "lucide-react";
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
import { currentFineAnnotation, fineAnnotationText, templateIssues } from "./model/fineAnnotation";
import { isSkillEnabled } from "./skillAvailability";
import { GripperMarkModal, type GripperMarkSession } from "./components/GripperMarkModal";

function assigneeLabel(person: WorkContext["annotator"]) {
  if (!person) return "";
  return `${person.display_name} @${person.username}`;
}

function initialSegments(context: WorkContext): Segment[] {
  const segments = context.latest_revision?.payload.segments;
  return Array.isArray(segments) && segments.length > 0
    ? segments.map((segment) => {
        const fine = currentFineAnnotation(segment);
        return {
          ...segment,
          original_text: segment.original_text ?? segment.text,
          fine_annotation: fine,
          text: fineAnnotationText(fine),
        };
      })
    : [createBlankSegment(context.length)];
}

export function WorkbenchPage() {
  const { itemId = "" } = useParams();
  const { user } = useShell();
  const readOnly = user.role === "outsourcing_manager";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(segmentReducer, [], () => createWorkbenchState());
  const [selectedId, setSelectedId] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [revision, setRevision] = useState<WorkContext["latest_revision"]>(null);
  const [reviewSaveError, setReviewSaveError] = useState<string | null>(null);
  const [reviewDraftSaved, setReviewDraftSaved] = useState(false);
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
      readOnly ||
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
  const saveReviewDraft = useMutation({
    mutationFn: () =>
      workbenchApi.saveReviewDraft(itemId, workbenchApi.revisionInput(state.segments, revision)),
    onMutate: () => setReviewSaveError(null),
    onSuccess: () => {
      setDirty(false);
      setRevision(null);
      setReviewDraftSaved(true);
      message.success("审核修改已保存");
      void queryClient.invalidateQueries({ queryKey: queryKeys.workContext(itemId) });
    },
    onError: (error: Error) => setReviewSaveError(error.message),
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.myTasksRoot(false) });
      void navigate(-1);
    },
    onError: (error: Error) => message.error(error.message),
  });
  const review = useMutation({
    mutationFn: ({
      decision,
      comment,
    }: {
      decision: "approve" | "request_changes";
      comment?: string;
    }) =>
      workbenchApi.review(itemId, {
        decision,
        comment,
        payload: { schema_version: "segments.v1", segments: state.segments },
      }),
    onSuccess: () => {
      message.success("审核操作成功");
      void queryClient.invalidateQueries({ queryKey: queryKeys.myTasksRoot(true) });
      void navigate(-1);
    },
    onError: (error: Error) => message.error(error.message),
  });
  const markDirty = useCallback(() => {
    if (readOnly) return;
    setDirty(true);
    setReviewDraftSaved(false);
    setReviewSaveError(null);
  }, [readOnly]);

  const onFineChange = useCallback(
    (fine_annotation: FineAnnotation, text: string) => {
      if (readOnly || !selected) return;
      pointMarkedCallback.current = undefined;
      setPointMarking(false);
      dispatch({ type: "update-fine", id: selected.id, fine_annotation, text });
      markDirty();
    },
    [markDirty, readOnly, selected],
  );
  const split = useCallback(() => {
    if (readOnly) return;
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
      markDirty();
    } else {
      message.info("请将播放头放在当前片段内部");
    }
  }, [markDirty, readOnly, selected, videoSync.currentFrame]);
  const clear = useCallback(() => {
    if (!readOnly) setClearOpen(true);
  }, [readOnly]);
  const confirmClear = () => {
    if (readOnly) return;
    dispatch({ type: "clear", length });
    setSelectedId("segment-1");
    setDirty(false);
    void clearServer.mutateAsync();
  };
  const onMoveBoundary = useCallback(
    (index: number, frame: number) => {
      if (readOnly) return;
      dispatch({ type: "move-boundary", index, frame, length });
      markDirty();
    },
    [length, markDirty, readOnly],
  );
  const onBoundaryDragStart = useCallback(() => dispatch({ type: "begin-boundary" }), []);
  const onBoundaryDragEnd = useCallback(() => dispatch({ type: "commit" }), []);
  const onSelectSegment = useCallback(
    (segment: Segment) => {
      pointMarkedCallback.current = undefined;
      setPointMarking(false);
      setSelectedId(segment.id);
      videoSync.playSegment(segment.start_frame, segment.end_frame);
    },
    [videoSync],
  );
  const navigateSegment = useCallback(
    (direction: "previous" | "replay" | "next") => {
      if (!selected) return;
      const index = state.segments.findIndex((segment) => segment.id === selected.id);
      const target =
        direction === "previous"
          ? state.segments[index - 1]
          : direction === "next"
            ? state.segments[index + 1]
            : selected;
      if (target) {
        setSelectedId(target.id);
        videoSync.playSegment(target.start_frame, target.end_frame);
      }
    },
    [selected, state.segments, videoSync],
  );
  const navigateFromToolbar = useCallback(
    (direction: "previous" | "next") => navigateSegment(direction),
    [navigateSegment],
  );
  const mergeSelected = useCallback(
    (direction: "previous" | "next") => {
      if (readOnly) return;
      if (!selected) return;
      const index = state.segments.findIndex((segment) => segment.id === selected.id);
      if (
        index < 0 ||
        (direction === "previous" ? index === 0 : index === state.segments.length - 1)
      )
        return;
      dispatch({ type: "merge", id: selected.id, direction });
      markDirty();
    },
    [markDirty, readOnly, selected, state.segments],
  );
  const canCreateRetry =
    !!selected &&
    currentFineAnnotation(selected).outcome === "failure" &&
    videoSync.currentFrame >= selected.start_frame &&
    videoSync.currentFrame < selected.end_frame - 1;
  const createRetry = useCallback(() => {
    if (readOnly || !selected || !canCreateRetry) return;
    const newId = `${selected.id}-retry-${Date.now()}`;
    const boundary = videoSync.currentFrame + 1;
    dispatch({ type: "create-retry", id: selected.id, frame: videoSync.currentFrame, newId });
    setSelectedId(newId);
    markDirty();
    videoSync.playSegment(boundary, selected.end_frame);
  }, [canCreateRetry, markDirty, readOnly, selected, videoSync]);

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
    state.segments.some(
      (segment) =>
        !segment.text.trim() ||
        templateIssues(segment).length > 0 ||
        segment.annotation_status !== "confirmed",
    );
  const reviewSaveState = saveReviewDraft.isPending
    ? "保存审核修改中"
    : reviewSaveError
      ? `保存审核修改失败：${reviewSaveError}`
      : dirty
        ? "审核修改未保存"
        : reviewDraftSaved
          ? "审核修改已保存"
          : "无待保存修改";
  const headingSaveState = readOnly ? "只读查看" : reviewing ? reviewSaveState : autosave.saveState;
  return (
    <div className="workbench-page">
      <PageHeading
        title={
          <span className="workbench-title">
            <span>Episode {context.episode_index}</span>
            {(context.annotator || context.reviewer) && (
              <span className="workbench-assignees">
                {context.annotator && <span>标注：{assigneeLabel(context.annotator)}</span>}
                {context.reviewer && <span>审核：{assigneeLabel(context.reviewer)}</span>}
              </span>
            )}
          </span>
        }
        subtitle={`${context.length} 帧 · ${(context.length / fps).toFixed(2)} 秒 · ${context.tasks.join(" / ")}`}
        leading={
          <button
            type="button"
            className="workbench-back-button"
            aria-label="返回上一个页面"
            title="返回上一个页面"
            onClick={() => void navigate(-1)}
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
        }
        action={
          <Typography.Text type={headingSaveState.includes("失败") ? "danger" : "secondary"}>
            {headingSaveState}
          </Typography.Text>
        }
      />
      <div className="annotation-workbench">
        <section className="workbench-main">
          <MultiViewPlayer
            context={context}
            registerVideo={videoSync.registerVideo}
            changeRate={videoSync.changeRate}
            onPlay={videoSync.playAll}
            onPause={videoSync.pauseAll}
            onFrameChange={videoSync.syncFrame}
            pointMarking={pointMarking}
            keyframePoint={selected?.fine_annotation?.keyframe_point}
            gripperPoints={
              selected?.fine_annotation?.skill === "Pick" ||
              selected?.fine_annotation?.skill === "Place"
                ? selected.fine_annotation
                : undefined
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
              markDirty();
            }}
            onRedo={() => {
              dispatch({ type: "redo" });
              markDirty();
            }}
            onSeek={videoSync.syncFrame}
            onPreviousSegment={() => navigateFromToolbar("previous")}
            onNextSegment={() => navigateFromToolbar("next")}
            onMerge={mergeSelected}
            canMergePrevious={
              !!selected && state.segments.findIndex((segment) => segment.id === selected.id) > 0
            }
            canMergeNext={
              !!selected &&
              state.segments.findIndex((segment) => segment.id === selected.id) <
                state.segments.length - 1
            }
            readOnly={readOnly}
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
            readOnly={readOnly}
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
                failure: currentFineAnnotation(selected).outcome === "failure",
                group: selected.fine_annotation?.gripper_keyframes?.[hand],
                onConfirm,
              });
            } catch {
              message.error("无法读取 HEAD 画面，请检查视频加载状态后重试");
            }
          }}
          onJumpFrame={videoSync.pauseAtFrame}
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
          onConfirm={() => {
            if (!selected) return;
            dispatch({ type: "confirm", id: selected.id });
            markDirty();
          }}
          onNavigate={navigateSegment}
          onCreateRetry={createRetry}
          onSave={() => (reviewing ? saveReviewDraft.mutate() : saveDraft.mutate())}
          onSubmit={() => submit.mutate()}
          onReview={(decision, comment) => review.mutate({ decision, comment })}
          isSaving={saveDraft.isPending || autosave.isSaving || saveReviewDraft.isPending}
          isSubmitting={submit.isPending || review.isPending}
          canSubmit={!submitDisabled}
          canCreateRetry={canCreateRetry}
          reviewReason={context.review_comment}
          qualityReason={context.quality_comment}
          readOnly={readOnly}
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
