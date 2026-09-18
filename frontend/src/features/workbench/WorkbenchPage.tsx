import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Input, Modal, Select, Space, Tag, Typography, message } from "antd";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useShell } from "../../app/shellContext";
import type { FineAnnotation, QualitySample, Segment, WorkContext } from "../../shared/api/types";
import { statusLabels } from "../../shared/constants/labels";
import { queryKeys } from "../../shared/queryKeys";
import { PageHeading } from "../../shared/ui/PageHeading";
import { qualityApi } from "../quality/api";
import {
  qualityPagePath,
  qualitySelectionFromSearch,
  qualityWorkbenchPath,
} from "../quality/navigation";
import { workbenchApi } from "./api";
import { MultiViewPlayer } from "./components/MultiViewPlayer";
import { SegmentEditor } from "./components/SegmentEditor";
import { Timeline } from "./components/Timeline";
import { WorkbenchToolbar } from "./components/WorkbenchToolbar";
import { useAutosave } from "./hooks/useAutosave";
import { useVideoSync } from "./hooks/useVideoSync";
import { canAnnotateItem, canReviewItem, isWorkbenchReadOnly } from "./workPermissions";
import { createBlankSegment, createWorkbenchState, segmentReducer } from "./model/segmentReducer";
import { displaySeconds, formatFrameTime, uncoveredFrameRanges } from "./model/timelineMath";
import { currentFineAnnotation, fineAnnotationText, templateIssues } from "./model/fineAnnotation";
import { isSkillEnabled } from "./skillAvailability";
import { GripperMarkModal, type GripperMarkSession } from "./components/GripperMarkModal";
import {
  WORK_ISSUE_SEVERITY_OPTIONS,
  WORK_ISSUE_TYPE_OPTIONS,
  composeReturnComment,
  issueAnchorLabel,
  issueSourceLabel,
  parseIssueRecords,
  type WorkIssueRecord,
  type WorkIssueSeverity,
  type WorkIssueSource,
  type WorkIssueType,
} from "./model/issueRecords";

type IssueDraft = Omit<
  WorkIssueRecord,
  "id" | "issue_type" | "severity" | "comment" | "created_at"
> & {
  issue_type: WorkIssueType;
  severity: WorkIssueSeverity;
  comment: string;
};

function assigneeLabel(person: WorkContext["annotator"]) {
  if (!person) return "";
  return `${person.display_name} @${person.username}`;
}

function isTextEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest(
    "input, textarea, select, [contenteditable='true'], [contenteditable=''], [role='textbox'], [role='combobox'], [role='spinbutton'], [role='slider']",
  );
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

function nextPendingQualitySample(
  samples: QualitySample[],
  currentItemId: string,
): QualitySample | undefined {
  const current = samples.find((sample) => sample.task_item_id === currentItemId);
  if (!current) return samples.find((sample) => !sample.latest_check);
  return (
    samples.find((sample) => sample.sample_order > current.sample_order && !sample.latest_check) ||
    samples.find((sample) => sample.task_item_id !== currentItemId && !sample.latest_check)
  );
}

function issueStorageKey(itemId: string, source: WorkIssueSource, batchId?: string) {
  return `workbench-issues:${itemId}:${source}:${
    source === "quality" ? batchId || "quality" : "review"
  }`;
}

function loadStoredIssues(key: string) {
  try {
    return parseIssueRecords(window.localStorage.getItem(key));
  } catch {
    return [];
  }
}

export function WorkbenchPage() {
  const { itemId = "" } = useParams();
  const { user } = useShell();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qualitySelection = qualitySelectionFromSearch(searchParams);
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(segmentReducer, [], () => createWorkbenchState());
  const [selectedId, setSelectedId] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [revision, setRevision] = useState<WorkContext["latest_revision"]>(null);
  const [reviewSaveError, setReviewSaveError] = useState<string | null>(null);
  const [reviewDraftSaved, setReviewDraftSaved] = useState(false);
  const initializedItemId = useRef<string | undefined>(undefined);
  const pointMarkedCallback = useRef<
    ((point: NonNullable<FineAnnotation["keyframe_point"]>) => void) | undefined
  >(undefined);
  const [pointMarking, setPointMarking] = useState(false);
  const [gripperSession, setGripperSession] = useState<GripperMarkSession>();
  const [savedIssueRecords, setSavedIssueRecords] = useState<{
    key: string;
    records: WorkIssueRecord[];
  }>({ key: "", records: [] });
  const [issueDraft, setIssueDraft] = useState<IssueDraft | null>(null);
  const { data: context } = useQuery({
    queryKey: queryKeys.workContext(itemId),
    queryFn: () => workbenchApi.context(itemId),
    enabled: !!itemId,
  });
  const { data: qualityBatch } = useQuery({
    queryKey: qualitySelection.batchId
      ? queryKeys.qualityBatch(qualitySelection.batchId)
      : queryKeys.qualityBatch("empty"),
    queryFn: () => qualityApi.batch(qualitySelection.batchId as string),
    enabled: !!qualitySelection.batchId,
  });

  useEffect(() => {
    if (!context || initializedItemId.current === context.item.id) return;
    const segments = initialSegments(context);
    dispatch({ type: "reset", segments });
    setSelectedId(segments[0]?.id);
    setRevision(context.latest_revision);
    setDirty(false);
    setClearOpen(false);
    setReviewSaveError(null);
    setReviewDraftSaved(false);
    pointMarkedCallback.current = undefined;
    setPointMarking(false);
    setGripperSession(undefined);
    setIssueDraft(null);
    initializedItemId.current = context.item.id;
  }, [context, setPointMarking]);

  const fps = Number(context?.fps || 30);
  const length = context?.length || 0;
  const previewSpeedFactor = Number(context?.preview_speed_factor || 1);
  const previewTimeScale = 1 / previewSpeedFactor;
  const videoSync = useVideoSync(length, fps, previewSpeedFactor);
  const selected = state.segments.find((segment) => segment.id === selectedId) || state.segments[0];
  const selectedFine = selected ? currentFineAnnotation(selected) : undefined;
  const canEditAnnotation = context ? canAnnotateItem(context.item, user.id) : false;
  const reviewing = context ? canReviewItem(context.item, user.id) : false;
  const readOnly = context ? isWorkbenchReadOnly(context.item, user) : true;
  const qualitySample = qualityBatch?.samples.find((sample) => sample.task_item_id === itemId);
  const canRecordQualityIssue = Boolean(
    qualitySelection.batchId &&
    qualitySample &&
    qualityBatch &&
    !qualitySample.latest_check &&
    qualityBatch.status === "open",
  );
  const issueMode: WorkIssueSource | undefined = reviewing
    ? "review"
    : canRecordQualityIssue
      ? "quality"
      : undefined;
  const activeIssueStorageKey = issueMode
    ? issueStorageKey(itemId, issueMode, qualitySelection.batchId)
    : "";
  const issueRecords = useMemo(() => {
    if (!activeIssueStorageKey) return [];
    if (savedIssueRecords.key === activeIssueStorageKey) return savedIssueRecords.records;
    return loadStoredIssues(activeIssueStorageKey);
  }, [activeIssueStorageKey, savedIssueRecords]);
  const nextQualitySample = qualityBatch
    ? nextPendingQualitySample(qualityBatch.samples, itemId)
    : undefined;
  const qualityReturnPath = qualityPagePath({
    packageId: qualityBatch?.package_id ?? qualitySelection.packageId,
    batchId: qualityBatch?.id ?? qualitySelection.batchId,
  });
  const returnFromWorkbench = useCallback(() => {
    if (qualitySelection.batchId) {
      void navigate(qualityReturnPath);
      return;
    }
    void navigate(-1);
  }, [navigate, qualityReturnPath, qualitySelection.batchId]);
  const saveIssueRecords = useCallback(
    (records: WorkIssueRecord[]) => {
      if (!activeIssueStorageKey) {
        setSavedIssueRecords({ key: "", records: [] });
        return;
      }
      setSavedIssueRecords({ key: activeIssueStorageKey, records });
      try {
        if (records.length) {
          window.localStorage.setItem(activeIssueStorageKey, JSON.stringify(records));
        } else {
          window.localStorage.removeItem(activeIssueStorageKey);
        }
      } catch {
        // Losing a local issue draft should not block the review workflow.
      }
    },
    [activeIssueStorageKey, setSavedIssueRecords],
  );
  const clearIssueRecords = useCallback(() => saveIssueRecords([]), [saveIssueRecords]);
  const autosave = useAutosave({
    itemId,
    segments: state.segments,
    dirty,
    disabled:
      !canEditAnnotation ||
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
        comment:
          decision === "request_changes" ? composeReturnComment(comment, issueRecords) : comment,
        payload: { schema_version: "segments.v1", segments: state.segments },
      }),
    onSuccess: () => {
      clearIssueRecords();
      message.success("审核操作成功");
      void queryClient.invalidateQueries({ queryKey: queryKeys.myTasksRoot(true) });
      void navigate(-1);
    },
    onError: (error: Error) => message.error(error.message),
  });
  const qualityCheck = useMutation({
    mutationFn: ({ result, comment }: { result: "passed" | "rejected"; comment?: string }) =>
      qualityApi.check(
        qualitySelection.batchId as string,
        itemId,
        result,
        result === "rejected" ? composeReturnComment(comment, issueRecords) : comment,
      ),
    onSuccess: (_, variables) => {
      clearIssueRecords();
      message.success(variables.result === "passed" ? "抽检通过已记录" : "抽检退回已记录");
      if (qualitySelection.batchId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.qualityBatch(qualitySelection.batchId),
        });
      }
      void queryClient.invalidateQueries({
        queryKey: queryKeys.qualityBatches(qualityBatch?.project_id),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.qualityHistory(itemId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workContext(itemId) });
    },
    onError: (error: Error) => message.error(error.message),
  });
  const goNextQualitySample = useCallback(() => {
    if (!nextQualitySample || !qualityBatch) return;
    void navigate(
      qualityWorkbenchPath(nextQualitySample.task_item_id, {
        packageId: qualityBatch.package_id,
        batchId: qualityBatch.id,
      }),
      { replace: true },
    );
  }, [navigate, nextQualitySample, qualityBatch]);
  const markDirty = useCallback(() => {
    if (readOnly) return;
    setDirty(true);
    setReviewDraftSaved(false);
    setReviewSaveError(null);
  }, [readOnly, setDirty, setReviewDraftSaved, setReviewSaveError]);
  const openIssueRecorder = useCallback(() => {
    if (!issueMode) {
      message.info("只有审核或抽检时可以记录问题");
      return;
    }
    const frame = videoSync.currentFrame;
    const targetSegment =
      state.segments.find((segment) => frame >= segment.start_frame && frame < segment.end_frame) ||
      selected;
    if (!targetSegment) {
      message.info("请先选择或定位到一个标注段");
      return;
    }
    const segmentIndex = state.segments.findIndex((segment) => segment.id === targetSegment.id) + 1;
    const fine = currentFineAnnotation(targetSegment);
    const skill = fine.skill || targetSegment.skill || "";
    videoSync.pauseAll();
    setIssueDraft({
      source: issueMode,
      segment_id: targetSegment.id,
      segment_index: Math.max(segmentIndex, 1),
      segment_label: issueAnchorLabel(Math.max(segmentIndex, 1), skill),
      skill,
      frame,
      time_seconds: displaySeconds(frame, fps, previewTimeScale),
      issue_type: "keyframe_error",
      severity: "major",
      comment: "",
    });
  }, [fps, issueMode, previewTimeScale, selected, setIssueDraft, state.segments, videoSync]);
  const saveIssueDraft = useCallback(() => {
    if (!issueDraft || !issueDraft.comment.trim()) return;
    const record: WorkIssueRecord = {
      ...issueDraft,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      comment: issueDraft.comment.trim(),
      created_at: new Date().toISOString(),
    };
    saveIssueRecords([...issueRecords, record]);
    setIssueDraft(null);
    message.success("问题已记录");
  }, [issueDraft, issueRecords, saveIssueRecords, setIssueDraft]);
  const removeIssueRecord = useCallback(
    (issueId: string) => {
      saveIssueRecords(issueRecords.filter((issue) => issue.id !== issueId));
    },
    [issueRecords, saveIssueRecords],
  );
  const jumpToIssue = useCallback(
    (issue: WorkIssueRecord) => {
      const targetSegment = state.segments.find((segment) => segment.id === issue.segment_id);
      if (targetSegment) setSelectedId(targetSegment.id);
      videoSync.pauseAtFrame(issue.frame);
    },
    [setSelectedId, state.segments, videoSync],
  );
  const handleReview = useCallback(
    (decision: "approve" | "request_changes", comment?: string) => {
      if (decision === "approve" && issueMode === "review" && issueRecords.length > 0) {
        message.warning("已记录问题，请删除问题后再审核通过，或执行退回修改");
        return;
      }
      review.mutate({ decision, comment });
    },
    [issueMode, issueRecords.length, review],
  );

  const onFineChange = useCallback(
    (fine_annotation: FineAnnotation, text: string) => {
      if (readOnly || !selected) return;
      pointMarkedCallback.current = undefined;
      setPointMarking(false);
      dispatch({ type: "update-fine", id: selected.id, fine_annotation, text });
      markDirty();
    },
    [dispatch, markDirty, readOnly, selected, setPointMarking],
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
  }, [dispatch, markDirty, readOnly, selected, setSelectedId, videoSync.currentFrame]);
  const clear = useCallback(() => {
    if (!readOnly) setClearOpen(true);
  }, [readOnly, setClearOpen]);
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
    [dispatch, length, markDirty, readOnly],
  );
  const onBoundaryDragStart = useCallback(() => dispatch({ type: "begin-boundary" }), [dispatch]);
  const onBoundaryDragEnd = useCallback(() => dispatch({ type: "commit" }), [dispatch]);
  const onSelectSegment = useCallback(
    (segment: Segment) => {
      pointMarkedCallback.current = undefined;
      setPointMarking(false);
      setSelectedId(segment.id);
      videoSync.playSegment(segment.start_frame, segment.end_frame);
    },
    [setPointMarking, setSelectedId, videoSync],
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
    [selected, setSelectedId, state.segments, videoSync],
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
    [dispatch, markDirty, readOnly, selected, state.segments],
  );
  const canCreateRetry =
    !!selected &&
    selectedFine?.segment_validity === "valid" &&
    selectedFine.outcome === "failure" &&
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
  }, [canCreateRetry, dispatch, markDirty, readOnly, selected, setSelectedId, videoSync]);

  const nudgeFrame = useCallback(
    (delta: number) => videoSync.pauseAtFrame(videoSync.currentFrame + delta),
    [videoSync],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (gripperSession) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (isTextEditingTarget(event.target)) {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        split();
        return;
      }
      if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        event.preventDefault();
        nudgeFrame(event.code === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [split, gripperSession, nudgeFrame]);

  if (!context) return null;
  const hasUncoveredFrames = uncoveredFrameRanges(state.segments, context.length).length > 0;
  const submitDisabled =
    hasUncoveredFrames ||
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
        subtitle={`${context.length} 帧 · ${displaySeconds(context.length, fps, previewTimeScale).toFixed(2)} 秒`}
        leading={
          <button
            type="button"
            className="workbench-back-button"
            aria-label="返回上一个页面"
            title="返回上一个页面"
            onClick={returnFromWorkbench}
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
            onPlay={videoSync.playAll}
            onPause={videoSync.pauseAll}
            onFrameChange={videoSync.syncFrame}
            pointMarking={pointMarking}
            keyframePoint={
              selectedFine?.segment_validity === "valid" &&
              selectedFine.skill !== "Pick" &&
              selectedFine.skill !== "Place"
                ? selectedFine.keyframe_point
                : undefined
            }
            gripperPoints={undefined}
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
            displayTimeScale={previewTimeScale}
            zoom={zoom}
            rate={videoSync.rate}
            playing={videoSync.playing}
            canUndo={state.past.length > 0}
            canRedo={state.future.length > 0}
            onSplit={split}
            onClear={clear}
            onZoomChange={setZoom}
            onRateChange={videoSync.changeRate}
            onPlay={videoSync.playAll}
            onPause={videoSync.pauseAll}
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
            onRecordIssue={issueMode ? openIssueRecorder : undefined}
            issueCount={issueRecords.length}
            canRecordIssue={!!issueMode}
            readOnly={readOnly}
          />
          <Timeline
            segments={state.segments}
            selectedId={selected?.id}
            currentFrame={videoSync.currentFrame}
            length={context.length}
            fps={fps}
            displayTimeScale={previewTimeScale}
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
          key={itemId}
          selected={selected}
          reviewing={reviewing}
          fps={fps}
          displayTimeScale={previewTimeScale}
          currentFrame={videoSync.currentFrame}
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
          onReview={handleReview}
          qualityCheck={
            qualitySelection.batchId && qualitySample && qualityBatch
              ? {
                  checkedLabel: qualitySample.latest_check
                    ? `已${statusLabels[qualitySample.latest_check.result] || qualitySample.latest_check.result}`
                    : undefined,
                  canCheck: !qualitySample.latest_check && qualityBatch.status === "open",
                  loading: qualityCheck.isPending,
                  onPass: () => {
                    if (hasUncoveredFrames) {
                      message.warning("存在未覆盖片段，请抽检退回");
                      return;
                    }
                    if (issueRecords.length > 0) {
                      message.warning("已记录问题，请删除问题后再抽检通过，或执行抽检退回");
                      return;
                    }
                    qualityCheck.mutate({ result: "passed" });
                  },
                  onReject: (comment) => qualityCheck.mutate({ result: "rejected", comment }),
                  onNext: nextQualitySample ? goNextQualitySample : undefined,
                }
              : undefined
          }
          isSaving={saveDraft.isPending || autosave.isSaving || saveReviewDraft.isPending}
          isSubmitting={submit.isPending || review.isPending}
          canSubmit={!readOnly && !submitDisabled}
          canCreateRetry={canCreateRetry}
          reviewReason={context.review_comment}
          qualityReason={context.quality_comment}
          issueMode={issueMode}
          issueRecords={issueRecords}
          onJumpIssue={jumpToIssue}
          onRemoveIssue={removeIssueRecord}
          readOnly={readOnly}
        />
      </div>
      {gripperSession && (
        <GripperMarkModal session={gripperSession} onClose={() => setGripperSession(undefined)} />
      )}
      <Modal
        open={!!issueDraft}
        title="记录问题"
        okText="保存问题"
        cancelText="取消"
        okButtonProps={{ disabled: !issueDraft?.comment.trim() }}
        onCancel={() => setIssueDraft(null)}
        onOk={saveIssueDraft}
      >
        {issueDraft && (
          <div className="issue-record-form">
            <Space size={6} wrap>
              <Tag color={issueDraft.source === "quality" ? "purple" : "gold"}>
                {issueSourceLabel(issueDraft.source)}
              </Tag>
              <Tag>{issueDraft.segment_label}</Tag>
              <Tag>帧 {issueDraft.frame}</Tag>
              <Tag>{issueDraft.time_seconds.toFixed(2)}s</Tag>
            </Space>
            <div className="issue-record-form-grid">
              <label className="sentence-field">
                <span>问题类型 *</span>
                <Select<WorkIssueType>
                  value={issueDraft.issue_type}
                  options={WORK_ISSUE_TYPE_OPTIONS.map((option) => ({ ...option }))}
                  onChange={(issue_type) =>
                    setIssueDraft((current) => (current ? { ...current, issue_type } : current))
                  }
                />
              </label>
              <label className="sentence-field">
                <span>严重程度 *</span>
                <Select<WorkIssueSeverity>
                  value={issueDraft.severity}
                  options={WORK_ISSUE_SEVERITY_OPTIONS.map((option) => ({ ...option }))}
                  onChange={(severity) =>
                    setIssueDraft((current) => (current ? { ...current, severity } : current))
                  }
                />
              </label>
            </div>
            <label className="sentence-field">
              <span>问题说明 *</span>
              <Input.TextArea
                rows={4}
                value={issueDraft.comment}
                placeholder="用一句话说明这里需要如何修改"
                maxLength={500}
                showCount
                onChange={(event) =>
                  setIssueDraft((current) =>
                    current ? { ...current, comment: event.target.value } : current,
                  )
                }
              />
            </label>
          </div>
        )}
      </Modal>
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
      <span className="sr-only">
        {formatFrameTime(videoSync.currentFrame, fps, previewTimeScale)}
      </span>
    </div>
  );
}
