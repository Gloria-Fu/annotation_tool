import { Button, Select, Typography } from "antd";
import {
  Eraser,
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
}) {
  return (
    <div className="annotation-toolbar">
      <Button icon={<Scissors size={15} />} onClick={onSplit}>
        分段
      </Button>
      <Button icon={<Eraser size={15} />} onClick={onClear} title="一键清空当前任务的全部标注">
        清空全部标注
      </Button>
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
      <Button icon={<RotateCcw size={15} />} onClick={() => onZoomChange(1)} title="重置时间轴缩放" />
      <Select
        value={rate}
        onChange={onRateChange}
        options={[0.5, 1, 1.5, 2, 3].map((value) => ({ value, label: `${value}x` }))}
        style={{ width: 88 }}
      />
      <Button icon={<Undo2 size={15} />} disabled={!canUndo} onClick={onUndo} title="撤销" />
      <Button icon={<Redo2 size={15} />} disabled={!canRedo} onClick={onRedo} title="重做" />
      <Typography.Text type="secondary">
        {formatFrameTime(currentFrame, fps)} / {formatFrameTime(length, fps)}
      </Typography.Text>
    </div>
  );
}
