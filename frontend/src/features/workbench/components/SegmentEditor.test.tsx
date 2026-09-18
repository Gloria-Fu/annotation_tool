import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Segment } from "../../../shared/api/types";
import { SegmentEditor } from "./SegmentEditor";

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
});

const twoHandPlace: Segment = {
  id: "place-1",
  start_frame: 0,
  end_frame: 10,
  text: "place",
  annotation_status: "in_progress",
  fine_annotation: {
    object_name: "",
    object_color: "",
    object_material: "",
    contact_point: "",
    position_start: "",
    position_end: "",
    outcome: "success",
    end_condition: "",
    actions: [],
    failure_reason: "",
    recovery: "",
    notes: "",
    skill: "Place",
    segment_validity: "valid",
    template_values: {
      operator_hand: "双手",
      object_mode: "separate_objects",
      initial_position: "托盘前方",
      initial_state_left: "闭合",
      initial_state_right: "闭合",
      left_object_name: "杯子",
      left_approach: "左侧垫片上方",
      left_orientation: "垂直",
      left_release_mode: "接触支撑面后释放",
      left_position_end: "左侧垫片中央",
      left_gripper_action: "张开",
      right_object_name: "勺子",
      right_approach: "右侧垫片上方",
      right_orientation: "平行",
      right_release_mode: "空中释放后落至目标位置",
      right_position_end: "右侧垫片中央",
      right_gripper_action: "张开",
    },
  },
};

it("shows separate Place keyframe controls for left and right hands", () => {
  render(
    <SegmentEditor
      selected={twoHandPlace}
      reviewing={false}
      fps={30}
      displayTimeScale={1 / 1.3}
      currentFrame={5}
      pointMarking={false}
      onBeginPointMark={vi.fn()}
      onBeginGripperMark={vi.fn()}
      onJumpFrame={vi.fn()}
      onFineChange={vi.fn()}
      onSave={vi.fn()}
      onSubmit={vi.fn()}
      onReview={vi.fn()}
      onConfirm={vi.fn()}
      onNavigate={vi.fn()}
      onCreateRetry={vi.fn()}
      isSaving={false}
      isSubmitting={false}
      canSubmit={false}
      canCreateRetry={false}
    />,
  );

  expect(screen.getByRole("button", { name: /记录当前帧\s*左手/ })).toBeVisible();
  expect(screen.getByRole("button", { name: /记录当前帧\s*右手/ })).toBeVisible();
  expect(screen.getByText("双手分别记录关键帧，只记录帧号，不标记夹爪位置")).toBeVisible();
});

it("hides submit actions in read-only quality sampling review", () => {
  render(
    <SegmentEditor
      selected={{ ...twoHandPlace, annotation_status: "confirmed" }}
      reviewing={false}
      fps={30}
      displayTimeScale={1 / 1.3}
      currentFrame={5}
      pointMarking={false}
      onBeginPointMark={vi.fn()}
      onBeginGripperMark={vi.fn()}
      onJumpFrame={vi.fn()}
      onFineChange={vi.fn()}
      onSave={vi.fn()}
      onSubmit={vi.fn()}
      onReview={vi.fn()}
      onConfirm={vi.fn()}
      onNavigate={vi.fn()}
      onCreateRetry={vi.fn()}
      isSaving={false}
      isSubmitting={false}
      canSubmit
      canCreateRetry={false}
      readOnly
    />,
  );

  expect(screen.getByText("只读查看")).toBeVisible();
  expect(screen.queryByRole("button", { name: "提交审核" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "保存草稿" })).not.toBeInTheDocument();
});

it("shows quality check actions for read-only quality workbench entries", () => {
  render(
    <SegmentEditor
      selected={{ ...twoHandPlace, annotation_status: "confirmed" }}
      reviewing={false}
      fps={30}
      displayTimeScale={1 / 1.3}
      currentFrame={5}
      pointMarking={false}
      onBeginPointMark={vi.fn()}
      onBeginGripperMark={vi.fn()}
      onJumpFrame={vi.fn()}
      onFineChange={vi.fn()}
      onSave={vi.fn()}
      onSubmit={vi.fn()}
      onReview={vi.fn()}
      qualityCheck={{
        canCheck: true,
        loading: false,
        onPass: vi.fn(),
        onReject: vi.fn(),
        onNext: vi.fn(),
      }}
      onConfirm={vi.fn()}
      onNavigate={vi.fn()}
      onCreateRetry={vi.fn()}
      isSaving={false}
      isSubmitting={false}
      canSubmit={false}
      canCreateRetry={false}
      readOnly
    />,
  );

  expect(screen.getByRole("button", { name: "抽检通过" })).toBeVisible();
  expect(screen.getByRole("button", { name: "抽检退回" })).toBeVisible();
  expect(screen.getByRole("button", { name: "下一条" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "提交审核" })).not.toBeInTheDocument();
});
