#!/usr/bin/env node
/*
 * Stop hook（asyncRewake 模式）：解析 agent 本轮末尾的 `OS:` 提问，
 * 转发给 Letta app-server 上的共存记忆体（symbiont-memory），
 * 拿到回答后写 stderr + exit 2 立即唤醒 Claude，把答案作为 system reminder 带回。
 *
 * 与 os-system-prompt.txt 一致：
 *   - 末尾 `OS:` 为空 / 无 OS 行  -> exit 0（不唤醒，正常停止）
 *   - 记忆体没开/超时/出错/空回答 -> exit 0（"没答就忽略"）
 *   - 拿到回答                    -> stderr + exit 2（asyncRewake 立即唤醒）
 * 防循环：按 session_id 存状态，同问题不重复、单会话封顶 MAX_ROUNDS 轮。
 *
 * 注意：本 hook 必须配 "asyncRewake": true（见 .claude/settings.json）。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const WebSocket = require("C:/Users/LinyuPu/AppData/Roaming/npm/node_modules/@letta-ai/letta-code/node_modules/ws");

// ---- 配置 ----
const BASE = "ws://127.0.0.1:4500";
const AGENT_ID = "agent-local-6f9c4d2e-1fe5-4d70-b5f5-8079c8864808"; // symbiont-memory（已 pin）
const PROJECT_CWD = "C:/Users/LinyuPu/develop/code/symbiont";
const ASK_TIMEOUT_MS = 110000; // 略小于 settings 里的 hook timeout
const MAX_ROUNDS = 4;
const MAX_APPROVALS = 30;
const OS_LINE = /^\s*OS[:：]\s*(.*?)\s*$/;

function allowStop() {
  process.exit(0); // exit 0 且不 exit2 -> 不唤醒，正常停止
}

function lastAssistantText(transcriptPath) {
  let last = null;
  let raw;
  try {
    raw = fs.readFileSync(transcriptPath, "utf-8");
  } catch {
    return null;
  }
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    let rec;
    try {
      rec = JSON.parse(s);
    } catch {
      continue;
    }
    if (rec.type !== "assistant") continue;
    const msg = rec.message || {};
    if (msg.role !== "assistant") continue;
    const parts = [];
    for (const b of msg.content || []) {
      if (b && typeof b === "object" && b.type === "text") parts.push(b.text || "");
    }
    if (parts.length) last = parts.join("\n");
  }
  return last;
}

function extractOS(text) {
  if (!text) return null;
  let q = null;
  for (const line of text.split(/\r?\n/)) {
    const m = OS_LINE.exec(line);
    if (m) q = m[1].trim();
  }
  return q; // null=无OS行；""=空OS
}

function statePath(sessionId) {
  const id = (sessionId || "default").replace(/[^A-Za-z0-9_-]/g, "_");
  return path.join(os.tmpdir(), `symbiont_os_${id}.json`);
}
function readState(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return { count: 0, last: null };
  }
}

// 对 Letta 跑一轮，拼出完整回答；任何失败 resolve("")。
function askLetta(question) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      try { control.close(); stream.close(); } catch {}
      resolve(v);
    };
    const timer = setTimeout(() => finish(""), ASK_TIMEOUT_MS);

    const control = new WebSocket(`${BASE}/ws?channel=control`);
    const stream = new WebSocket(`${BASE}/ws?channel=stream`);
    let opened = 0;
    let answer = "";
    let approvals = 0;
    let RUNTIME = null;
    const send = (o) => control.send(JSON.stringify(o));

    const handle = (msg) => {
      const t = msg.type;
      if (t === "control_request" && msg.request && msg.request.subtype === "can_use_tool") {
        if (++approvals > MAX_APPROVALS) return finish(answer.trim());
        send({
          type: "input",
          runtime: RUNTIME,
          payload: { kind: "approval_response", request_id: msg.request_id, decision: { behavior: "allow" } },
        });
        return;
      }
      if (t === "runtime_start_response") {
        if (!msg.success || !msg.runtime) return finish("");
        RUNTIME = msg.runtime;
        send({
          type: "input",
          runtime: RUNTIME,
          payload: { kind: "create_message", messages: [{ role: "user", content: question }] },
        });
        return;
      }
      if (t === "stream_delta") {
        const d = msg.delta || {};
        const mt = d.message_type;
        if (mt === "assistant_message") {
          for (const c of d.content || []) if (c && c.type === "text") answer += c.text;
        } else if (mt === "stop_reason") {
          if (d.stop_reason === "requires_approval") return; // 暂停，等审批
          clearTimeout(timer);
          return finish(answer.trim());
        } else if (mt === "loop_error" || mt === "error_message") {
          clearTimeout(timer);
          return finish("");
        }
      }
    };

    const onMsg = (raw) => {
      try { handle(JSON.parse(raw.toString())); } catch {}
    };
    const onOpen = () => {
      if (++opened === 2) {
        send({
          type: "runtime_start",
          request_id: "runtime-1",
          agent_id: AGENT_ID,
          conversation_id: "default",
          cwd: PROJECT_CWD,
          mode: "unrestricted",
          client_info: { name: "os_hook", title: "OS Hook", version: "0.1.0" },
        });
      }
    };
    control.on("open", onOpen);
    stream.on("open", onOpen);
    control.on("message", onMsg);
    stream.on("message", onMsg);
    control.on("error", () => finish(""));
    stream.on("error", () => finish(""));
  });
}

async function main() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, "utf-8") || "{}");
  } catch {
    allowStop();
  }
  const sessionId = input.session_id;
  const tp = input.transcript_path;
  if (!tp) allowStop();

  const q = extractOS(lastAssistantText(tp));
  if (!q) allowStop(); // 无 OS 行或空 OS

  const sp = statePath(sessionId);
  const st = readState(sp);
  if (st.count >= MAX_ROUNDS || st.last === q) allowStop(); // 防循环

  const answer = await askLetta(q);
  if (!answer) allowStop(); // 记忆体没答 -> 忽略

  try {
    fs.writeFileSync(sp, JSON.stringify({ count: st.count + 1, last: q }));
  } catch {}

  // asyncRewake：stderr 作为 system reminder，exit 2 立即唤醒
  process.stderr.write(
      "OS answer: " + answer
  );
  process.exit(2);
}

main();
