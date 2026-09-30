// Every size and time limit `mate-doc verify` uses, in one place so they can be tuned together.
export const CODE_WINDOW_RADIUS = 20; // lines above and below the cited line
export const MAX_WINDOW_CHARS = 20_000; // link, query, and record windows
export const AGENT_TIMEOUT_MS = 180_000;
export const DEFAULT_MODEL = "sonnet";
