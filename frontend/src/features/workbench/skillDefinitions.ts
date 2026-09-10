/**
 * The controlled vocabulary used by the fine-annotation panel.
 * Keep definitions here so the editor, validation, and export code share one source of truth.
 */
export type SkillName =
  | "Catch"
  | "Cut"
  | "Grasp"
  | "Insert"
  | "Pour"
  | "CloseBox"
  | "CloseJar"
  | "Drop"
  | "Hold"
  | "HoldLargeObject"
  | "OpenBox"
  | "OpenJar"
  | "Pull"
  | "Scoop"
  | "Stack"
  | "Pick"
  | "Place";

export type SkillDefinition = {
  name: SkillName;
  keyframeDefinition: string;
  requiredObjects: string[];
};

export const SKILL_DEFINITIONS: readonly SkillDefinition[] = [
  {
    name: "Catch",
    keyframeDefinition: "手/夹爪接住运动物体，物体开始被控制",
    requiredObjects: ["被接住物体"],
  },
  {
    name: "Cut",
    keyframeDefinition: "刀具第一次接触并切入或使物体变形",
    requiredObjects: ["刀具", "被切物"],
  },
  {
    name: "Grasp",
    keyframeDefinition: "手/夹爪形成稳定夹持，物体不再滑动",
    requiredObjects: ["被抓物体"],
  },
  {
    name: "Insert",
    keyframeDefinition: "被插入物体的前端接触孔口并开始进入",
    requiredObjects: ["插入物", "目标孔/容器"],
  },
  {
    name: "Pour",
    keyframeDefinition: "液体第一次连续流入目标容器",
    requiredObjects: ["源容器", "目标容器"],
  },
  {
    name: "CloseBox",
    keyframeDefinition: "盒盖接触盒体并开始关闭",
    requiredObjects: ["盒盖", "盒体"],
  },
  {
    name: "CloseJar",
    keyframeDefinition: "瓶盖接触瓶口并开始旋紧或压合",
    requiredObjects: ["瓶盖", "瓶身"],
  },
  {
    name: "Drop",
    keyframeDefinition: "物体脱离手/夹爪支撑并开始下落",
    requiredObjects: ["被释放物体"],
  },
  {
    name: "Hold",
    keyframeDefinition: "物体被稳定支撑或持握，并开始随手移动",
    requiredObjects: ["被持握物体"],
  },
  {
    name: "HoldLargeObject",
    keyframeDefinition: "第二只手接触大物体并形成共同支撑",
    requiredObjects: ["大物体", "双手"],
  },
  { name: "OpenBox", keyframeDefinition: "盒盖开始离开盒体", requiredObjects: ["盒盖", "盒体"] },
  {
    name: "OpenJar",
    keyframeDefinition: "瓶盖开始旋松、上升或脱离瓶身",
    requiredObjects: ["瓶盖", "瓶身"],
  },
  {
    name: "Pull",
    keyframeDefinition: "物体接触后开始沿拉动方向移动",
    requiredObjects: ["被拉物体"],
  },
  {
    name: "Scoop",
    keyframeDefinition: "勺/铲接触材料并开始聚拢或舀取",
    requiredObjects: ["工具", "被舀材料"],
  },
  {
    name: "Stack",
    keyframeDefinition: "上方物体第一次接触下方物体并开始承重",
    requiredObjects: ["上方物体", "下方物体"],
  },
  {
    name: "Pick",
    keyframeDefinition: "物体第一次脱离原支撑面",
    requiredObjects: ["被拾取物体", "原支撑面"],
  },
  {
    name: "Place",
    keyframeDefinition: "物体第一次接触目标位置并开始卸载",
    requiredObjects: ["被放置物体", "目标位置"],
  },
] as const;

export const SKILL_OPTIONS = SKILL_DEFINITIONS.map(({ name }) => ({ value: name, label: name }));

export function getSkillDefinition(skill: string): SkillDefinition | undefined {
  return SKILL_DEFINITIONS.find((definition) => definition.name === skill);
}
