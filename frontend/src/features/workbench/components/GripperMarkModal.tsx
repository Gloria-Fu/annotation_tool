import { useCallback, useRef, useState } from "react";
import { Button, Modal, Radio, Segmented, Tooltip } from "antd";
import { Crosshair, Hand, Maximize, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import type { GripperKeyframe, JawMark, OperatorHand } from "../../../shared/api/types";
import { completeGripper, handLabel } from "../model/gripperKeyframes";

type Side = "left" | "right";

function hasCoordinates(point?: JawMark): point is JawMark {
  return (
    !!point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.x <= 1 &&
    point.y >= 0 &&
    point.y <= 1
  );
}

export type GripperMarkSession = {
  image: string;
  width: number;
  height: number;
  frame: number;
  view: string;
  hand: OperatorHand;
  failure?: boolean;
  group?: GripperKeyframe;
  onConfirm: (group: GripperKeyframe) => void;
};

export function GripperMarkModal({
  session,
  onClose,
}: {
  session: GripperMarkSession;
  onClose: () => void;
}) {
  const [points, setPoints] = useState<GripperKeyframe>(() =>
    session.group?.frame === session.frame && session.group.view === session.view
      ? { ...session.group }
      : { frame: session.frame, view: session.view },
  );
  const [side, setSide] = useState<Side>("left");
  const [mode, setMode] = useState("mark");
  const [scale, setScale] = useState(1);
  const stage = useRef<HTMLDivElement>(null);
  const dragging = useRef<Side | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const viewport = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return;
      const observer = new ResizeObserver(() => {
        const fit = Math.min(
          element.clientWidth / session.width,
          element.clientHeight / session.height,
        );
        setSize((previous) => {
          const next = { width: session.width * fit, height: session.height * fit };
          return next.width === previous.width && next.height === previous.height ? previous : next;
        });
      });
      observer.observe(element);
      return () => observer.disconnect();
    },
    [session.width, session.height],
  );
  const mark = (target: Side, clientX: number, clientY: number) => {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    const x = (clientX - box.left) / box.width;
    const y = (clientY - box.top) / box.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    setPoints((previous) => ({
      ...previous,
      [target]: {
        visibility: previous[target]?.visibility || "visible",
        x,
        y,
      },
    }));
  };
  const complete = completeGripper(points);
  return (
    <Modal
      open
      title={`${session.failure ? "失败关键帧精细标记" : "关键帧精细标记"} · ${handLabel(session.hand)} · HEAD · 帧 ${session.frame}`}
      width="min(1400px, 96vw)"
      centered
      maskClosable={false}
      className="gripper-mark-modal"
      onCancel={onClose}
      footer={
        <>
          <Button aria-label="取消" onClick={onClose}>
            取消
          </Button>
          <Button
            type="primary"
            disabled={!complete}
            onClick={() => {
              session.onConfirm(points);
              onClose();
            }}
          >
            确认标记
          </Button>
        </>
      }
    >
      <TransformWrapper
        key={`${size.width}-${size.height}`}
        initialScale={1}
        minScale={1}
        maxScale={8}
        centerOnInit
        centerZoomedOut
        panning={{ disabled: mode !== "pan" }}
        doubleClick={{ disabled: true }}
        onTransform={(_, state) => setScale(state.scale)}
      >
        {({ zoomIn, zoomOut, resetTransform, centerView }) => (
          <>
            <div className="gripper-mark-toolbar">
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: "mark", icon: <Crosshair size={16} />, label: "标点" },
                  { value: "pan", icon: <Hand size={16} />, label: "平移" },
                ]}
              />
              <Segmented
                value={side}
                onChange={(value) => {
                  setSide(value === "left" ? "left" : "right");
                  setMode("mark");
                }}
                options={[
                  { value: "left", label: "左夹" },
                  { value: "right", label: "右夹" },
                ]}
              />
              <Tooltip title="缩小">
                <Button
                  aria-label="缩小画面"
                  icon={<ZoomOut size={16} />}
                  onClick={() => {
                    void zoomOut();
                  }}
                />
              </Tooltip>
              <span className="gripper-zoom-value">{Math.round(scale * 100)}%</span>
              <Tooltip title="放大">
                <Button
                  aria-label="放大画面"
                  icon={<ZoomIn size={16} />}
                  onClick={() => {
                    void zoomIn();
                  }}
                />
              </Tooltip>
              <Tooltip title="适应窗口">
                <Button
                  aria-label="适应窗口"
                  icon={<Maximize size={16} />}
                  onClick={() => {
                    void centerView(1);
                  }}
                />
              </Tooltip>
              <Tooltip title="重置视图">
                <Button
                  aria-label="重置视图"
                  icon={<RotateCcw size={16} />}
                  onClick={() => {
                    void resetTransform();
                  }}
                />
              </Tooltip>
            </div>
            <div ref={viewport} className={`gripper-mark-viewport ${mode}`}>
              <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>
                <div
                  ref={stage}
                  className="gripper-mark-stage"
                  style={size}
                  onPointerDown={(event) => {
                    if (mode !== "mark" || event.button !== 0) return;
                    mark(side, event.clientX, event.clientY);
                    if (side === "left" && !points.right) setSide("right");
                  }}
                >
                  <img src={session.image} alt="HEAD 关键帧" draggable={false} />
                  {(["left", "right"] as const).map((target) => {
                    const point = points[target];
                    return (
                      hasCoordinates(point) && (
                        <button
                          key={target}
                          type="button"
                          className={`gripper-landmark${point.visibility === "invisible" ? " estimated" : ""}`}
                          aria-label={target === "left" ? "左夹标记点" : "右夹标记点"}
                          style={{
                            left: `${point.x * 100}%`,
                            top: `${point.y * 100}%`,
                            transform: `translate(-50%, -50%) scale(${1 / scale})`,
                          }}
                          onPointerDown={(event) => {
                            if (mode !== "mark") return;
                            event.stopPropagation();
                            dragging.current = target;
                            setSide(target);
                            event.currentTarget.setPointerCapture(event.pointerId);
                          }}
                          onPointerMove={(event) => {
                            if (dragging.current === target)
                              mark(target, event.clientX, event.clientY);
                          }}
                          onPointerUp={() => {
                            dragging.current = null;
                          }}
                          onPointerCancel={() => {
                            dragging.current = null;
                          }}
                        >
                          <span>
                            {target === "left" ? "左夹" : "右夹"}
                            {point.visibility === "invisible" ? "（估计）" : ""}
                          </span>
                        </button>
                      )
                    );
                  })}
                </div>
              </TransformComponent>
            </div>
          </>
        )}
      </TransformWrapper>
      <div className="gripper-mark-status">
        {(["left", "right"] as const).map((target) => {
          const point = points[target];
          const hasPoint = hasCoordinates(point);
          return (
            <div key={target} className="gripper-jaw-status">
              <span>
                {target === "left" ? "左夹" : "右夹"}：
                {hasPoint
                  ? `(${point.x.toFixed(4)}, ${point.y.toFixed(4)}) · ${
                      point.visibility === "invisible" ? "不可见" : "可见"
                    }`
                  : "未标点"}
              </span>
              <Radio.Group
                aria-label={(target === "left" ? "左夹" : "右夹") + "可见性"}
                disabled={!hasPoint}
                value={hasPoint ? point.visibility : undefined}
                options={[
                  { label: "可见", value: "visible" },
                  { label: "不可见", value: "invisible" },
                ]}
                onChange={(event) => {
                  const visibility: JawMark["visibility"] =
                    event.target.value === "invisible" ? "invisible" : "visible";
                  setPoints((previous) => ({
                    ...previous,
                    [target]: previous[target] ? { ...previous[target], visibility } : undefined,
                  }));
                }}
              />
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
