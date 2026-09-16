export type SkillName = "Pick" | "Place" | "Grasp" | "Push" | "Pull";
export type SentenceField = {
  key: string;
  label: string;
  example: string;
  options?: string[];
  optional?: boolean;
  autoFillFrom?: string;
};
export type SentenceToken = string | SentenceField;
export type SkillDefinition = {
  name: SkillName;
  label: string;
  keyframeDefinition: string;
  requiredObjects: string[];
  tokens: SentenceToken[];
};
export type ObjectTargetMode = "same_object" | "separate_objects";
export const OBJECT_TARGET_MODE_OPTIONS: { value: ObjectTargetMode; label: string }[] = [
  { value: "same_object", label: "同一物体" },
  { value: "separate_objects", label: "两个物体" },
];
const field = (
  key: string,
  label: string,
  example: string,
  options?: string[],
  optional?: boolean,
  autoFillFrom?: string,
): SentenceField => ({
  key,
  label,
  example,
  options,
  optional,
  autoFillFrom,
});
const states = ["张开", "闭合", "无法判断"];
const actions = ["张开", "闭合", "保持张开", "保持闭合", "无法判断"];
const liftGripperOptions = ["左手夹爪", "右手夹爪", "双手夹爪"];
const liftActionOptions = ["向上抬起", "无动作"];
const placeReleaseModes = ["接触支撑面后释放", "空中释放后落至目标位置", "无法判断释放方式"];
const skillTemplateDefaults: Partial<Record<SkillName, Record<string, string>>> = {
  Pick: {
    initial_state: "张开",
    initial_state_left: "张开",
    initial_state_right: "张开",
    gripper_action: "闭合",
    gripper_action_left: "闭合",
    gripper_action_right: "闭合",
    left_gripper_action: "闭合",
    right_gripper_action: "闭合",
  },
  Place: {
    initial_state: "闭合",
    initial_state_left: "闭合",
    initial_state_right: "闭合",
    gripper_action: "张开",
    gripper_action_left: "张开",
    gripper_action_right: "张开",
    left_gripper_action: "张开",
    right_gripper_action: "张开",
  },
};
const object: SentenceToken[] = [
  field("object_color", "颜色（选填）", "如：绿色", undefined, true),
  field("object_material", "材质（选填）", "如：塑料", undefined, true),
  field("object_shape", "形状（选填）", "如：圆柱形", undefined, true),
  field("object_name", "物体名称", "如：黄瓜"),
];
const handObject = (prefix: "left_" | "right_", label: "左手" | "右手"): SentenceToken[] => [
  field(prefix + "object_color", label + "对象颜色（选填）", "如：绿色", undefined, true),
  field(prefix + "object_material", label + "对象材质（选填）", "如：塑料", undefined, true),
  field(prefix + "object_shape", label + "对象形状（选填）", "如：圆柱形", undefined, true),
  field(prefix + "object_name", label + "对象名称", "如：黄瓜"),
];
const posture: SentenceToken[] = [
  "，夹爪以",
  field("orientation", "相对姿态", "选择姿态", ["垂直", "平行", "倾斜", "无法判断"]),
  "的姿态，",
];
const contact: SentenceToken[] = [
  "在其",
  field("contact_point", "接触部位", "如：两侧"),
  field("gripper_action", "夹爪动作", "选择动作", actions),
  "夹爪，",
];
function tokens(name: SkillName): SentenceToken[] {
  const start: SentenceToken[] = [
    field("operator_hand", "操作手", "选择操作手", ["左手", "右手", "双手"]),
    "夹爪初始位于",
    field("initial_position", "夹爪初始位置", "如：餐桌右侧边缘外侧"),
    "，状态为",
    field("initial_state", "初始夹爪状态", "选择状态", states),
  ];
  if (name === "Place")
    return [
      ...start,
      "，持握",
      ...object,
      "，夹爪以",
      field("orientation", "相对姿态", "选择姿态", ["垂直", "平行", "倾斜", "无法判断"]),
      "的姿态，将物体移动至",
      field("approach", "目标位置", "如：托盘内靠近左后角的位置"),
      "，释放方式为",
      field("release_mode", "释放方式", "选择释放方式", placeReleaseModes),
      "，",
      field("gripper_action", "释放时夹爪动作", "选择动作", actions),
      "夹爪，物体最终位于",
      field("position_end", "放置位置", "如：托盘中央"),
      "。",
      field("lift_gripper", "抬起夹爪（选填）", "选择夹爪", liftGripperOptions, true),
      field("lift_action", "收尾动作和状态", "选择收尾动作", liftActionOptions),
      "。",
    ];
  const objectTarget: SentenceToken[] = [
    field("object_location", "物体所在位置", "如：白色桌面右上角"),
    "的",
    ...object,
  ];
  if (name === "Pick")
    return [
      ...start,
      "。靠近位于",
      ...objectTarget,
      "，夹爪以相对",
      field(
        "pick_relative_object",
        "相对物体",
        "自动填入物体名称",
        undefined,
        false,
        "object_name",
      ),
      field("orientation", "相对姿态", "选择姿态", ["垂直", "平行", "倾斜", "无法判断"]),
      "的姿态，",
      field("gripper_action", "夹爪动作", "选择动作", actions),
      "夹爪，夹持住",
      field("pick_grasped_object", "夹持物体", "自动填入物体名称", undefined, false, "object_name"),
      "的",
      field("contact_point", "接触部位", "如：两侧"),
      "。",
      field("lift_gripper", "抬起夹爪（选填）", "选择夹爪", liftGripperOptions, true),
      field("lift_action", "收尾动作和状态", "选择收尾动作", liftActionOptions),
      "。",
    ];
  const base: SentenceToken[] = [
    ...start,
    "，向",
    field("approach", "靠近目标位置", "如：白色桌面右上角铅笔盒前方"),
    "移动。靠近位于",
    ...objectTarget,
    ...posture,
  ];
  if (name === "Grasp") return [...base, ...contact, "形成稳定抓握。"];
  const action = name === "Push" ? "推动" : "拉动";
  return [
    ...base,
    ...(name === "Push"
      ? [
          field("gripper_action", "接触时夹爪动作", "选择动作", actions),
          "并接触其",
          field("contact_point", "接触部位", "如：左侧面"),
          "，",
        ]
      : contact),
    "向",
    field("direction", action + "方向", "如：柜体外侧"),
    action + "物体，使其移动至",
    field("position_end", "物体结束位置", "如：半开位置"),
    "。",
  ];
}
function separateObjectStart(): SentenceToken[] {
  return [
    field("operator_hand", "操作手", "选择操作手", ["左手", "右手", "双手"]),
    "夹爪初始位于",
    field("initial_position", "夹爪初始位置", "如：餐桌右侧边缘外侧"),
    "，左手状态为",
    field("initial_state_left", "左手初始夹爪状态", "选择状态", states),
    "、右手状态为",
    field("initial_state_right", "右手初始夹爪状态", "选择状态", states),
  ];
}
function separatePickHandTokens(
  prefix: "left_" | "right_",
  label: "左手" | "右手",
): SentenceToken[] {
  return [
    "。",
    label,
    "靠近位于",
    field(prefix + "object_location", label + "对象所在位置", "如：白色桌面右上角"),
    "的",
    ...handObject(prefix, label),
    "，夹爪以相对",
    field(
      prefix + "pick_relative_object",
      label + "相对物体",
      "自动填入对象名称",
      undefined,
      false,
      prefix + "object_name",
    ),
    field(prefix + "orientation", label + "相对姿态", "选择姿态", [
      "垂直",
      "平行",
      "倾斜",
      "无法判断",
    ]),
    "的姿态，",
    field(prefix + "gripper_action", label + "夹爪动作", "选择动作", actions),
    "夹爪，夹持住",
    field(
      prefix + "pick_grasped_object",
      label + "夹持物体",
      "自动填入对象名称",
      undefined,
      false,
      prefix + "object_name",
    ),
    "的",
    field(prefix + "contact_point", label + "接触部位", "如：两侧"),
  ];
}
function separatePlaceHandTokens(
  prefix: "left_" | "right_",
  label: "左手" | "右手",
): SentenceToken[] {
  return [
    "，",
    label,
    "持握",
    ...handObject(prefix, label),
    "，夹爪以",
    field(prefix + "orientation", label + "相对姿态", "选择姿态", [
      "垂直",
      "平行",
      "倾斜",
      "无法判断",
    ]),
    "的姿态，将物体移动至",
    field(prefix + "approach", label + "目标位置", "如：托盘内靠近左后角的位置"),
    "，释放方式为",
    field(prefix + "release_mode", label + "释放方式", "选择释放方式", placeReleaseModes),
    "，",
    field(prefix + "gripper_action", label + "释放时夹爪动作", "选择动作", actions),
    "夹爪，物体最终位于",
    field(prefix + "position_end", label + "放置位置", "如：托盘中央"),
  ];
}
function separateObjectTokens(skill: string): SentenceToken[] {
  if (skill === "Pick") {
    return [
      ...separateObjectStart(),
      ...separatePickHandTokens("left_", "左手"),
      "；",
      ...separatePickHandTokens("right_", "右手").slice(1),
      "。",
    ];
  }
  if (skill === "Place") {
    return [
      ...separateObjectStart(),
      ...separatePlaceHandTokens("left_", "左手"),
      "；",
      ...separatePlaceHandTokens("right_", "右手").slice(1),
      "。",
    ];
  }
  return [];
}
export const SKILL_DEFINITIONS: SkillDefinition[] = [
  {
    name: "Pick",
    label: "拾取",
    keyframeDefinition: "物体被夹爪夹持住的瞬间",
    requiredObjects: ["每只操作手夹持物体时的左夹和右夹位置；看不见的夹指标为不可见"],
    tokens: tokens("Pick"),
  },
  {
    name: "Place",
    label: "放置",
    keyframeDefinition: "夹爪完全张开的时刻；若边张开边移动，取移动前张开最大的帧。",
    requiredObjects: ["只标关键帧；双手时分别标左右手，不标夹爪位置"],
    tokens: tokens("Place"),
  },
  {
    name: "Grasp",
    label: "抓握",
    keyframeDefinition: "夹爪形成稳定夹持、物体开始被控制",
    requiredObjects: ["被抓物体"],
    tokens: tokens("Grasp"),
  },
  {
    name: "Push",
    label: "推动",
    keyframeDefinition: "物体因推动第一次开始移动",
    requiredObjects: ["被推物体"],
    tokens: tokens("Push"),
  },
  {
    name: "Pull",
    label: "拉动",
    keyframeDefinition: "物体因拉动第一次开始移动",
    requiredObjects: ["被拉物体"],
    tokens: tokens("Pull"),
  },
];
export function getSkillDefinition(skill: string) {
  return SKILL_DEFINITIONS.find((definition) => definition.name === skill);
}
export function withSkillTemplateDefaults(
  skill: string,
  values: Record<string, string>,
): Record<string, string> {
  const defaults = skillTemplateDefaults[skill as SkillName];
  if (!defaults) return values;
  const next = { ...values };
  for (const [key, value] of Object.entries(defaults)) {
    if (!next[key]?.trim()) next[key] = value;
  }
  if (!next.lift_gripper?.trim()) {
    const liftGripper = defaultLiftGripperForOperatorHand(next.operator_hand);
    if (liftGripper) next.lift_gripper = liftGripper;
  }
  return next;
}
export function defaultLiftGripperForOperatorHand(operatorHand?: string): string | undefined {
  if (operatorHand === "左手") return "左手夹爪";
  if (operatorHand === "右手") return "右手夹爪";
  if (operatorHand === "双手") return "双手夹爪";
  return undefined;
}
export function isSeparateObjectMode(skill: string, values: Record<string, string>): boolean {
  return (
    (skill === "Pick" || skill === "Place") &&
    values.operator_hand === "双手" &&
    values.object_mode === "separate_objects"
  );
}
export function sentenceFieldValue(
  field: SentenceField,
  values: Record<string, string>,
): string | undefined {
  const value = values[field.key]?.trim();
  if (value) return value;
  return field.autoFillFrom ? values[field.autoFillFrom]?.trim() : undefined;
}
export function sentenceTokensForOutput(
  skill: string,
  values: Record<string, string>,
): SentenceToken[] {
  const tokens = sentenceTokens(skill, values);
  const hasLiftAction = values.lift_action === "向上抬起";
  const noLiftAction = values.lift_action === "无动作";
  if (skill === "Pick") {
    const liftIndex = tokens.findIndex(
      (token) => typeof token !== "string" && token.key === "lift_gripper",
    );
    if (liftIndex < 0) return tokens;
    const base = tokens.slice(0, liftIndex - 1);
    if (noLiftAction) return [...base, "。"];
    if (!hasLiftAction) return tokens;
    const liftGripper = tokens[liftIndex];
    const liftAction = tokens[liftIndex + 1];
    const tail: SentenceToken[] = ["。"];
    if (values.lift_gripper?.trim() && liftGripper) tail.push(liftGripper);
    if (values.lift_action?.trim() && liftAction) tail.push(liftAction);
    tail.push("。");
    return [...base, ...tail];
  }
  if (skill === "Place") {
    const liftIndex = tokens.findIndex(
      (token) => typeof token !== "string" && token.key === "lift_gripper",
    );
    if (liftIndex < 0) return tokens;
    const base = tokens.slice(0, liftIndex - 1);
    if (noLiftAction) return [...base, "。"];
    if (!hasLiftAction) return tokens;
    const liftGripper = tokens[liftIndex];
    const liftAction = tokens[liftIndex + 1];
    const tail: SentenceToken[] = ["。"];
    if (values.lift_gripper?.trim() && liftGripper) tail.push(liftGripper);
    if (values.lift_action?.trim() && liftAction) tail.push(liftAction);
    tail.push("。");
    return [...base, ...tail];
  }
  return tokens;
}
export function sentenceTokens(skill: string, values: Record<string, string>): SentenceToken[] {
  if (isSeparateObjectMode(skill, values)) return separateObjectTokens(skill);
  return (getSkillDefinition(skill)?.tokens || []).flatMap((token): SentenceToken[] => {
    if (typeof token === "string" || values.operator_hand !== "双手") return [token];
    if (token.key !== "initial_state" && token.key !== "gripper_action") return [token];
    return [
      { ...token, key: token.key + "_left", label: "左手" + token.label },
      "、",
      { ...token, key: token.key + "_right", label: "右手" + token.label },
    ];
  });
}
