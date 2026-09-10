import { Crosshair, RotateCcw } from "lucide-react";
import { Button, Input, Select, Space, Tag, Typography } from "antd";
import type {
  FineAnnotation,
  Segment,
  GripperKeyframe,
  OperatorHand,
} from "../../../shared/api/types";
import { annotationHands, handLabel, completeGripper } from "../model/gripperKeyframes";
import { durationSeconds, formatFrameTime } from "../model/timelineMath";
import { fineAnnotationText, templateIssues } from "../model/fineAnnotation";
import { getSkillDefinition, sentenceTokens } from "../skillDefinitions";
import { isSkillEnabled, SKILL_OPTIONS } from "../skillAvailability";

const emptyFine = (): FineAnnotation => ({
  skill: "",
  operator_hand: "",
  object_name: "",
  object_color: "",
  object_material: "",
  contact_point: "",
  position_start: "",
  position_end: "",
  hand_state: "",
  outcome: "success",
  end_condition: "",
  actions: [],
  failure_reason: "",
  recovery: "",
  notes: "",
});

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
  isSaving,
  isSubmitting,
  canSubmit,
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
  onReview: (decision: "approve" | "request_changes") => void;
  isSaving: boolean;
  isSubmitting: boolean;
  canSubmit: boolean;
}) {
  if (!selected)
    return (
      <aside className="segment-editor">
        <Typography.Text type="secondary">
          暂无标注片段，请在时间轴中创建或导入片段。
        </Typography.Text>
      </aside>
    );
  const fine = { ...emptyFine(), ...(selected.fine_annotation || {}) };
  const update = (patch: Partial<FineAnnotation>) => {
    const next = { ...fine, ...patch };
    onFineChange(next, fineAnnotationText(next, selected.text));
  };
  const definition = getSkillDefinition(fine.skill || selected.skill || "");
  const enabled = isSkillEnabled(fine.skill || selected.skill || "");
  const values: Record<string, string> = fine.template_values || {
    operator_hand: fine.operator_hand || "",
    object_name: fine.object_name,
    object_color: fine.object_color,
    object_material: fine.object_material,
    contact_point: fine.contact_point,
    position_end: fine.position_end,
  };
  const updateValue = (key: string, value: string) =>
    update({
      skill: definition?.name,
      template_version: 1,
      template_values: { ...values, [key]: value },
    });
  const beginPointMark = () => onBeginPointMark((keyframe_point) => update({ keyframe_point }));
  return (
    <aside className="segment-editor">
      <div className="editor-heading">
        <Typography.Title level={4}>精细标注</Typography.Title>
        <Tag color={reviewing ? "gold" : "blue"}>{reviewing ? "待审核" : "编辑中"}</Tag>
      </div>
      <section className="editor-result" aria-label="最终标注结果">
        <Typography.Text strong>最终标注结果</Typography.Text>
        <div className="fine-preview">{fineAnnotationText(fine, selected.text)}</div>
        {templateIssues(selected).length > 0 && (
          <Typography.Paragraph type="warning">
            待填写：{templateIssues(selected).join("、")}
          </Typography.Paragraph>
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
        {!enabled && (
          <Typography.Text type="warning">
            {fine.skill || selected.skill ? "该 Skill 暂未开放，请选择其他技能" : "请选择技能"}
          </Typography.Text>
        )}
        {definition && (
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
                        value={values[token.key] || ""}
                        placeholder={token.example}
                        onChange={(event) => updateValue(token.key, event.target.value)}
                      />
                    )}
                  </label>
                ),
              )}
            </div>
            {definition.name === "Place" && (
              <label className="sentence-field">
                <span>夹爪结束位置（选填）</span>
                <Input
                  disabled={!enabled}
                  aria-label="夹爪结束位置"
                  value={values.retreat || ""}
                  placeholder="如：托盘右上方"
                  onChange={(event) => updateValue("retreat", event.target.value)}
                />
              </label>
            )}
          </div>
        )}
        {definition && (
          <div className="skill-guidance">
            <div>
              <Typography.Text type="secondary">关键帧定义</Typography.Text>
              <p>{definition.keyframeDefinition}</p>
            </div>
            <div>
              <Typography.Text type="secondary">需要标记</Typography.Text>
              <p>{definition.requiredObjects.join("、")}</p>
            </div>
          </div>
        )}
        {definition?.name === "Pick" ? (
          <div>
            <Typography.Text strong>关键帧位置</Typography.Text>
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
          {!reviewing && (
            <Button onClick={onSave} disabled={!enabled} loading={isSaving}>
              保存草稿
            </Button>
          )}
          {reviewing ? (
            <>
              <Button danger onClick={() => onReview("request_changes")}>
                退回修改
              </Button>
              <Button type="primary" disabled={!canSubmit} onClick={() => onReview("approve")}>
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
    </aside>
  );
}
