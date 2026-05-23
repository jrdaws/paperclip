import os from "node:os";
import path from "node:path";

/**
 * Prepends directories where the Cursor Agent CLI (`agent`) is often installed.
 * GUI-launched Paperclip inherits a minimal PATH; login shells usually include
 * `~/.local/bin` (uv/pipx) or Homebrew prefixes.
 */
export function prependCursorAgentCliPath(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const home = os.homedir();
  const extra = [
    path.join(home, ".local", "bin"),
    path.join(home, ".cursor", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  const delim = process.platform === "win32" ? ";" : ":";
  const base = env.PATH ?? env.Path ?? "";
  const merged = [...extra, base].filter(Boolean).join(delim);
  if (process.platform === "win32") {
    return { ...env, Path: merged, PATH: merged };
  }
  return { ...env, PATH: merged };
}
