import { Button, Dropdown, Select, Typography } from "antd";
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  Merge,
  RotateCcw,
  Scissors,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { formatFrameTime } from "../model/timelineMath";

export function WorkbenchToolbar({
  currentFrame,
  length,
  fps,
  zoom,
  rate,
  canUndo,
  canRedo,
  onSplit,
  onClear,
  onZoomChange,
  onRateChange,
  onUndo,
  onRedo,
  onSeek,
  onPreviousSegment,
  onNextSegment,
  onMerge,
  canMergePrevious,
  canMergeNext,
  readOnly,
}: {
  currentFrame: number;
  length: number;
  fps: number;
  zoom: number;
  rate: number;
  canUndo: boolean;
  canRedo: boolean;
  onSplit: () => void;
  onClear: () => void;
  onZoomChange: (zoom: number) => void;
  onRateChange: (rate: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSeek: (frame: number) => void;
  onPreviousSegment: () => void;
  onNextSegment: () => void;
  onMerge: (direction: "previous" | "next") => void;
  canMergePrevious: boolean;
  canMergeNext: boolean;
  readOnly?: boolean;
}) {
  return (
    <div className="annotation-toolbar">
      {!readOnly && (
        <>
          <Button icon={<Scissors size={15} />} onClick={onSplit}>
            分段
          </Button>
          <Button icon={<Eraser size={15} />} onClick={onClear} title="一键清空当前任务的全部标注">
            清空全部标注
          </Button>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [
                {
                  key: "previous",
                  label: "与上一段合并",
                  disabled: !canMergePrevious,
                  icon: <ChevronLeft size={15} />,
                },
                {
                  key: "next",
                  label: "与下一段合并",
                  disabled: !canMergeNext,
                  icon: <ChevronRight size={15} />,
                },
              ],
              onClick: ({ key }) => {
                if (key === "previous" || key === "next") onMerge(key);
              },
            }}
          >
            <Button icon={<Merge size={15} />} disabled={!canMergePrevious && !canMergeNext}>
              合并片段
            </Button>
          </Dropdown>
        </>
      )}
      <Button
        icon={<ZoomOut size={15} />}
        onClick={() => onZoomChange(Math.max(0.5, zoom - 0.25))}
        title="缩小时间轴"
      />
      <Button
        icon={<ZoomIn size={15} />}
        onClick={() => onZoomChange(Math.min(3, zoom + 0.25))}
        title="放大时间轴"
      />
      <Button
        icon={<RotateCcw size={15} />}
        onClick={() => onZoomChange(1)}
        title="重置时间轴缩放"
      />
      <Select
        value={rate}
        onChange={onRateChange}
        options={[0.5, 1, 1.5, 2, 3].map((value) => ({ value, label: `${value}x` }))}
        style={{ width: 88 }}
      />
      <Button
        size="small"
        icon={<ChevronLeft size={15} />}
        onClick={onPreviousSegment}
        title="上一段"
      />
      <Button
        size="small"
        icon={<ChevronRight size={15} />}
        onClick={onNextSegment}
        title="下一段"
      />
      <div className="frame-nudge-controls" role="group" aria-label="微调视频时间轴">
        <Button size="small" onClick={() => onSeek(currentFrame - 1)} title="后退 1 帧">
          -1 帧
        </Button>
        <Button size="small" onClick={() => onSeek(currentFrame + 1)} title="前进 1 帧">
          +1 帧
        </Button>
        <Button
          size="small"
          onClick={() => onSeek(currentFrame - Math.round(fps))}
          title="后退 1 秒"
        >
          -1s
        </Button>
        <Button
          size="small"
          onClick={() => onSeek(currentFrame + Math.round(fps))}
          title="前进 1 秒"
        >
          +1s
        </Button>
      </div>
      <Button icon={<Undo2 size={15} />} disabled={!canUndo} onClick={onUndo} title="撤销" />
      <Button icon={<Redo2 size={15} />} disabled={!canRedo} onClick={onRedo} title="重做" />
      <Typography.Text type="secondary">
        {formatFrameTime(currentFrame, fps)} / {formatFrameTime(length, fps)}
      </Typography.Text>
    </div>
  );
}
