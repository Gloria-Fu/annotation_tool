import { Button, Input, Space, Tag, Typography } from "antd";
import type { Segment } from "../../../shared/api/types";
import { durationSeconds, formatFrameTime } from "../model/timelineMath";

export function SegmentEditor({
  selected,
  reviewing,
  fps,
  onTextChange,
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
  onTextChange: (text: string) => void;
  onSave: () => void;
  onSubmit: () => void;
  onReview: (decision: "approve" | "request_changes") => void;
  isSaving: boolean;
  isSubmitting: boolean;
  canSubmit: boolean;
}) {
  return (
    <aside className="segment-editor">
      <div className="editor-heading">
        <Typography.Title level={4}>当前标注段</Typography.Title>
        <Tag color={reviewing ? "gold" : "blue"}>{reviewing ? "待审核" : "编辑中"}</Tag>
      </div>
      {selected ? (
        <>
          <div className="segment-meta">
            {formatFrameTime(selected.start_frame, fps)} - {formatFrameTime(selected.end_frame, fps)}
            {" · "}时长 {durationSeconds(selected.start_frame, selected.end_frame, fps).toFixed(2)} 秒
          </div>
          <Input.TextArea
            value={selected.text}
            onChange={(event) => onTextChange(event.target.value)}
            rows={10}
            placeholder="填写这一段视频的动作描述"
            maxLength={2000}
            showCount
          />
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
                <Button
                  type="primary"
                  disabled={!canSubmit}
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
        </>
      ) : (
        <Typography.Text type="secondary">
          暂无标注片段，请在时间轴中创建或导入片段。
        </Typography.Text>
      )}
    </aside>
  );
}
