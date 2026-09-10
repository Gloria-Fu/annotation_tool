import type {
  FineAnnotation,
  GripperKeyframe,
  JawMark,
  OperatorHand,
} from "../../../shared/api/types";

export const handLabel = (hand: OperatorHand) => (hand === "left" ? "左手" : "右手");
export function annotationHands(fine: FineAnnotation): OperatorHand[] {
  const hand = fine.template_values?.operator_hand ?? fine.operator_hand;
  return hand === "双手"
    ? ["left", "right"]
    : hand === "左手"
      ? ["left"]
      : hand === "右手"
        ? ["right"]
        : [];
}
export function validJaw(mark?: JawMark): boolean {
  return (
    !!mark &&
    (mark.visibility === "invisible" ||
      (mark.visibility === "visible" &&
        Number.isFinite(mark.x) &&
        Number.isFinite(mark.y) &&
        mark.x >= 0 &&
        mark.x <= 1 &&
        mark.y >= 0 &&
        mark.y <= 1))
  );
}
export function completeGripper(group: GripperKeyframe): boolean {
  return (
    validJaw(group.left) &&
    validJaw(group.right) &&
    !(
      group.left?.visibility === "visible" &&
      group.right?.visibility === "visible" &&
      group.left.x === group.right.x &&
      group.left.y === group.right.y
    )
  );
}
export function gripperIssues(fine: FineAnnotation, start: number, end: number): string[] {
  return annotationHands(fine).flatMap((hand) => {
    const group = fine.gripper_keyframes?.[hand];
    if (!group) return [handLabel(hand) + "关键帧标记"];
    const issues: string[] = [];
    if (
      !Number.isInteger(group.frame) ||
      group.frame < start ||
      group.frame >= end ||
      !group.view.toLowerCase().includes("head")
    )
      issues.push(handLabel(hand) + "片段内 HEAD 关键帧");
    if (!completeGripper(group))
      issues.push(handLabel(hand) + "左右夹标记（坐标或不可见，坐标不能重合）");
    return issues;
  });
}
