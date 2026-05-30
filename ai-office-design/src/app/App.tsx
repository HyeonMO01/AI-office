import { FormEvent, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { OfficeRoom, type RoomEmployee } from "./OfficeRoom";

const API_BASE = "http://127.0.0.1:8000";

// Sprite sheet constants (112×96px = 7 cols × 3 rows, each frame 16×32px)
const FRAME_W = 16;
const FRAME_H = 32;
const SCALE = 4; // 64×128px displayed
const SPRITE_TOTAL_COLS = 7;
const SPRITE_TOTAL_ROWS = 3;
const ROW_DOWN = 0; // facing viewer

// Frame column indices
const FRAMES: Record<string, number[]> = {
  IDLE:     [1],
  WORKING:  [3, 4],
  AWAITING: [5, 6],
  DONE:     [0, 1, 2, 1],
};
const FRAME_FPS: Record<string, number> = {
  IDLE: 1, WORKING: 4, AWAITING: 2, DONE: 3,
};

const EMPLOYEES = [
  { key: "기획", name: "박기획", dept: "PLANNING", color: "#ff6b6b", dark: "#2a0f0f", charIdx: 0, area: "employee_planning" },
  { key: "리서치", name: "이리서치", dept: "RESEARCH", color: "#4ecdc4", dark: "#0f2220", charIdx: 1, area: "employee_research" },
  { key: "번역", name: "김번역", dept: "TRANSLATE", color: "#45b7d1", dark: "#0f1e2a", charIdx: 2, area: "employee_marketing" },
  { key: "분석", name: "최분석", dept: "ANALYSIS", color: "#96ceb4", dark: "#111f1a", charIdx: 3, area: "employee_analysis" },
  { key: "총무", name: "정총무", dept: "ADMIN", color: "#f9ca24", dark: "#241e0a", charIdx: 4, area: "employee_operations" },
  { key: "개발", name: "오개발", dept: "DEV", color: "#a29bfe", dark: "#18162a", charIdx: 5, area: "employee_development" },
  { key: "검수", name: "한검수", dept: "QA", color: "#fd79a8", dark: "#2a1220", charIdx: 0, area: "employee_qa" },
  { key: "배포", name: "서배포", dept: "DEPLOY", color: "#00b894", dark: "#0a1e1a", charIdx: 1, area: "employee_deployment" },
  { key: "집행", name: "임집행", dept: "GROWTH", color: "#e17055", dark: "#2a160f", charIdx: 2, area: "employee_growth" },
  { key: "법무", name: "유법무", dept: "LEGAL", color: "#b2bec3", dark: "#181c1e", charIdx: 3, area: "employee_legal" },
] as const;

type Employee = typeof EMPLOYEES[number];
type EmpStatus = "IDLE" | "WORKING" | "AWAITING" | "DONE";

type TokenSummary = {
  user_key: string;
  display_name: string;
  role: string;
  token_limit: number;
  used_tokens: number;
  remaining_tokens: number;
  by_area: Array<{ area: string; total_tokens: number }>;
};
type OfficeUser = { user_key: string; display_name: string; role: string; token_limit: number; created_at: string };
type OfficeDocument = { title: string; path: string; category: string; created_at: string };
type OfficeHistory = { session_id: string; role: string; content: string; created_at: string };
type OfficeJob = { id: number; job_key: string; title: string; task: string; interval_minutes: number; enabled: number; last_run_at: string | null; next_run_at: string; last_status: string; last_result: string; run_count: number; created_at: string };
type OfficeEvent = { event_type: string; title: string; detail: string; created_at: string };
type OfficeAction = { id: number; action_type: string; title: string; detail: string; command: string; risk_level: string; status: string; requested_by: string; approved_at: string | null; completed_at: string | null; result: string; created_at: string };
type UsageRow = { area: string; model: string; prompt_tokens: number; completion_tokens: number; total_tokens: number };
type Overview = {
  status: { service: string; db_path: string; session_id: string; memory_count: number; auto_office_enabled: boolean };
  user: TokenSummary;
  users: OfficeUser[];
  documents: OfficeDocument[];
  history: OfficeHistory[];
  jobs: OfficeJob[];
  events: OfficeEvent[];
  actions: OfficeAction[];
  usage: UsageRow[];
};
type CommandResponse = { employee: string; result: string; tool_logs: Array<{ employee: string; function: string; result: string }>; token_summary?: TokenSummary };

const EMPTY_OVERVIEW: Overview = {
  status: { service: "offline", db_path: "", session_id: "founder-main", memory_count: 0, auto_office_enabled: false },
  user: { user_key: "founder", display_name: "Founder", role: "founder", token_limit: 0, used_tokens: 0, remaining_tokens: 0, by_area: [] },
  users: [], documents: [], history: [], jobs: [], events: [], actions: [], usage: [],
};

// ── Pixel character — sprite sheet renderer ──────────────────────────
function PixelChar({ charIdx, status }: { charIdx: number; status: EmpStatus }) {
  const [frameIdx, setFrameIdx] = useState(0);

  const frameCols = useMemo(() => FRAMES[status] ?? [1], [status]);

  useEffect(() => {
    setFrameIdx(0);
    if (frameCols.length <= 1) return;
    const ms = 1000 / (FRAME_FPS[status] ?? 2);
    const t = setInterval(() => setFrameIdx((f) => (f + 1) % frameCols.length), ms);
    return () => clearInterval(t);
  }, [frameCols, status]);

  const col = frameCols[frameIdx];
  const row = ROW_DOWN;

  const dispW = FRAME_W * SCALE;
  const dispH = FRAME_H * SCALE;
  const bgW = FRAME_W * SPRITE_TOTAL_COLS * SCALE;
  const bgH = FRAME_H * SPRITE_TOTAL_ROWS * SCALE;
  const bgX = -(col * FRAME_W * SCALE);
  const bgY = -(row * FRAME_H * SCALE);

  return (
    <div
      style={{
        width: dispW,
        height: dispH,
        backgroundImage: `url('/assets/characters/char_${charIdx}.png')`,
        backgroundPosition: `${bgX}px ${bgY}px`,
        backgroundSize: `${bgW}px ${bgH}px`,
        backgroundRepeat: "no-repeat",
        imageRendering: "pixelated",
        flexShrink: 0,
      }}
    />
  );
}

// ── Status LED ───────────────────────────────────────────────────────
const LED_CONFIG: Record<EmpStatus, { color: string; label: string }> = {
  IDLE:    { color: "#333",    label: "IDLE" },
  WORKING: { color: "#00ff41", label: "WORKING" },
  AWAITING:{ color: "#f9ca24", label: "AWAIT" },
  DONE:    { color: "#45b7d1", label: "DONE" },
};

function StatusLED({ status }: { status: EmpStatus }) {
  const { color, label } = LED_CONFIG[status];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <motion.div
        style={{
          width: 7, height: 7,
          background: color,
          boxShadow: status !== "IDLE" ? `0 0 6px ${color}, 0 0 12px ${color}` : "none",
        }}
        animate={status === "WORKING" ? { opacity: [1, 0.2, 1] } : status === "AWAITING" ? { opacity: [1, 0, 1] } : {}}
        transition={{ repeat: Infinity, duration: 0.7 }}
      />
      <span style={{ fontFamily: "'VT323', monospace", fontSize: 15, color, letterSpacing: 1 }}>
        {label}
      </span>
    </div>
  );
}

// ── Employee card ────────────────────────────────────────────────────
function EmployeeCard({
  emp, status, lastAction, tokenUsed, selected, onClick,
}: {
  emp: Employee; status: EmpStatus; lastAction: string; tokenUsed: number; selected: boolean; onClick: () => void;
}) {
  return (
    <motion.div
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.96 }}
      style={{
        position: "relative",
        cursor: "pointer",
        background: emp.dark,
        border: `2px solid ${selected ? emp.color : "#1e2030"}`,
        padding: "10px 8px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 5,
        boxShadow: selected ? `0 0 20px ${emp.color}44, inset 0 0 20px ${emp.color}11` : "none",
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}
    >
      {/* dept badge */}
      <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: emp.color, opacity: 0.75, letterSpacing: 0.5 }}>
        {emp.dept}
      </span>

      <PixelChar charIdx={emp.charIdx} status={status} />

      {/* name */}
      <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: "#e0e0e0", textAlign: "center", lineHeight: 1.6 }}>
        {emp.name}
      </span>

      <StatusLED status={status} />

      {/* last action */}
      <span style={{
        fontFamily: "'VT323', monospace", fontSize: 14, color: "#6a6a8a",
        textAlign: "center", lineHeight: 1.3, minHeight: 32,
        overflow: "hidden", maxHeight: 32,
        display: "block", width: "100%",
      }}>
        {lastAction}
      </span>

      {tokenUsed > 0 && (
        <span style={{ fontFamily: "'VT323', monospace", fontSize: 12, color: "#33334a" }}>
          {tokenUsed.toLocaleString()} tkn
        </span>
      )}

      {/* awaiting badge */}
      {status === "AWAITING" && (
        <motion.div
          animate={{ opacity: [1, 0, 1] }}
          transition={{ repeat: Infinity, duration: 0.5 }}
          style={{
            position: "absolute", top: 6, right: 6,
            background: "#f9ca24", color: "#000",
            fontFamily: "'Press Start 2P', monospace", fontSize: 8,
            padding: "1px 4px",
          }}
        >
          !
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Boss Terminal ────────────────────────────────────────────────────
function BossTerminal({
  command, setCommand, onSubmit, loading, lastResult, sessionId, setSessionId,
}: {
  command: string; setCommand: (v: string) => void;
  onSubmit: (e?: FormEvent) => void; loading: boolean;
  lastResult: CommandResponse | null; sessionId: string; setSessionId: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* header */}
      <div style={{
        fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: "#f9ca24",
        borderBottom: "2px solid #f9ca2433", paddingBottom: 8,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 1 }}>▶</motion.span>
        BOSS TERMINAL
      </div>

      {/* session */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontFamily: "'VT323', monospace", fontSize: 14, color: "#44445a", flexShrink: 0 }}>SESSION:</span>
        <input
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          style={{
            flex: 1, background: "transparent", border: "1px solid #1e2030",
            color: "#6a6a8a", fontFamily: "'VT323', monospace", fontSize: 14,
            padding: "2px 6px", outline: "none", width: 0,
          }}
        />
      </div>

      {/* command form */}
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{
          position: "relative",
          border: `2px solid ${loading ? "#00ff41" : "#1e2030"}`,
          boxShadow: loading ? "0 0 14px #00ff4133" : "none",
          transition: "border-color 0.3s, box-shadow 0.3s",
        }}>
          <div style={{
            position: "absolute", top: 8, left: 8,
            fontFamily: "'VT323', monospace", fontSize: 18, color: "#00ff41",
            pointerEvents: "none", lineHeight: 1,
          }}>
            BOSS&gt;
          </div>
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); } }}
            placeholder="직원들에게 지시를 내려라..."
            style={{
              width: "100%", minHeight: 110, background: "transparent", border: "none",
              color: "#c8b890", fontFamily: "'VT323', monospace", fontSize: 18,
              padding: "8px 8px 8px 74px", outline: "none", resize: "vertical",
              lineHeight: 1.5, boxSizing: "border-box",
            }}
          />
        </div>

        <motion.button
          type="submit"
          disabled={loading || !command.trim()}
          whileHover={!loading ? { scale: 1.02 } : {}}
          whileTap={!loading ? { scale: 0.97 } : {}}
          style={{
            background: loading ? "#00220f" : "#001a0a",
            border: `2px solid ${loading ? "#00ff41" : "#00ff4155"}`,
            color: loading ? "#00ff41" : "#00ff4199",
            fontFamily: "'Press Start 2P', monospace", fontSize: 9,
            padding: "12px 8px", cursor: loading ? "wait" : "pointer",
            letterSpacing: 1, boxShadow: loading ? "0 0 20px #00ff4133" : "none",
            transition: "all 0.3s",
          }}
        >
          {loading ? (
            <motion.span animate={{ opacity: [1, 0.2, 1] }} transition={{ repeat: Infinity, duration: 0.5 }}>
              처리 중...
            </motion.span>
          ) : "[ 지시 하달 ]"}
        </motion.button>
      </form>

      {/* last result */}
      <AnimatePresence>
        {lastResult && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ border: "1px solid #1e2030", padding: 10, maxHeight: 260, overflowY: "auto" }}
          >
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: "#45b7d1", marginBottom: 8 }}>
              ◀ {lastResult.employee} 보고
            </div>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: 16, color: "#c8b890", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {lastResult.result}
            </div>
            {lastResult.tool_logs.length > 0 && (
              <div style={{ marginTop: 10, borderTop: "1px solid #1e2030", paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                {lastResult.tool_logs.map((log, i) => (
                  <div key={i} style={{ fontFamily: "'VT323', monospace", fontSize: 13, color: "#44445a" }}>
                    [{log.function}] {log.result.slice(0, 80)}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Approval queue ───────────────────────────────────────────────────
function ApprovalQueue({
  actions, onApprove, onComplete,
}: {
  actions: OfficeAction[]; onApprove: (id: number) => void; onComplete: (id: number) => void;
}) {
  const pending = actions.filter((a) => a.status === "pending_approval" || a.status === "approved");

  if (pending.length === 0) {
    return (
      <div style={{ border: "1px solid #1e2030", padding: 12, textAlign: "center" }}>
        <span style={{ fontFamily: "'VT323', monospace", fontSize: 18, color: "#33334a" }}>승인 대기 없음</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {pending.map((action) => {
        const isHigh = action.risk_level === "high" || action.risk_level === "critical";
        return (
          <motion.div
            key={action.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            style={{
              border: `2px solid ${isHigh ? "#ff444455" : "#f9ca2455"}`,
              background: isHigh ? "#1a0808" : "#1a1608",
              padding: 10, display: "flex", flexDirection: "column", gap: 6,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: isHigh ? "#ff4444" : "#f9ca24" }}>
                #{action.id} {action.risk_level.toUpperCase()}
              </span>
              <span style={{ fontFamily: "'VT323', monospace", fontSize: 13, color: "#44445a" }}>{action.status}</span>
            </div>
            <span style={{ fontFamily: "'VT323', monospace", fontSize: 17, color: "#c8b890", lineHeight: 1.3 }}>
              {action.title}
            </span>
            {action.detail && (
              <span style={{ fontFamily: "'VT323', monospace", fontSize: 14, color: "#6a6a8a", lineHeight: 1.3 }}>
                {action.detail.slice(0, 120)}{action.detail.length > 120 ? "…" : ""}
              </span>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              {action.status === "pending_approval" && (
                <button
                  onClick={() => onApprove(action.id)}
                  style={{
                    flex: 1, background: "#001a08", border: "2px solid #00ff41",
                    color: "#00ff41", fontFamily: "'Press Start 2P', monospace",
                    fontSize: 8, padding: "7px 4px", cursor: "pointer",
                  }}
                >
                  ✓ 승인
                </button>
              )}
              {action.status !== "completed" && (
                <button
                  onClick={() => onComplete(action.id)}
                  style={{
                    flex: 1, background: "#0e0e1a", border: "2px solid #a29bfe",
                    color: "#a29bfe", fontFamily: "'Press Start 2P', monospace",
                    fontSize: 8, padding: "7px 4px", cursor: "pointer",
                  }}
                >
                  ✓ 완료
                </button>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Event ticker ─────────────────────────────────────────────────────
function EventTicker({ events }: { events: OfficeEvent[] }) {
  if (events.length === 0) return null;
  const text = events.map((e) => `[ ${e.event_type} ]  ${e.title}`).join("    ◆    ");
  const dur = Math.max(20, text.length * 0.1);

  return (
    <div style={{
      height: 30, borderTop: "2px solid #1e2030",
      background: "#050508", overflow: "hidden",
      display: "flex", alignItems: "center", flexShrink: 0,
    }}>
      <span style={{ fontFamily: "'VT323', monospace", fontSize: 16, color: "#00ff41", marginLeft: 12, marginRight: 12, flexShrink: 0 }}>►</span>
      <div style={{ overflow: "hidden", flex: 1, position: "relative" }}>
        <motion.div
          animate={{ x: ["100vw", "-100%"] }}
          transition={{ repeat: Infinity, duration: dur, ease: "linear" }}
          style={{ fontFamily: "'VT323', monospace", fontSize: 17, color: "#44445a", whiteSpace: "nowrap" }}
        >
          {text}
        </motion.div>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────
export default function App() {
  const [overview, setOverview] = useState<Overview>(EMPTY_OVERVIEW);
  const [command, setCommand] = useState("");
  const [sessionId, setSessionId] = useState("founder-main");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState<CommandResponse | null>(null);
  const [selectedEmpKey, setSelectedEmpKey] = useState<string | null>(null);
  const [activeEmpName, setActiveEmpName] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch(
        `${API_BASE}/office/overview?user_key=founder&session_id=${encodeURIComponent(sessionId)}`
      );
      if (!res.ok) throw new Error(await res.text());
      setOverview((await res.json()) as Overview);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "서버 연결 실패");
    }
  }

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(t);
  }, [sessionId]);

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    const task = command.trim();
    if (!task || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, session_id: sessionId, user_key: "founder" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as CommandResponse;
      setLastResult(data);
      setActiveEmpName(data.employee);
      setCommand("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "명령 실행 실패");
    } finally {
      setLoading(false);
    }
  }

  async function approveAction(id: number) {
    const res = await fetch(`${API_BASE}/office/actions/${id}/approve`, { method: "POST" });
    if (res.ok) await refresh();
  }

  async function completeAction(id: number) {
    const result = window.prompt("완료 결과:", "완료");
    if (result === null) return;
    const res = await fetch(
      `${API_BASE}/office/actions/${id}/complete?result=${encodeURIComponent(result)}`,
      { method: "POST" }
    );
    if (res.ok) await refresh();
  }

  function getStatus(emp: Employee): EmpStatus {
    if (loading && activeEmpName === emp.name) return "WORKING";
    const hasPending = overview.actions.some(
      (a) =>
        a.status === "pending_approval" &&
        (a.detail?.includes(emp.name) || a.requested_by?.includes(emp.key))
    );
    if (hasPending) return "AWAITING";
    const hasUsage = overview.usage.some((u) => u.area === emp.area && u.total_tokens > 0);
    if (hasUsage) return "DONE";
    return "IDLE";
  }

  function getLastAction(emp: Employee): string {
    const entry = overview.history.find(
      (h) => h.content?.includes(emp.name) || h.role === emp.key
    );
    if (entry) return entry.content.slice(0, 55) + (entry.content.length > 55 ? "…" : "");
    const usage = overview.usage.find((u) => u.area === emp.area);
    if (usage) return `${usage.total_tokens.toLocaleString()} 토큰 사용`;
    return "대기 중";
  }

  function getTokenUsed(emp: Employee): number {
    return overview.usage
      .filter((u) => u.area === emp.area)
      .reduce((sum, u) => sum + u.total_tokens, 0);
  }

  const pendingCount = overview.actions.filter((a) => a.status === "pending_approval").length;

  const roomEmployees: RoomEmployee[] = EMPLOYEES.map((emp) => ({
    name: emp.name,
    charIdx: emp.charIdx,
    status: getStatus(emp),
    color: emp.color,
  }));
  const tokenRate =
    overview.user.token_limit > 0
      ? Math.min(100, Math.round((overview.user.used_tokens / overview.user.token_limit) * 100))
      : 0;

  const selectedEmployee = EMPLOYEES.find((e) => e.key === selectedEmpKey) ?? null;
  const selectedHistory = selectedEmployee
    ? overview.history
        .filter(
          (h) =>
            h.content?.includes(selectedEmployee.name) || h.role === selectedEmployee.key
        )
        .slice(0, 5)
    : [];

  return (
    <div style={{ minHeight: "100vh", background: "#080812", color: "#c8b890", display: "flex", flexDirection: "column" }}>
      {/* CRT scanlines */}
      <div
        style={{
          position: "fixed", inset: 0,
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)",
          pointerEvents: "none", zIndex: 9999,
        }}
      />

      {/* ── Header ── */}
      <header style={{
        borderBottom: "2px solid #1e2030", padding: "10px 20px",
        display: "flex", alignItems: "center", gap: 16,
        background: "#050508", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <motion.span
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 14, color: "#00ff41" }}
          >
            ◈
          </motion.span>
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 11, color: "#f9ca24" }}>FIZZYLUSH</span>
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 11, color: "#c8b890" }}>AI OFFICE</span>
        </div>

        <div style={{ display: "flex", gap: 20, marginLeft: 8 }}>
          {[
            { label: "직원", value: "10명" },
            { label: "토큰", value: overview.user.used_tokens.toLocaleString() },
            { label: "문서", value: String(overview.documents.length) },
            { label: "이벤트", value: String(overview.events.length) },
            { label: "메모리", value: String(overview.status.memory_count) },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <span style={{ fontFamily: "'VT323', monospace", fontSize: 15, color: "#44445a" }}>{s.label}:</span>
              <span style={{ fontFamily: "'VT323', monospace", fontSize: 18, color: "#c8b890" }}>{s.value}</span>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* AUTO */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <motion.div
            animate={overview.status.auto_office_enabled ? { opacity: [1, 0.2, 1] } : {}}
            transition={{ repeat: Infinity, duration: 1 }}
            style={{
              width: 8, height: 8,
              background: overview.status.auto_office_enabled ? "#00ff41" : "#222",
              boxShadow: overview.status.auto_office_enabled ? "0 0 8px #00ff41" : "none",
            }}
          />
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: overview.status.auto_office_enabled ? "#00ff41" : "#333" }}>
            AUTO
          </span>
        </div>

        {/* pending badge */}
        {pendingCount > 0 && (
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 0.7 }}
            style={{
              background: "#f9ca24", color: "#000",
              fontFamily: "'Press Start 2P', monospace", fontSize: 7,
              padding: "4px 8px",
            }}
          >
            ! {pendingCount} 승인 대기
          </motion.div>
        )}

        <button
          onClick={() => void refresh()}
          style={{
            background: "transparent", border: "2px solid #1e2030",
            color: "#44445a", fontFamily: "'Press Start 2P', monospace",
            fontSize: 7, padding: "6px 10px", cursor: "pointer",
          }}
        >
          ↺ 갱신
        </button>
      </header>

      {/* error */}
      {error && (
        <div style={{
          padding: "6px 20px", background: "#1a0808",
          borderBottom: "1px solid #ff444433",
          fontFamily: "'VT323', monospace", fontSize: 16, color: "#ff4444",
        }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Main ── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 340px", overflow: "hidden" }}>

        {/* Left: Office room (full height) */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Room canvas — fills available space */}
          <div style={{ flex: 1, overflow: "hidden", borderRight: "2px solid #1e2030" }}>
            <OfficeRoom employees={roomEmployees} />
          </div>

          {/* Thin status strip at bottom of room */}
          <div style={{
            borderRight: "2px solid #1e2030",
            borderTop: "1px solid #1e2030",
            padding: "6px 16px",
            display: "flex", gap: 20, flexWrap: "wrap", background: "#060610",
          }}>
            {EMPLOYEES.map((emp) => {
              const st = getStatus(emp);
              const led = { IDLE:"#333", WORKING:"#00ff41", AWAITING:"#f9ca24", DONE:"#45b7d1" }[st];
              return (
                <div key={emp.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <motion.div
                    style={{ width: 6, height: 6, background: led, boxShadow: st !== "IDLE" ? `0 0 6px ${led}` : "none" }}
                    animate={st === "WORKING" ? { opacity: [1,0.2,1] } : st === "AWAITING" ? { opacity:[1,0,1] } : {}}
                    transition={{ repeat: Infinity, duration: 0.8 }}
                  />
                  <span style={{ fontFamily: "'VT323', monospace", fontSize: 15, color: emp.color }}>{emp.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Boss terminal */}
        <div style={{
          borderLeft: "2px solid #1e2030", padding: 16,
          display: "flex", flexDirection: "column", gap: 14,
          overflowY: "auto", background: "#060610",
        }}>
          <BossTerminal
            command={command}
            setCommand={setCommand}
            onSubmit={handleSubmit}
            loading={loading}
            lastResult={lastResult}
            sessionId={sessionId}
            setSessionId={setSessionId}
          />

          {/* Approval section */}
          <div style={{ borderTop: "2px solid #1e2030", paddingTop: 14 }}>
            <div style={{
              fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: "#f9ca24",
              marginBottom: 10, display: "flex", alignItems: "center", gap: 8,
            }}>
              {pendingCount > 0 && (
                <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 0.5 }}>!</motion.span>
              )}
              승인 큐 ({pendingCount})
            </div>
            <ApprovalQueue actions={overview.actions} onApprove={approveAction} onComplete={completeAction} />
          </div>

          {/* Token bar */}
          <div style={{ marginTop: "auto", paddingTop: 10, borderTop: "1px solid #1e2030" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: "#33334a" }}>TOKEN USAGE</span>
              <span style={{ fontFamily: "'VT323', monospace", fontSize: 14, color: "#44445a" }}>{tokenRate}%</span>
            </div>
            <div style={{ height: 5, background: "#1e2030", position: "relative" }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${tokenRate}%` }}
                transition={{ duration: 0.8 }}
                style={{
                  position: "absolute", top: 0, left: 0, height: "100%",
                  background: tokenRate > 80 ? "#ff4444" : "#00ff41",
                  boxShadow: `0 0 8px ${tokenRate > 80 ? "#ff4444" : "#00ff41"}`,
                }}
              />
            </div>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: 12, color: "#33334a", marginTop: 4 }}>
              {overview.user.used_tokens.toLocaleString()} / {overview.user.token_limit.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* ── Event ticker ── */}
      <EventTicker events={overview.events} />
    </div>
  );
}
