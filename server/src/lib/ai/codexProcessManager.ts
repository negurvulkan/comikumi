import { spawn, execFile } from "node:child_process";
import type { Writable, Readable } from "node:stream";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { CODEX_HOME_DIR } from "../paths.js";

type CodexChildProcess = ReturnType<typeof spawn> & { stdin: Writable; stdout: Readable };

/**
 * Manages one long-lived `codex app-server` subprocess per ComiKumi account (never
 * one per request — starting the process and completing its own `initialize`
 * handshake takes real time). Talks newline-delimited JSON-RPC 2.0 over stdio, exactly
 * the protocol confirmed by running `codex app-server generate-json-schema
 * --experimental` against the installed `@openai/codex` binary (v0.147.0) during this
 * feature's spike — every method/notification name below is taken directly from that
 * generated schema, not guessed from docs.
 *
 * Each process gets CODEX_HOME=<CODEX_HOME_DIR>/<userId>, isolating that account's
 * ChatGPT OAuth tokens (auth.json) from every other account's, even though they all
 * run on the same shared ComiKumi server. This is what makes Codex-as-a-provider safe
 * in ComiKumi's existing multi-user model.
 */

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
}

interface CodexSession {
  userId: string;
  child: CodexChildProcess;
  rl: readline.Interface;
  nextId: number;
  pending: Map<number, PendingRequest>;
  notifications: EventEmitter;
  ready: Promise<void>;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

/** In case Codex ever emits a request that expects the client to respond (e.g. a
 * permission prompt) — for ComiKumi's read-only/no-approval sandbox policy (see
 * startChatThread() below) this shouldn't normally fire, but a well-formed JSON-RPC
 * client always answers requests it doesn't handle so the server doesn't hang waiting
 * for a reply that will never come. */
function methodNotSupportedResponse(id: number) {
  return { id, error: { code: -32601, message: "Method not supported by ComiKumi's Codex client" } };
}

const sessions = new Map<string, CodexSession>();

function authJsonPath(userId: string): string {
  return path.join(CODEX_HOME_DIR, userId, "auth.json");
}

export async function isCodexLoggedIn(userId: string): Promise<boolean> {
  try {
    await fs.access(authJsonPath(userId));
    return true;
  } catch {
    return false;
  }
}

function touchIdleTimer(session: CodexSession): void {
  if (session.idleTimer) clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(() => stopSession(session.userId), IDLE_TIMEOUT_MS);
}

async function getOrStartSession(userId: string): Promise<CodexSession> {
  const existing = sessions.get(userId);
  if (existing) {
    touchIdleTimer(existing);
    return existing;
  }

  const codexHome = path.join(CODEX_HOME_DIR, userId);
  await fs.mkdir(codexHome, { recursive: true });

  const child = spawn("codex", ["app-server"], {
    env: { ...process.env, CODEX_HOME: codexHome },
    stdio: ["pipe", "pipe", "inherit"],
    // On Windows, npm installs a global `codex` binary as a `codex.cmd` shim —
    // child_process.spawn() does NOT resolve PATHEXT shims on its own (a
    // long-standing Node-on-Windows gotcha, confirmed via a live spike against the
    // real binary: without `shell: true` this throws ENOENT even though `codex
    // --version` works fine in an interactive shell). Safe here since every argument
    // is a static literal, never user input — no shell-injection surface.
    shell: process.platform === "win32",
  }) as CodexChildProcess;
  const rl = readline.createInterface({ input: child.stdout });
  const session: CodexSession = {
    userId,
    child,
    rl,
    nextId: 1,
    pending: new Map(),
    notifications: new EventEmitter(),
    ready: Promise.resolve(),
    idleTimer: null,
  };

  rl.on("line", (line) => {
    if (!line.trim()) return;
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof message.id === "number") {
      const pending = session.pending.get(message.id);
      if (!pending) return;
      session.pending.delete(message.id);
      if (message.error) pending.reject(new Error((message.error as { message?: string }).message ?? "codex_rpc_error"));
      else pending.resolve(message.result);
      return;
    }
    if (typeof message.method === "string") {
      if (message.params === undefined && "id" in message) {
        // A request from the server we don't implement — answer it so Codex doesn't
        // block waiting for a response (see methodNotSupportedResponse()'s doc comment).
        session.child.stdin.write(JSON.stringify(methodNotSupportedResponse(message.id as number)) + "\n");
        return;
      }
      session.notifications.emit(message.method, message.params);
    }
  });

  child.on("exit", () => {
    sessions.delete(userId);
    for (const pending of session.pending.values()) pending.reject(new Error("codex_process_exited"));
  });

  sessions.set(userId, session);
  touchIdleTimer(session);

  session.ready = call(session, "initialize", { clientInfo: { name: "comikumi", version: "0.7.0" } }).then(() => {
    notify(session, "initialized", {});
  });
  await session.ready;
  return session;
}

function notify(session: CodexSession, method: string, params: unknown): void {
  session.child.stdin.write(JSON.stringify({ method, params }) + "\n");
}

function call(session: CodexSession, method: string, params: unknown): Promise<unknown> {
  const id = session.nextId++;
  return new Promise((resolve, reject) => {
    session.pending.set(id, { resolve, reject });
    session.child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
  });
}

/** `child.kill()` alone is NOT enough on Windows when the child was spawned with
 * `shell: true` (see the spawn call above, needed to resolve the npm-installed
 * `codex.cmd` shim) — confirmed via a live spike: killing only terminates the cmd.exe
 * wrapper, silently orphaning the real `codex.exe` underneath it, which then keeps
 * running (and keeps its CODEX_HOME files locked) forever. `taskkill /T /F` kills the
 * whole process tree instead; on POSIX, `child.kill()` already terminates the actual
 * process directly (no shell wrapper involved there), so it's used unchanged. */
function killProcessTree(child: CodexChildProcess): void {
  if (process.platform === "win32" && child.pid) {
    execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], () => {});
  } else {
    child.kill();
  }
}

export function stopSession(userId: string): void {
  const session = sessions.get(userId);
  if (!session) return;
  if (session.idleTimer) clearTimeout(session.idleTimer);
  sessions.delete(userId);
  session.rl.close();
  killProcessTree(session.child);
}

/** Test-only escape hatch, mirroring authStore.ts's resetAuthSecretCacheForTests. */
export function resetCodexSessionsForTests(): void {
  for (const userId of [...sessions.keys()]) stopSession(userId);
}

export interface CodexLoginStart {
  loginId: string;
  userCode: string;
  verificationUrl: string;
}

const loginStatusByUser = new Map<string, { loginId: string; status: "pending" | "complete" | "error"; error?: string }>();

/** Always the device-code flow (see codex_app_server_protocol's LoginAccountParams
 * `{type: "chatgptDeviceCode"}`), never the interactive-browser-popup `chatgpt` mode —
 * ComiKumi is a shared server that multiple browsers (possibly remote) connect to
 * (see docs/FEATURES.md's Mehrbenutzerbetrieb section), so the server itself opening
 * a local browser would not reach the actual end user in general. Device-code works
 * identically whether ComiKumi runs under Electron, Docker, or plain `npm run dev`. */
export async function startCodexLogin(userId: string): Promise<CodexLoginStart> {
  const session = await getOrStartSession(userId);
  const result = (await call(session, "account/login/start", { type: "chatgptDeviceCode" })) as {
    loginId: string;
    userCode: string;
    verificationUrl: string;
  };
  loginStatusByUser.set(userId, { loginId: result.loginId, status: "pending" });
  session.notifications.once("account/login/completed", (params: { loginId?: string | null; success: boolean; error?: string | null }) => {
    if (params.loginId && params.loginId !== result.loginId) return;
    loginStatusByUser.set(userId, {
      loginId: result.loginId,
      status: params.success ? "complete" : "error",
      error: params.error ?? undefined,
    });
  });
  return { loginId: result.loginId, userCode: result.userCode, verificationUrl: result.verificationUrl };
}

export function getCodexLoginStatus(userId: string): { status: "pending" | "complete" | "error"; error?: string } | null {
  const entry = loginStatusByUser.get(userId);
  return entry ? { status: entry.status, error: entry.error } : null;
}

export async function cancelCodexLogin(userId: string): Promise<void> {
  const entry = loginStatusByUser.get(userId);
  const session = sessions.get(userId);
  if (entry && session) {
    await call(session, "account/login/cancel", { loginId: entry.loginId }).catch(() => {});
  }
  loginStatusByUser.delete(userId);
}

export async function logoutCodex(userId: string): Promise<void> {
  const session = sessions.get(userId);
  if (session) await call(session, "account/logout", {}).catch(() => {});
  stopSession(userId);
  await fs.rm(path.join(CODEX_HOME_DIR, userId), { recursive: true, force: true });
  loginStatusByUser.delete(userId);
}

export interface CodexRateLimits {
  planType?: string;
  usedPercent?: number;
}

export async function getCodexRateLimits(userId: string): Promise<CodexRateLimits | null> {
  if (!(await isCodexLoggedIn(userId))) return null;
  try {
    const session = await getOrStartSession(userId);
    const result = (await call(session, "account/rateLimits/read", {})) as {
      planType?: string;
      rateLimits?: { primary?: { usedPercent?: number } };
    };
    return { planType: result.planType, usedPercent: result.rateLimits?.primary?.usedPercent };
  } catch {
    return null;
  }
}

/** Streams one turn's assistant reply as plain text deltas. Every turn runs with a
 * read-only sandbox and no shell/file-write approvals — confirmed via the generated
 * schema that `sandboxPolicy: {type: "readOnly"}` is a real, supported value — since
 * ComiKumi's assistant is a conversational writing aid, never a coding agent acting on
 * the user's machine. `threadId` is created fresh per chat call (v1 has no
 * server-persisted conversation, see the plan's "Nicht in diesem Umfang" section) —
 * `messages` carries the full visible history instead, folded into the turn's input.
 * `imageDataUrl`, when present, is appended as a second input item — per the generated
 * schema's `UserInput` union, Codex's `turn/start` accepts `{type:"image", url:"..."}`
 * alongside the text item; verified via live testing against the real binary that the
 * `url` field also accepts a `data:` URI directly, not just an http(s) URL. */
export async function* streamCodexChat(userId: string, promptText: string, imageDataUrl?: string): AsyncIterable<string> {
  const session = await getOrStartSession(userId);
  touchIdleTimer(session);

  const threadStart = (await call(session, "thread/start", {
    sandboxPolicy: { type: "readOnly" },
    approvalPolicy: "never",
  })) as { thread: { id: string } };
  const threadId = threadStart.thread.id;

  const chunks: string[] = [];
  let turnDone = false;
  let turnError: string | null = null;
  const onDelta = (params: { threadId: string; delta: string }) => {
    if (params.threadId === threadId) chunks.push(params.delta);
  };
  const onTurnCompleted = (params: { threadId: string; status?: string; error?: string | null }) => {
    if (params.threadId !== threadId) return;
    turnDone = true;
    if (params.status && params.status !== "completed") turnError = params.error ?? params.status;
  };
  session.notifications.on("item/agentMessage/delta", onDelta);
  session.notifications.on("turn/completed", onTurnCompleted);

  try {
    // Track rejection via a flag instead of a bare `await turnPromise` further down:
    // `call()`'s promise can reject (e.g. the server rejecting the request) and, since
    // "turn/completed" then never arrives, `turnDone` would otherwise never flip and
    // the polling loop below would spin forever. Attaching .catch() immediately also
    // avoids an unhandled rejection in the window before that catch is wired up — Node
    // kills the whole process on those by default, which is exactly what turned one
    // bad RPC call into a full dev-server crash previously.
    let turnPromiseError: string | null = null;
    const input: unknown[] = [{ type: "text", text: promptText }];
    if (imageDataUrl) input.push({ type: "image", url: imageDataUrl });
    const turnPromise = call(session, "turn/start", { threadId, input });
    turnPromise.catch((err) => {
      turnPromiseError = err instanceof Error ? err.message : String(err);
      turnDone = true;
    });

    // Poll the accumulated chunk buffer instead of a callback-per-chunk async
    // generator bridge — simple and good enough for a single interactive chat turn
    // (not a high-throughput streaming scenario).
    while (!turnDone) {
      await new Promise((resolve) => setTimeout(resolve, 40));
      while (chunks.length > 0) yield chunks.shift()!;
    }
    while (chunks.length > 0) yield chunks.shift()!;
    if (turnPromiseError) throw new Error(turnPromiseError);
    if (turnError) throw new Error(turnError);
  } finally {
    session.notifications.off("item/agentMessage/delta", onDelta);
    session.notifications.off("turn/completed", onTurnCompleted);
  }
}
