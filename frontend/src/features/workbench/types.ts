import type { FineAnnotation, Segment } from "../../shared/api/types";

export type WorkbenchState = {
  segments: Segment[];
  past: Segment[][];
  future: Segment[][];
  draftOrigin?: Segment[];
};

export type WorkbenchAction =
  | { type: "begin-boundary" }
  | { type: "commit" }
  | { type: "replace"; segments: Segment[] }
  | { type: "update-text"; id: string; text: string }
  | { type: "update-fine"; id: string; fine_annotation: FineAnnotation; text: string }
  | { type: "split"; id: string; frame: number; newId: string }
  | { type: "move-boundary"; index: number; frame: number; length: number }
  | { type: "clear"; length: number }
  | { type: "undo" }
  | { type: "redo" };
