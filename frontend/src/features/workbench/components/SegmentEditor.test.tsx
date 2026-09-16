import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
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
  expect(screen.getByText("双手分别记录夹爪完全打开的时刻，不标记左夹和右夹位置")).toBeVisible();
});
