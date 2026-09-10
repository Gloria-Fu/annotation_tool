import { Crosshair, RotateCcw } from "lucide-react";
import { Button, Input, Select, Space, Tag, Typography } from "antd";
import type { FineAnnotation, Segment } from "../../../shared/api/types";
import { durationSeconds, formatFrameTime } from "../model/timelineMath";
import { getSkillDefinition, SKILL_OPTIONS } from "../skillDefinitions";

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

function toText(fine: FineAnnotation, fallback: string) {
  const details = [
    fine.operator_hand && `操作手：${fine.operator_hand}`,
    fine.object_name && `操作物体：${fine.object_name}`,
    fine.object_color && `颜色：${fine.object_color}`,
    fine.object_material && `材质：${fine.object_material}`,
    fine.contact_point && `接触点：${fine.contact_point}`,
    fine.position_start && `起始位置：${fine.position_start}`,
    fine.position_end && `结束位置：${fine.position_end}`,
    fine.hand_state && `手的状态：${fine.hand_state}`,
  ]
    .filter(Boolean)
    .join("，");
  return [details, fine.notes].filter(Boolean).join(" ") || fallback;
}

export function SegmentEditor({
  selected,
  reviewing,
  fps,
  pointMarking,
  onBeginPointMark,
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
    onFineChange(next, toText(next, selected.text));
  };
  const definition = getSkillDefinition(fine.skill || "");
  const beginPointMark = () => onBeginPointMark((keyframe_point) => update({ keyframe_point }));
  return (
    <aside className="segment-editor">
      <div className="editor-heading">
        <Typography.Title level={4}>精细标注</Typography.Title>
        <Tag color={reviewing ? "gold" : "blue"}>{reviewing ? "待审核" : "编辑中"}</Tag>
      </div>
      <div className="segment-meta">
        {formatFrameTime(selected.start_frame, fps)} - {formatFrameTime(selected.end_frame, fps)} ·
        时长 {durationSeconds(selected.start_frame, selected.end_frame, fps).toFixed(2)} 秒
      </div>
      <div className="original-annotation">
        <Typography.Text type="secondary">原标注句</Typography.Text>
        <div>{(selected.original_text ?? selected.text) || "暂无原标注句"}</div>
      </div>
      <div className="fine-section">
        <Typography.Text strong>Skill</Typography.Text>
        <Select
          value={fine.skill || undefined}
          onChange={(skill) => update({ skill })}
          placeholder="请选择 skill"
          options={SKILL_OPTIONS}
        />
      </div>
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
          onClick={beginPointMark}
        >
          {pointMarking ? "请点击左侧画面" : fine.keyframe_point ? "重新标记" : "标记关键点"}
        </Button>
      </div>
      <section className="fine-form-section">
        <Typography.Text strong>1. 操作手</Typography.Text>
        <Select
          value={fine.operator_hand || undefined}
          onChange={(operator_hand) => update({ operator_hand })}
          placeholder="请选择操作手"
          options={["左手", "右手", "双手"].map((value) => ({ value, label: value }))}
        />
      </section>
      <section className="fine-form-section">
        <Typography.Text strong>2. 操作的物体</Typography.Text>
        <div className="fine-fields">
          <Input
            addonBefore="物体名称"
            value={fine.object_name}
            onChange={(e) => update({ object_name: e.target.value })}
          />
          <Input
            addonBefore="物体颜色"
            value={fine.object_color}
            onChange={(e) => update({ object_color: e.target.value })}
          />
          <Input
            addonBefore="物体材质"
            value={fine.object_material}
            onChange={(e) => update({ object_material: e.target.value })}
          />
          <Input
            addonBefore="接触点"
            value={fine.contact_point}
            onChange={(e) => update({ contact_point: e.target.value })}
          />
        </div>
      </section>
      <section className="fine-form-section">
        <Typography.Text strong>3. 物体的相对位置</Typography.Text>
        <div className="fine-fields fine-position-fields">
          <Input
            addonBefore="片段开始"
            value={fine.position_start}
            onChange={(e) => update({ position_start: e.target.value })}
          />
          <Input
            addonBefore="片段结束"
            value={fine.position_end}
            onChange={(e) => update({ position_end: e.target.value })}
          />
        </div>
      </section>
      <section className="fine-form-section">
        <Typography.Text strong>4. 手的状态</Typography.Text>
        <Select
          value={fine.hand_state || undefined}
          onChange={(hand_state) => update({ hand_state })}
          placeholder="请选择手的状态"
          options={["张开->闭合", "闭合->张开", "保持闭合", "保持张开"].map((value) => ({
            value,
            label: value,
          }))}
        />
      </section>
      <label className="fine-label">补充说明</label>
      <Input.TextArea
        value={fine.notes}
        onChange={(e) => update({ notes: e.target.value })}
        rows={3}
        placeholder="记录其他必要细节"
        maxLength={1000}
        showCount
      />
      <div className="fine-preview">
        <Typography.Text type="secondary">文本预览</Typography.Text>
        <div>{toText(fine, selected.text)}</div>
      </div>
      <Space wrap style={{ marginTop: 14 }}>
        {!reviewing && (
          <Button onClick={onSave} loading={isSaving}>
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
    </aside>
  );
}
