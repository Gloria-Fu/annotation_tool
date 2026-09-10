import { ENABLED_SKILLS } from "./enabledSkills";
import { getSkillDefinition } from "./skillDefinitions";

export function isSkillEnabled(skill: string): boolean {
  return ENABLED_SKILLS.some((name) => name === skill) && !!getSkillDefinition(skill);
}

export const SKILL_OPTIONS = ENABLED_SKILLS.flatMap((name) => {
  const definition = getSkillDefinition(name);
  return definition ? [{ value: name, label: definition.label + " (" + name + ")" }] : [];
});
