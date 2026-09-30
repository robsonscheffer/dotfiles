export type PaneName = "A" | "A-base" | "B";
export interface Pane { name: PaneName; argv: string[] }
export interface TurnMetrics { turn: number; prompt: string; seconds: number; context: number; output: number }
export type CheckSpec =
  | { name: string; kind: "words"; max?: number }
  | { name: string; kind: "count"; pattern: string }
  | { name: string; kind: "phrases"; list: string[] }
  | { name: string; kind: "long_paragraphs"; max_lines: number }
  | { name: string; kind: "ends_with"; pattern: string };
export interface CheckValue { name: string; value: number }
export type CheckVerdict = "B better" | "B worse" | "same" | "single run";
export interface CompareConfig { command: string[]; systemFlag: string; isolateFlags: string[]; checks: CheckSpec[] }

export const PANES: readonly PaneName[] = ["A", "A-base", "B"];

export function lowerIsBetter(spec: CheckSpec): boolean {
  return spec.kind !== "ends_with";
}
