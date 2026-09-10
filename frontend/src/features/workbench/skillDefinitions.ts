export type SkillName = "Pick" | "Place" | "Grasp" | "Push" | "Pull";
export type SentenceField = {
  key: string;
  label: string;
  example: string;
  options?: string[];
  optional?: boolean;
};
export type SentenceToken = string | SentenceField;
export type SkillDefinition = {
  name: SkillName;
  label: string;
  keyframeDefinition: string;
  requiredObjects: string[];
  tokens: SentenceToken[];
};
const field = (
  key: string,
  label: string,
  example: string,
  options?: string[],
  optional?: boolean,
): SentenceField => ({ key, label, example, options, optional });
const states = ["张开", "闭合", "无法判断"];
const actions = ["张开", "闭合", "保持张开", "保持闭合", "无法判断"];
const object: SentenceToken[] = [
  field("object_color", "颜色（选填）", "如：绿色", undefined, true),
  field("object_material", "材质（选填）", "如：塑料", undefined, true),
  field("object_shape", "形状（选填）", "如：圆柱形", undefined, true),
  field("object_name", "物体名称", "如：黄瓜"),
];
const posture: SentenceToken[] = [
  "，夹爪以相对",
  field("reference", "姿态参考", "如：物体长轴"),
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
    field("initial_position", "夹爪初始位置", "如：货架前侧"),
    "，状态为",
    field("initial_state", "初始夹爪状态", "选择状态", states),
  ];
  if (name === "Place")
    return [
      ...start,
      "，持握",
      ...object,
      "，向",
      field("approach", "靠近目标位置", "如：托盘上方"),
      "移动",
      ...posture,
      "将物体放置在",
      field("position_end", "放置位置", "如：托盘中央"),
      "，待其受到支撑后",
      field("gripper_action", "释放时夹爪动作", "选择动作", actions),
      "夹爪。",
    ];
  const base: SentenceToken[] = [
    ...start,
    ...(name === "Pick"
      ? ["。靠近位于"]
      : ["，向", field("approach", "靠近目标位置", "如：货架右上方"), "移动。靠近位于"]),
    field("object_location", "物体所在位置", "如：货架右侧"),
    "的",
    ...object,
    ...posture,
  ];
  if (name === "Grasp") return [...base, ...contact, "形成稳定抓握。"];
  if (name === "Pick") return [...base, ...contact, "夹持住物体。"];
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
    keyframeDefinition: "物体第一次接触目标支撑面",
    requiredObjects: ["被放置物体", "目标支撑面"],
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
export function sentenceTokens(skill: string, values: Record<string, string>): SentenceToken[] {
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
