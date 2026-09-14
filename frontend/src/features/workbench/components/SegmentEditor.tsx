import { Crosshair, RotateCcw } from "lucide-react";
import { Button, Input, Modal, Segmented, Select, Space, Tag, Typography } from "antd";
import { useState } from "react";
import type {
  AnnotationOutcome,
  FineAnnotation,
  Segment,
  GripperKeyframe,
  OperatorHand,
} from "../../../shared/api/types";
import { annotationHands, handLabel, completeGripper } from "../model/gripperKeyframes";
import { durationSeconds, formatFrameTime } from "../model/timelineMath";
import {
  currentFineAnnotation,
  fineAnnotationPreview,
  fineAnnotationText,
  templateIssues,
} from "../model/fineAnnotation";
import { getSkillDefinition, sentenceFieldValue, sentenceTokens } from "../skillDefinitions";
import { isSkillEnabled, SKILL_OPTIONS } from "../skillAvailability";
import { FAILURE_REASON_OPTIONS, failureReasonLabel } from "../failureReasons";

export function SegmentEditor({
  selected,
  reviewing,
  fps,
  pointMarking,
  onBeginPointMark,
  onBeginGripperMark,
  onJumpFrame,
  onFineChange,
  onSave,
  onSubmit,
  onReview,
  onConfirm,
  onNavigate,
  onCreateRetry,
  isSaving,
  isSubmitting,
  canSubmit,
  canCreateRetry,
  reviewReason,
  qualityReason,
  readOnly,
}: {
  selected?: Segment;
  reviewing: boolean;
  fps: number;
  pointMarking: boolean;
  onBeginPointMark: (
    onMarked: (point: NonNullable<FineAnnotation["keyframe_point"]>) => void,
  ) => void;
  onBeginGripperMark: (hand: OperatorHand, onConfirm: (group: GripperKeyframe) => void) => void;
  onJumpFrame: (frame: number) => void;
  onFineChange: (fine: FineAnnotation, text: string) => void;
  onSave: () => void;
  onSubmit: () => void;
  onReview: (decision: "approve" | "request_changes", comment?: string) => void;
  onConfirm: () => void;
  onNavigate: (direction: "previous" | "replay" | "next") => void;
  onCreateRetry: () => void;
  isSaving: boolean;
  isSubmitting: boolean;
  canSubmit: boolean;
  canCreateRetry: boolean;
  reviewReason?: string | null;
  qualityReason?: string | null;
  readOnly?: boolean;
}) {
  const [reviewComment, setReviewComment] = useState("");
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  if (!selected)
    return (
      <aside className="segment-editor">
        <Typography.Text type="secondary">
          暂无标注片段，请在时间轴中创建或导入片段。
        </Typography.Text>
      </aside>
    );
  const fine = currentFineAnnotation(selected);
  const update = (patch: Partial<FineAnnotation>) => {
    const next = { ...fine, ...patch };
    onFineChange(next, fineAnnotationText(next));
  };
  const definition = getSkillDefinition(fine.skill || selected.skill || "");
  const enabled = !readOnly && isSkillEnabled(fine.skill || selected.skill || "");
  const values = fine.template_values || {};
  const issues = templateIssues(selected);
  const updateValue = (key: string, value: string) =>
    update({
      skill: definition?.name,
      template_version: 1,
      template_values: { ...values, [key]: value },
    });
  const isPickOrPlace = definition?.name === "Pick" || definition?.name === "Place";
  const updateOutcome = (outcome: AnnotationOutcome) =>
    update(
      outcome === "failure"
        ? { outcome }
        : {
            outcome,
            failure_reason: "",
            failure_reason_code: undefined,
            failure_direction: undefined,
            failure_detail: undefined,
          },
    );
  const updateFailureReason = (
    failure_reason_code: (typeof FAILURE_REASON_OPTIONS)[number]["value"],
  ) => {
    const failure_direction =
      failure_reason_code === "gripper_deviated" ? fine.failure_direction : undefined;
    const failure_detail = failure_reason_code === "other" ? fine.failure_detail : undefined;
    update({
      outcome: "failure",
      failure_reason_code,
      failure_direction,
      failure_detail,
      failure_reason: failureReasonLabel(failure_reason_code, failure_direction, failure_detail),
    });
  };
  const keyframeDefinitionText =
    fine.outcome === "failure" && isPickOrPlace
      ? "本次尝试确认失败的 HEAD 画面"
      : definition?.keyframeDefinition;
  const requiredObjectsText =
    fine.outcome === "failure" && isPickOrPlace
      ? "可选：本次失败帧中操作手夹爪的左夹和右夹位置；看不见的夹指标为不可见"
      : definition?.requiredObjects.join("、");
  const beginPointMark = () => onBeginPointMark((keyframe_point) => update({ keyframe_point }));
  return (
    <aside className="segment-editor">
      <div className="editor-heading">
        <Typography.Title level={4}>精细标注</Typography.Title>
        <Tag color={readOnly ? "default" : reviewing ? "gold" : "blue"}>
          {readOnly ? "只读查看" : reviewing ? "待审核" : "编辑中"}
        </Tag>
      </div>
      <section className="editor-result" aria-label="最终标注结果">
        <div className="editor-result-heading">
          <Typography.Text strong>最终标注结果</Typography.Text>
          <Tag
            color={
              selected.annotation_status === "confirmed"
                ? "green"
                : selected.annotation_status === "in_progress"
                  ? "blue"
                  : "default"
            }
          >
            {selected.annotation_status === "confirmed"
              ? "已确认"
              : selected.annotation_status === "in_progress"
                ? "标注中"
                : "未标注"}
          </Tag>
          <Space className="segment-navigation" size="small">
            <Button size="small" onClick={() => onNavigate("previous")}>
              上一段
            </Button>
            <Button size="small" onClick={() => onNavigate("replay")}>
              重播
            </Button>
            <Button size="small" onClick={() => onNavigate("next")}>
              下一段
            </Button>
          </Space>
        </div>
        <div className="fine-preview">
          {fineAnnotationPreview(fine).map((part, index) =>
            part.kind === "plain" ? (
              <span key={index}>{part.text}</span>
            ) : (
              <span
                key={index}
                className={`fine-preview-token fine-preview-token-${part.kind}`}
                title={part.kind === "filled" ? "已填写" : "待填写"}
              >
                {part.text}
              </span>
            ),
          )}
        </div>
        {reviewReason && !reviewing && (
          <Typography.Paragraph type="danger">审核退回原因：{reviewReason}</Typography.Paragraph>
        )}
        {qualityReason && !reviewing && (
          <Typography.Paragraph type="danger">
            质量抽检退回原因：{qualityReason}
          </Typography.Paragraph>
        )}
        {issues.length > 0 && (
          <Typography.Paragraph type="warning">待填写：{issues.join("、")}</Typography.Paragraph>
        )}
      </section>
      <div className="editor-fields">
        <div className="segment-meta">
          {formatFrameTime(selected.start_frame, fps)} - {formatFrameTime(selected.end_frame, fps)}{" "}
          · 时长 {durationSeconds(selected.start_frame, selected.end_frame, fps).toFixed(2)} 秒
        </div>
        <label className="sentence-field sentence-skill">
          <span>技能</span>
          <Select
            aria-label="技能"
            value={fine.skill || selected.skill || undefined}
            options={SKILL_OPTIONS}
            onChange={(skill) =>
              update({
                skill,
                template_version: 1,
                template_values: values,
                keyframe_point: undefined,
                keyframe_points: undefined,
                gripper_keyframes: undefined,
              })
            }
            placeholder="选择技能"
          />
        </label>
        {!readOnly && !enabled && (
          <Typography.Text type="warning">
            {fine.skill || selected.skill ? "该 Skill 暂未开放，请选择其他技能" : "请选择技能"}
          </Typography.Text>
        )}
        {isPickOrPlace && (
          <section className={`attempt-outcome outcome-${fine.outcome}`} aria-label="本次尝试结果">
            <div className="attempt-outcome-heading">
              <Typography.Text strong>本次尝试结果</Typography.Text>
              <Segmented
                value={fine.outcome}
                disabled={!enabled}
                options={[
                  { value: "pending", label: "待判定" },
                  { value: "success", label: "成功" },
                  { value: "failure", label: "失败" },
                ]}
                onChange={(value) => {
                  if (value === "pending" || value === "success" || value === "failure")
                    updateOutcome(value);
                }}
              />
            </div>
          </section>
        )}
        {fine.outcome === "failure" && isPickOrPlace && (
          <section className="failure-event-panel" aria-label="失败事件面板">
            <div className="failure-event-heading">
              <Typography.Text strong>失败事件记录</Typography.Text>
              <Typography.Text type="secondary">
                失败后的复杂状态不需要套入成功句式，直接按画面记录即可。
              </Typography.Text>
            </div>
            <div className="failure-fields">
              <label className="sentence-field">
                <span>失败原因 *</span>
                <Select
                  disabled={!enabled}
                  aria-label="失败原因"
                  value={fine.failure_reason_code}
                  placeholder="选择失败原因"
                  options={FAILURE_REASON_OPTIONS}
                  onChange={updateFailureReason}
                />
              </label>
              {fine.failure_reason_code === "gripper_deviated" && (
                <label className="sentence-field">
                  <span>偏移方向 *</span>
                  <Input
                    disabled={!enabled}
                    aria-label="偏移方向"
                    value={fine.failure_direction || ""}
                    placeholder="如：左上方"
                    onChange={(event) => {
                      const failure_direction = event.target.value;
                      update({
                        outcome: "failure",
                        failure_direction,
                        failure_reason: failureReasonLabel(
                          fine.failure_reason_code,
                          failure_direction,
                          fine.failure_detail,
                        ),
                      });
                    }}
                  />
                </label>
              )}
              {fine.failure_reason_code === "other" ? (
                <label className="sentence-field failure-detail-field">
                  <span>失败情况说明 *</span>
                  <Input.TextArea
                    disabled={!enabled}
                    aria-label="失败情况说明"
                    value={fine.failure_detail || ""}
                    placeholder="描述本次失败以及失败后的状态"
                    rows={3}
                    onChange={(event) => {
                      const failure_detail = event.target.value;
                      update({
                        outcome: "failure",
                        failure_detail,
                        failure_reason: failureReasonLabel(
                          fine.failure_reason_code,
                          fine.failure_direction,
                          failure_detail,
                        ),
                      });
                    }}
                  />
                </label>
              ) : (
                <label className="sentence-field failure-detail-field">
                  <span>失败后状态 / 现场说明（选填）</span>
                  <Input.TextArea
                    disabled={!enabled}
                    aria-label="失败后状态 / 现场说明"
                    value={fine.failure_detail || ""}
                    placeholder="如：物体掉落到夹爪下方，夹爪保持闭合"
                    rows={3}
                    onChange={(event) =>
                      update({
                        outcome: "failure",
                        failure_detail: event.target.value,
                      })
                    }
                  />
                </label>
              )}
            </div>
          </section>
        )}
        {fine.outcome !== "failure" && definition && (
          <div className="sentence-editor" aria-label="标注句编辑器">
            <div className="skill-sentence">
              {sentenceTokens(definition.name, values).map((token, index) =>
                typeof token === "string" ? (
                  <span key={index}>{token}</span>
                ) : (
                  <label key={token.key} className="sentence-field">
                    <span>
                      {token.label}
                      {token.optional ? "" : " *"}
                    </span>
                    {token.options ? (
                      <Select
                        disabled={!enabled}
                        aria-label={token.label}
                        virtual={false}
                        value={values[token.key] || undefined}
                        placeholder={token.example}
                        options={token.options.map((value) => ({ value, label: value }))}
                        onChange={(value: string) => updateValue(token.key, value)}
                      />
                    ) : (
                      <Input
                        disabled={!enabled}
                        aria-label={token.label}
                        value={sentenceFieldValue(token, values) || ""}
                        placeholder={token.example}
                        onChange={(event) => updateValue(token.key, event.target.value)}
                      />
                    )}
                  </label>
                ),
              )}
            </div>
          </div>
        )}
        {definition && fine.outcome !== "failure" && (
          <div className="skill-guidance">
            <div>
              <Typography.Text type="secondary">关键帧定义</Typography.Text>
              <p>{keyframeDefinitionText}</p>
            </div>
            <div>
              <Typography.Text type="secondary">需要标记</Typography.Text>
              <p>{requiredObjectsText}</p>
            </div>
          </div>
        )}
        {definition && fine.outcome === "failure" && (
          <div className="skill-guidance failure-keyframe-guidance">
            <div>
              <Typography.Text type="secondary">失败关键帧（选填）</Typography.Text>
              <p>{keyframeDefinitionText}</p>
            </div>
            <div>
              <Typography.Text type="secondary">需要标记</Typography.Text>
              <p>{requiredObjectsText}</p>
            </div>
          </div>
        )}
        {definition?.name === "Pick" || definition?.name === "Place" ? (
          <div>
            <Typography.Text strong>
              {fine.outcome === "failure" ? "失败关键帧（选填）" : "关键帧位置"}
            </Typography.Text>
            {fine.outcome === "failure" && (
              <Typography.Text type="secondary">
                能确认时记录失败的 HEAD 帧；无法确认时可留空
              </Typography.Text>
            )}
            {annotationHands(fine).length === 0 && (
              <Typography.Text type="secondary">请先选择操作手</Typography.Text>
            )}
            {annotationHands(fine).map((hand) => {
              const group = fine.gripper_keyframes?.[hand];
              const label = handLabel(hand);
              return (
                <div className="keyframe-point-control" key={hand}>
                  <div>
                    <Typography.Text strong>{label}</Typography.Text>
                    <Typography.Text type="secondary">
                      {group
                        ? `帧 ${group.frame} · ${group.view} · ${completeGripper(group) ? "已完成" : "未完成"}`
                        : "尚未标记"}
                    </Typography.Text>
                    {group && (
                      <Typography.Text type="secondary">
                        左夹：
                        {group.left?.visibility === "invisible"
                          ? "不可见"
                          : group.left
                            ? "已标记"
                            : "未标记"}
                        {" · "}右夹：
                        {group.right?.visibility === "invisible"
                          ? "不可见"
                          : group.right
                            ? "已标记"
                            : "未标记"}
                      </Typography.Text>
                    )}
                  </div>
                  <Button
                    icon={group ? <RotateCcw size={15} /> : <Crosshair size={15} />}
                    disabled={!enabled}
                    onClick={() =>
                      onBeginGripperMark(hand, (group) =>
                        update({
                          gripper_keyframes: { ...fine.gripper_keyframes, [hand]: group },
                        }),
                      )
                    }
                  >
                    {group ? "重新标记" : "标记"}
                    {label}
                  </Button>
                  {group && (
                    <Button size="small" onClick={() => onJumpFrame(group.frame)}>
                      跳转到此帧
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="keyframe-point-control">
            <div>
              <Typography.Text strong>关键帧位置</Typography.Text>
              <Typography.Text type="secondary">
                {fine.keyframe_point
                  ? `帧 ${fine.keyframe_point.frame} · ${fine.keyframe_point.view} · (${fine.keyframe_point.x.toFixed(3)}, ${fine.keyframe_point.y.toFixed(3)})`
                  : "尚未标记"}
              </Typography.Text>
            </div>
            <Button
              type={pointMarking ? "primary" : "default"}
              icon={fine.keyframe_point ? <RotateCcw size={15} /> : <Crosshair size={15} />}
              disabled={!enabled}
              onClick={beginPointMark}
            >
              {pointMarking ? "请点击左侧画面" : fine.keyframe_point ? "重新标记" : "标记关键点"}
            </Button>
          </div>
        )}
        {selected.retry_of && (
          <section className="retry-context" aria-label="重试信息">
            <Typography.Text strong>重试信息</Typography.Text>
            <Typography.Text type="secondary">本片段从上一段失败后的状态开始。</Typography.Text>
            <label className="sentence-field">
              <span>恢复动作 *</span>
              <Input
                disabled={!enabled}
                aria-label="恢复动作"
                value={fine.recovery_action || ""}
                placeholder="如：夹爪重新张开，右手夹爪轻微回撤"
                onChange={(event) => update({ recovery_action: event.target.value })}
              />
            </label>
            <label className="sentence-field">
              <span>目标点名称（选填）</span>
              <Input
                disabled={!enabled}
                aria-label="目标点名称"
                value={fine.target_point_label || ""}
                placeholder="如：茶叶罐盖子的凸点"
                onChange={(event) => update({ target_point_label: event.target.value })}
              />
            </label>
            <label className="sentence-field">
              <span>目标点编号（选填）</span>
              <Input
                disabled={!enabled}
                aria-label="目标点编号"
                value={fine.target_point_id || ""}
                placeholder="如：point1"
                onChange={(event) => update({ target_point_id: event.target.value })}
              />
            </label>
          </section>
        )}
        <label className="fine-label">补充说明</label>
        <Input.TextArea
          disabled={!enabled}
          value={fine.notes}
          onChange={(e) => update({ notes: e.target.value })}
          rows={3}
          placeholder="记录其他必要细节"
          maxLength={1000}
          showCount
        />
        <Space wrap style={{ marginTop: 14 }}>
          {fine.outcome === "failure" && (
            <Button
              icon={<RotateCcw size={15} />}
              disabled={!enabled || !canCreateRetry}
              onClick={onCreateRetry}
            >
              从当前帧创建重试片段
            </Button>
          )}
          <Button
            type={selected.annotation_status === "confirmed" ? "default" : "primary"}
            onClick={onConfirm}
            disabled={issues.length > 0 || !enabled}
          >
            {selected.annotation_status === "confirmed"
              ? reviewing
                ? "已确认审核修改"
                : "已确认标注结果"
              : reviewing
                ? "确认审核修改"
                : "确认标注结果"}
          </Button>
          <Button onClick={onSave} disabled={!enabled} loading={isSaving}>
            {reviewing ? "保存审核修改" : "保存草稿"}
          </Button>
          {reviewing ? (
            <>
              <Button danger loading={isSubmitting} onClick={() => setReviewModalOpen(true)}>
                退回修改
              </Button>
              <Button
                type="primary"
                disabled={!canSubmit}
                loading={isSubmitting}
                onClick={() => onReview("approve")}
              >
                审核通过
              </Button>
            </>
          ) : (
            <Button type="primary" disabled={!canSubmit} loading={isSubmitting} onClick={onSubmit}>
              提交审核
            </Button>
          )}
        </Space>
      </div>
      <Modal
        open={reviewModalOpen}
        title="填写退回原因"
        okText="确认退回"
        cancelText="取消"
        okButtonProps={{ disabled: !reviewComment.trim() }}
        onCancel={() => setReviewModalOpen(false)}
        onOk={() => {
          onReview("request_changes", reviewComment.trim());
          setReviewModalOpen(false);
        }}
      >
        <Input.TextArea
          rows={4}
          value={reviewComment}
          onChange={(event) => setReviewComment(event.target.value)}
          placeholder="请填写需要修改的具体原因"
        />
      </Modal>
    </aside>
  );
}
