import type { TaskItem } from "../../shared/api/types";

export type SamplingMode = "all" | "ratio" | "count";

export type SamplingOptions = {
  mode: SamplingMode;
  percent: number;
  count: number;
  seed: string;
  onlyUnchecked: boolean;
};

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed) {
    state ^= char.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function eligibleQualityItems(items: TaskItem[], onlyUnchecked: boolean): TaskItem[] {
  return items
    .filter((item) => !onlyUnchecked || item.qa_status === "unchecked")
    .sort((left, right) => left.claim_order - right.claim_order);
}

export function selectQualitySample(items: TaskItem[], options: SamplingOptions): TaskItem[] {
  const eligible = eligibleQualityItems(items, options.onlyUnchecked);
  if (options.mode === "all") return eligible;
  if (eligible.length === 0) return [];

  const size =
    options.mode === "ratio"
      ? Math.ceil(eligible.length * (clamp(options.percent, 1, 100) / 100))
      : clamp(Math.floor(options.count), 1, eligible.length);
  const random = seededRandom(options.seed.trim() || "quality");
  const shuffled = [...eligible];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled.slice(0, size).sort((left, right) => left.claim_order - right.claim_order);
}
