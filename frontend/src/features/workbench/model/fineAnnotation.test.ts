import { describe, expect, it, vi } from "vitest";
import type { FineAnnotation } from "../../../shared/api/types";
import {
  currentFineAnnotation,
  fineAnnotationPreview,
  fineAnnotationText,
  templateIssues,
} from "./fineAnnotation";
import {
  SKILL_DEFINITIONS,
  sentenceFieldValue,
  sentenceTokens,
  sentenceTokensForOutput,
} from "../skillDefinitions";

vi.mock("../enabledSkills", () => ({
  ENABLED_SKILLS: ["Pick", "Place", "Grasp", "Push", "Pull"],
}));

const annotation: FineAnnotation = {
  skill: "Pick",
  operator_hand: "左手",
  object_name: "黄瓜",
  object_color: "绿色",
  object_material: "圆柱形水果",
  contact_point: "两侧",
  position_start: "货架的右边",
  position_end: "机械臂上",
  hand_state: "张开->闭合",
  outcome: "success",
  end_condition: "",
  actions: [],
  failure_reason: "",
  recovery: "",
  notes: "",
};

describe("fineAnnotationText", () => {
  it("shows current skill placeholders instead of legacy fields or imported text", () => {
    const segment = {
      id: "imported",
      start_frame: 0,
      end_frame: 10,
      text: "Retrieve cucumber from the shelf.",
      skill: "Pick",
    };
    const fine = currentFineAnnotation(segment);
    const values = fine.template_values ?? {};
    expect(values.initial_state).toBe("张开");
    expect(values.gripper_action).toBe("闭合");
    expect(fineAnnotationText(fine)).toContain("【操作手】夹爪初始位于【夹爪初始位置】");
    expect(fineAnnotationText(fine)).not.toContain(segment.text);
    expect(fineAnnotationText(annotation)).not.toContain("黄瓜");
    expect(templateIssues(segment)).toContain("操作手");
    expect(segment.text).toBe("Retrieve cucumber from the shelf.");
  });

  it("asks for a skill when there is no template", () => {
    expect(
      fineAnnotationText({
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
      }),
    ).toBe("【请选择技能】");
  });

  it("updates placeholders from current values and rejects invalid options", () => {
    const fine = {
      ...annotation,
      template_version: 1 as const,
      template_values: { operator_hand: "左手", object_name: "杯子", initial_state: "旧状态" },
    };
    const text = fineAnnotationText(fine);
    expect(text).toContain("左手夹爪");
    expect(text).toContain("杯子");
    expect(text).not.toContain("【物体名称】");
    expect(text).toContain("【初始夹爪状态】");
    expect(text).not.toContain("旧状态");
  });

  it("defaults Pick and Place gripper states without replacing existing values", () => {
    expect(
      currentFineAnnotation({
        id: "pick",
        start_frame: 0,
        end_frame: 10,
        text: "",
        skill: "Pick",
      }).template_values,
    ).toMatchObject({
      initial_state: "张开",
      gripper_action: "闭合",
      initial_state_left: "张开",
      initial_state_right: "张开",
      gripper_action_left: "闭合",
      gripper_action_right: "闭合",
      left_gripper_action: "闭合",
      right_gripper_action: "闭合",
    });
    expect(
      currentFineAnnotation({
        id: "pick-hand",
        start_frame: 0,
        end_frame: 10,
        text: "",
        skill: "Pick",
        fine_annotation: {
          ...annotation,
          template_values: { operator_hand: "左手" },
        },
      }).template_values,
    ).toMatchObject({
      operator_hand: "左手",
      lift_gripper: "左手夹爪",
    });
    expect(
      currentFineAnnotation({
        id: "place",
        start_frame: 0,
        end_frame: 10,
        text: "",
        skill: "Place",
        fine_annotation: {
          ...annotation,
          skill: "Place",
          template_values: { initial_state: "无法判断" },
        },
      }).template_values,
    ).toMatchObject({
      initial_state: "无法判断",
      gripper_action: "张开",
      initial_state_left: "闭合",
      initial_state_right: "闭合",
      gripper_action_left: "张开",
      gripper_action_right: "张开",
      left_gripper_action: "张开",
      right_gripper_action: "张开",
    });
    expect(
      currentFineAnnotation({
        id: "place-hand",
        start_frame: 0,
        end_frame: 10,
        text: "",
        skill: "Place",
        fine_annotation: {
          ...annotation,
          skill: "Place",
          template_values: { operator_hand: "双手" },
        },
      }).template_values,
    ).toMatchObject({
      operator_hand: "双手",
      lift_gripper: "双手夹爪",
    });
  });
});

describe("fineAnnotationPreview", () => {
  it("keeps filled and missing template fields visibly marked", () => {
    const parts = fineAnnotationPreview({
      ...annotation,
      template_values: {
        operator_hand: "左手",
        initial_position: "货架前侧",
        object_name: "杯子",
      },
    });
    expect(parts).toContainEqual({ text: "【左手】", kind: "filled" });
    expect(parts).toContainEqual({ text: "【货架前侧】", kind: "filled" });
    expect(parts).toContainEqual({ text: "【杯子】", kind: "filled" });
    expect(parts).toContainEqual({ text: "【张开】", kind: "filled" });
    expect(parts).toContainEqual({ text: "【闭合】", kind: "filled" });
    expect(parts).not.toContainEqual({ text: "【初始夹爪状态】", kind: "missing" });
    expect(parts.some((part) => part.kind === "filled")).toBe(true);
    expect(parts.some((part) => part.kind === "missing")).toBe(true);
  });

  it("marks a missing skill as an unfilled field", () => {
    expect(
      fineAnnotationPreview({
        ...annotation,
        skill: "",
      }),
    ).toEqual([{ text: "【请选择技能】", kind: "missing" }]);
  });
});

describe("segment validity", () => {
  it("keeps legacy annotations valid and leaves new user segments pending", () => {
    const legacy = currentFineAnnotation({
      id: "legacy",
      start_frame: 0,
      end_frame: 10,
      text: "历史标注",
      skill: "Pick",
      fine_annotation: { ...annotation },
    });
    expect(legacy.segment_validity).toBe("valid");

    const blank = currentFineAnnotation({
      id: "blank",
      start_frame: 0,
      end_frame: 10,
      text: "",
      source: "user",
    });
    expect(blank.segment_validity).toBe("pending");
  });

  it("allows an invalid segment without a skill or keyframe", () => {
    const fine: FineAnnotation = {
      ...annotation,
      skill: "",
      outcome: "pending",
      segment_validity: "invalid",
      invalid_reason_code: "no_motion",
    };
    const segment = {
      id: "invalid",
      start_frame: 0,
      end_frame: 10,
      text: fineAnnotationText(fine),
      source: "user",
      fine_annotation: fine,
    };
    expect(fineAnnotationText(fine)).toBe("本片段无效，原因是静止无动作。");
    expect(templateIssues(segment)).toEqual([]);
    expect(fineAnnotationPreview(fine)).toContainEqual({
      text: "【静止无动作】",
      kind: "filled",
    });
  });

  it("requires a reason detail for an invalid segment marked as other", () => {
    const fine: FineAnnotation = {
      ...annotation,
      skill: "",
      outcome: "pending",
      segment_validity: "invalid",
      invalid_reason_code: "other",
    };
    const segment = {
      id: "invalid-other",
      start_frame: 0,
      end_frame: 10,
      text: fineAnnotationText(fine),
      source: "user",
      fine_annotation: fine,
    };
    expect(templateIssues(segment)).toEqual(["无效原因说明"]);
    expect(fineAnnotationPreview(fine)).toContainEqual({
      text: "【无效原因说明】",
      kind: "missing",
    });
    expect(
      templateIssues({
        ...segment,
        fine_annotation: { ...fine, invalid_reason_detail: "镜头全程被遮挡" },
      }),
    ).toEqual([]);
  });
});

it("only exposes the five supported skills with distinct outcomes", () => {
  expect(SKILL_DEFINITIONS.map((skill) => skill.name)).toEqual([
    "Pick",
    "Place",
    "Grasp",
    "Push",
    "Pull",
  ]);
  for (const skill of SKILL_DEFINITIONS) {
    const values: Record<string, string> = {};
    for (const token of skill.tokens) {
      if (typeof token !== "string") {
        expect(token.key).not.toBe("reference");
        values[token.key] = token.options?.[0] || token.example;
      }
    }
    const fine: FineAnnotation = {
      ...annotation,
      skill: skill.name,
      template_version: 1,
      template_values: values,
      keyframe_point: { frame: 5, view: "head", x: 0.5, y: 0.5 },
      keyframe_points: {
        left: { frame: 5, view: "head", x: 0.3, y: 0.5 },
        right: { frame: 5, view: "head", x: 0.7, y: 0.5 },
      },
      gripper_keyframes: {
        left: {
          frame: 5,
          view: "head",
          left: { visibility: "visible", x: 0.3, y: 0.5 },
          right: { visibility: "visible", x: 0.7, y: 0.5 },
        },
      },
    };
    const segment = {
      id: "one",
      start_frame: 0,
      end_frame: 10,
      text: fineAnnotationText(fine),
      fine_annotation: fine,
    };
    expect(templateIssues(segment)).toEqual([]);
    expect(segment.text).not.toContain("【");
    expect(templateIssues({ ...segment, end_frame: 5 })).toContain(
      skill.name === "Pick"
        ? "左手片段内 HEAD 关键帧"
        : skill.name === "Place"
          ? "片段内关键帧帧号"
          : "片段内关键帧位置",
    );
    delete values.orientation;
    expect(templateIssues(segment)).toContain("相对姿态");
  }
});

it("defines the Place keyframe as the moment the gripper fully opens", () => {
  const place = SKILL_DEFINITIONS.find((skill) => skill.name === "Place");
  expect(place?.keyframeDefinition).toBe(
    "夹爪完全张开的时刻；若边张开边移动，取移动前张开最大的帧。",
  );
  expect(place?.requiredObjects).toEqual(["只标关键帧；双手时分别标左右手，不标夹爪位置"]);
});

it("requires Pick and Place tail action from two explicit options", () => {
  for (const skill of ["Pick", "Place"]) {
    const tailAction = sentenceTokens(skill, {}).find(
      (token) => typeof token !== "string" && token.key === "lift_action",
    );
    expect(tailAction).toMatchObject({
      label: "收尾动作和状态",
      options: ["向上抬起", "无动作", "其他"],
      optional: undefined,
    });
  }
});

it("shows and uses a free-text tail action when Pick or Place selects other", () => {
  for (const skill of ["Pick", "Place"]) {
    const tokens = sentenceTokens(skill, { lift_action: "其他" });
    expect(tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "lift_action_other",
          label: "其他收尾动作和状态",
        }),
      ]),
    );
    const missingText = fineAnnotationText({
      ...annotation,
      skill,
      template_values: {
        lift_action: "其他",
      },
    });
    expect(missingText).toContain("【其他收尾动作和状态】");
    expect(
      templateIssues({
        id: "custom-tail",
        start_frame: 0,
        end_frame: 10,
        text: "",
        fine_annotation: {
          ...annotation,
          skill,
          template_values: {
            lift_action: "其他",
          },
        },
      }),
    ).toContain("其他收尾动作和状态");

    const customText = fineAnnotationText({
      ...annotation,
      skill,
      template_values: {
        lift_action: "其他",
        lift_action_other: "向前移开夹爪",
      },
    });
    expect(customText).toContain("向前移开夹爪。");
    expect(customText).not.toContain("其他向前移开夹爪");
  }
});

it("validates Place with only a keyframe frame and ignores jaw positions", () => {
  const values = {
    operator_hand: "右手",
    initial_position: "托盘前侧",
    initial_state: "闭合",
    object_name: "杯子",
    approach: "托盘上方",
    orientation: "垂直",
    release_mode: "接触支撑面后释放",
    gripper_action: "张开",
    position_end: "托盘中央",
    lift_action: "无动作",
  };
  const fine: FineAnnotation = {
    ...annotation,
    skill: "Place",
    template_values: values,
    keyframe_frame: 5,
  };
  const segment = {
    id: "place-frame",
    start_frame: 0,
    end_frame: 10,
    text: fineAnnotationText(fine),
    fine_annotation: fine,
  };
  expect(templateIssues(segment)).toEqual([]);
  expect(
    templateIssues({
      ...segment,
      fine_annotation: {
        ...fine,
        template_values: { ...values, release_mode: "" },
      },
    }),
  ).toContain("释放方式");
  expect(
    templateIssues({
      ...segment,
      fine_annotation: { ...fine, keyframe_frame: undefined },
    }),
  ).toContain("片段内关键帧帧号");
  expect(
    templateIssues({
      ...segment,
      fine_annotation: {
        ...fine,
        keyframe_frame: undefined,
        gripper_keyframes: {
          right: {
            frame: 5,
            view: "head",
            left: { visibility: "visible", x: 0.2, y: 0.4 },
            right: { visibility: "visible", x: 0.3, y: 0.4 },
          },
        },
      },
    }),
  ).toEqual([]);
});

it("requires separate hand states and excludes hidden skill fields from text", () => {
  const tokens = sentenceTokens("Grasp", { operator_hand: "双手" });
  const keys = tokens.flatMap((token) => (typeof token === "string" ? [] : [token.key]));
  expect(keys).toContain("initial_state_left");
  expect(keys).toContain("gripper_action_right");
  expect(keys).not.toContain("position_end");
  expect(
    fineAnnotationText({
      ...annotation,
      skill: "Grasp",
      template_version: 1,
      template_values: { position_end: "不应出现的终点" },
    }),
  ).not.toContain("不应出现的终点");
});

it("ends Pick at holding and ignores obsolete movement fields", () => {
  const keys = sentenceTokens("Pick", {}).flatMap((token) =>
    typeof token === "string" ? [] : [token.key],
  );
  for (const key of ["approach", "support", "position_end"]) expect(keys).not.toContain(key);
  const text = fineAnnotationText({
    ...annotation,
    template_version: 1,
    template_values: {
      approach: "旧靠近位置",
      reference: "旧姿态参考",
      support: "旧支撑面",
      position_end: "旧终点",
    },
  });
  expect(text).toMatch(/夹持住【夹持物体】的【接触部位】。【收尾动作和状态】。$/);
  expect(text).not.toContain("旧");
});

it("auto-fills repeated Pick object fields and allows overrides", () => {
  const values = {
    object_name: "茶叶罐",
    pick_relative_object: "",
    pick_grasped_object: "",
    orientation: "垂直",
    gripper_action: "闭合",
    contact_point: "两侧",
  };
  const repeated = sentenceTokens("Pick", values).filter(
    (token) =>
      typeof token !== "string" &&
      ["pick_relative_object", "pick_grasped_object"].includes(token.key),
  );
  expect(repeated).toHaveLength(2);
  expect(
    repeated.map((token) => (typeof token === "string" ? "" : sentenceFieldValue(token, values))),
  ).toEqual(["茶叶罐", "茶叶罐"]);
  expect(fineAnnotationText({ ...annotation, template_values: values })).toContain(
    "夹爪以相对茶叶罐垂直的姿态，闭合夹爪，夹持住茶叶罐的两侧。",
  );

  const overridden = {
    ...values,
    pick_relative_object: "茶叶罐盖",
    pick_grasped_object: "罐盖",
  };
  expect(fineAnnotationText({ ...annotation, template_values: overridden })).toContain(
    "夹爪以相对茶叶罐盖垂直的姿态，闭合夹爪，夹持住罐盖的两侧。",
  );
});

it("keeps two-hand Pick compatible with the same-object template by default", () => {
  const keys = sentenceTokens("Pick", { operator_hand: "双手" }).flatMap((token) =>
    typeof token === "string" ? [] : [token.key],
  );
  expect(keys).toContain("object_name");
  expect(keys).toContain("initial_state_left");
  expect(keys).toContain("gripper_action_right");
  expect(keys).not.toContain("left_object_name");
  expect(keys).not.toContain("right_object_name");
});

it("supports separate left and right objects in two-hand Pick", () => {
  const values = {
    operator_hand: "双手",
    object_mode: "separate_objects",
    initial_position: "桌面前方",
    initial_state_left: "张开",
    initial_state_right: "张开",
    left_object_location: "左侧托盘",
    left_object_name: "杯子",
    left_orientation: "垂直",
    left_gripper_action: "闭合",
    left_contact_point: "两侧",
    right_object_location: "右侧托盘",
    right_object_name: "勺子",
    right_orientation: "平行",
    right_gripper_action: "闭合",
    right_contact_point: "柄部",
  };
  const keys = sentenceTokens("Pick", values).flatMap((token) =>
    typeof token === "string" ? [] : [token.key],
  );
  expect(keys).toContain("left_object_name");
  expect(keys).toContain("right_object_name");
  expect(keys).not.toContain("object_name");
  expect(fineAnnotationText({ ...annotation, template_values: values })).toContain(
    "左手靠近位于左侧托盘的杯子，夹爪以相对杯子垂直的姿态，闭合夹爪，夹持住杯子的两侧；右手靠近位于右侧托盘的勺子",
  );
  expect(fineAnnotationText({ ...annotation, template_values: values })).toContain(
    "夹持住勺子的柄部。",
  );
  expect(
    templateIssues({
      id: "separate-pick",
      start_frame: 0,
      end_frame: 10,
      text: "",
      fine_annotation: {
        ...annotation,
        template_values: values,
        gripper_keyframes: {
          left: {
            frame: 5,
            view: "head",
            left: { visibility: "visible", x: 0.3, y: 0.5 },
            right: { visibility: "visible", x: 0.4, y: 0.5 },
          },
          right: {
            frame: 5,
            view: "head",
            left: { visibility: "visible", x: 0.6, y: 0.5 },
            right: { visibility: "visible", x: 0.7, y: 0.5 },
          },
        },
      },
    }),
  ).toEqual([]);
});

it("supports separate left and right objects in two-hand Place", () => {
  const values = {
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
  };
  const fine: FineAnnotation = {
    ...annotation,
    skill: "Place",
    template_values: values,
  };
  expect(fineAnnotationText(fine)).toContain(
    "左手持握杯子，夹爪以垂直的姿态，将物体移动至左侧垫片上方，释放方式为接触支撑面后释放，张开夹爪，物体最终位于左侧垫片中央；右手持握勺子",
  );
  expect(fineAnnotationText(fine)).toContain(
    "释放方式为空中释放后落至目标位置，张开夹爪，物体最终位于右侧垫片中央。",
  );
  expect(
    templateIssues({
      id: "separate-place",
      start_frame: 0,
      end_frame: 10,
      text: "",
      fine_annotation: {
        ...fine,
        template_values: { ...values, right_object_name: "" },
      },
    }),
  ).toContain("右手对象名称");
});

it("requires separate left and right keyframe frames for two-hand Place", () => {
  const values = {
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
  };
  const issues = (fine: Partial<FineAnnotation>) =>
    templateIssues({
      id: "two-hand-place-keyframes",
      start_frame: 0,
      end_frame: 10,
      text: "",
      fine_annotation: {
        ...annotation,
        skill: "Place",
        template_values: values,
        ...fine,
      },
    });

  expect(issues({ keyframe_frame: 5 })).toEqual(["左手片段内关键帧帧号", "右手片段内关键帧帧号"]);
  expect(
    issues({
      gripper_keyframes: {
        left: { frame: 5, view: "head" },
      },
    }),
  ).toContain("右手片段内关键帧帧号");
  expect(
    issues({
      gripper_keyframes: {
        left: { frame: 5, view: "head" },
        right: { frame: 6, view: "head" },
      },
    }),
  ).toEqual([]);
});

it("requires Pick tail action and omits the tail sentence when no action is selected", () => {
  const values = {
    object_name: "茶叶罐",
    orientation: "垂直",
    gripper_action: "闭合",
    contact_point: "两侧",
  };
  const baseText = fineAnnotationText({ ...annotation, template_values: values });
  expect(baseText).toContain("夹持住茶叶罐的两侧。");
  expect(baseText).toContain("【收尾动作和状态】");
  expect(baseText).not.toContain("移动至");
  expect(
    templateIssues({
      id: "pick",
      start_frame: 0,
      end_frame: 10,
      text: baseText,
      fine_annotation: { ...annotation, template_values: values },
    }),
  ).toContain("收尾动作和状态");

  expect(
    fineAnnotationText({ ...annotation, template_values: { ...values, lift_action: "无动作" } }),
  ).toContain("夹持住茶叶罐的两侧。");
  expect(
    fineAnnotationText({ ...annotation, template_values: { ...values, lift_action: "无动作" } }),
  ).not.toContain("无动作");
  expect(
    templateIssues({
      id: "pick",
      start_frame: 0,
      end_frame: 10,
      text: baseText,
      fine_annotation: {
        ...annotation,
        template_values: { ...values, lift_action: "无动作" },
      },
    }),
  ).not.toContain("收尾动作和状态");

  expect(
    fineAnnotationText({ ...annotation, template_values: { ...values, lift_action: "向上抬起" } }),
  ).toContain("夹持住茶叶罐的两侧。向上抬起。");
  expect(
    fineAnnotationText({ ...annotation, template_values: { ...values, lift_action: "向上抬起" } }),
  ).not.toContain("移动至");

  const withLift = {
    ...values,
    lift_action: "向上抬起",
    lift_gripper: "右手夹爪",
    lift_destination: "操作台上方",
  };
  expect(fineAnnotationText({ ...annotation, template_values: withLift })).toContain(
    "夹持住茶叶罐的两侧。右手夹爪向上抬起。",
  );
  expect(sentenceTokensForOutput("Pick", withLift).some((token) => token === "，移动至")).toBe(
    false,
  );
});

it("requires Place tail action and omits the tail sentence when no action is selected", () => {
  const values = {
    operator_hand: "右手",
    initial_position: "托盘前侧",
    initial_state: "闭合",
    object_name: "杯子",
    approach: "托盘上方",
    orientation: "垂直",
    release_mode: "接触支撑面后释放",
    position_end: "托盘中央",
    gripper_action: "张开",
  };
  const fine: FineAnnotation = {
    ...annotation,
    skill: "Place",
    template_values: values,
  };
  const baseText = fineAnnotationText(fine);
  expect(baseText).toContain(
    "将物体移动至托盘上方，释放方式为接触支撑面后释放，张开夹爪，物体最终位于托盘中央。",
  );
  expect(baseText).toContain("【收尾动作和状态】");
  expect(
    templateIssues({
      id: "place",
      start_frame: 0,
      end_frame: 10,
      text: baseText,
      fine_annotation: fine,
    }),
  ).toContain("收尾动作和状态");

  expect(
    fineAnnotationText({
      ...fine,
      template_values: { ...values, lift_action: "无动作" },
    }),
  ).toContain("将物体移动至托盘上方，释放方式为接触支撑面后释放，张开夹爪，物体最终位于托盘中央。");
  expect(
    fineAnnotationText({
      ...fine,
      template_values: { ...values, lift_action: "无动作" },
    }),
  ).not.toContain("无动作");

  expect(
    fineAnnotationText({
      ...fine,
      template_values: {
        ...values,
        lift_gripper: "右手夹爪",
        lift_action: "向上抬起",
        lift_destination: "托盘右上方",
      },
    }),
  ).toContain("张开夹爪，物体最终位于托盘中央。右手夹爪向上抬起。");
});

it("does not infer hand ownership from legacy Pick points", () => {
  const left = { frame: 5, view: "head", x: 0.3, y: 0.5 };
  const right = { ...left, x: 0.7 };
  const issues = (points?: FineAnnotation["keyframe_points"]) =>
    templateIssues({
      id: "one",
      start_frame: 0,
      end_frame: 10,
      text: "pick",
      fine_annotation: {
        ...annotation,
        template_version: 1,
        keyframe_point: left,
        keyframe_points: points,
      },
    });
  expect(issues()).toContain("左手关键帧标记");
  expect(issues({ left, right })).toContain("左手关键帧标记");
});

it("renders structured Pick failure reasons without claiming success", () => {
  const fine: FineAnnotation = {
    ...annotation,
    outcome: "failure",
    template_values: {
      operator_hand: "",
    },
    failure_reason_code: "gripper_deviated",
    failure_direction: "左上方",
    failure_detail: "物体滑落到夹爪下方",
    keyframe_frame: 20,
    gripper_keyframes: {},
  };
  const text = fineAnnotationText(fine);
  expect(text).toContain("本次尝试失败");
  expect(text).toContain("本次尝试失败，原因是夹爪向左上方偏移");
  expect(text).toContain("物体滑落到夹爪下方");
  expect(text).not.toContain("夹爪初始位于");
  expect(text).not.toContain("夹持住物体。");
  const issues = templateIssues({
    id: "failed-pick",
    start_frame: 0,
    end_frame: 10,
    text,
    fine_annotation: fine,
  });
  expect(issues).toEqual([]);
  expect(issues).not.toContain("操作手");
  expect(issues).not.toContain("夹爪初始位置");
  expect(issues).not.toContain("物体名称");
  expect(issues).not.toContain("片段内关键帧帧号");
  expect(issues).not.toContain("左手关键帧标记");
  expect(
    templateIssues({
      id: "failed-pick",
      start_frame: 0,
      end_frame: 10,
      text,
      fine_annotation: { ...fine, failure_direction: "" },
    }),
  ).toContain("偏移方向");
});

it("renders Place failure without success-only placement fields", () => {
  const fine: FineAnnotation = {
    ...annotation,
    skill: "Place",
    outcome: "failure",
    failure_reason_code: "object_dropped",
    failure_detail: "物体落在目标区域外，后续状态无法确认",
    keyframe_frame: 20,
  };
  const text = fineAnnotationText(fine);
  expect(text).toContain("本次尝试失败，原因是物体中途掉落");
  expect(text).toContain("物体落在目标区域外，后续状态无法确认");
  expect(text).not.toContain("持握");
  expect(text).not.toContain("放置在");
  const issues = templateIssues({
    id: "failed-place",
    start_frame: 0,
    end_frame: 10,
    text,
    fine_annotation: fine,
  });
  expect(issues).toEqual([]);
  expect(issues).not.toContain("靠近目标位置");
  expect(issues).not.toContain("放置位置");
  expect(issues).not.toContain("片段内关键帧帧号");
});

it("allows an unstructured failure event with only a reason", () => {
  const fine: FineAnnotation = {
    ...annotation,
    outcome: "failure",
    failure_reason_code: "failed_to_grasp",
  };
  expect(fineAnnotationText(fine)).toContain("本次尝试失败，原因是未形成有效夹持");
  expect(
    templateIssues({
      id: "unstructured-failure",
      start_frame: 0,
      end_frame: 10,
      text: "",
      fine_annotation: fine,
    }),
  ).toEqual([]);
});

it("adds retry context to generated text and requires a recovery action", () => {
  const fine: FineAnnotation = {
    ...annotation,
    skill: "Pick",
    outcome: "success",
    recovery_action: "夹爪重新张开，右手夹爪轻微回撤",
    target_point_id: "point1",
    target_point_label: "茶叶罐盖子的凸点",
    template_values: {
      operator_hand: "右手",
      initial_position: "失败后的当前位置",
      initial_state: "张开",
      object_location: "货架中央",
      object_name: "茶叶罐",
      orientation: "平行",
      contact_point: "凸点两侧",
      gripper_action: "闭合",
    },
  };
  const text = fineAnnotationText(fine);
  expect(text).toContain(
    "失败后，夹爪重新张开，右手夹爪轻微回撤，重新对准茶叶罐盖子的凸点（point1）",
  );
  expect(
    templateIssues({
      id: "retry",
      start_frame: 10,
      end_frame: 20,
      text,
      retry_of: "failed-pick",
      fine_annotation: { ...fine, recovery_action: "" },
    }),
  ).toContain("恢复动作");
});
