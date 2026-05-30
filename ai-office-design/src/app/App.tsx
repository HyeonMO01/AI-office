import { FormEvent, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { OfficeRoom, type RoomEmployee } from "./OfficeRoom";

const API_BASE    = "http://127.0.0.1:8000";
const OFFICE_TOKEN = "mysecret123";
const AUTH_HEADERS = { "X-Office-Token": OFFICE_TOKEN, "Content-Type": "application/json" };

// ── Employee registry ──────────────────────────────────────────────────
const EMPLOYEES = [
  { key: "기획",  name: "박기획",  dept: "기획",   color: "#f87171", charIdx: 0, area: "employee_planning"    },
  { key: "리서치", name: "이리서치", dept: "리서치",  color: "#34d399", charIdx: 1, area: "employee_research"    },
  { key: "번역",  name: "김번역",  dept: "번역",   color: "#60a5fa", charIdx: 2, area: "employee_marketing"   },
  { key: "분석",  name: "최분석",  dept: "분석",   color: "#a78bfa", charIdx: 3, area: "employee_analysis"    },
  { key: "총무",  name: "정총무",  dept: "총무",   color: "#fbbf24", charIdx: 4, area: "employee_operations"  },
  { key: "개발",  name: "오개발",  dept: "개발",   color: "#818cf8", charIdx: 5, area: "employee_development" },
  { key: "검수",  name: "한검수",  dept: "QA",    color: "#fb7185", charIdx: 0, area: "employee_qa"          },
  { key: "배포",  name: "서배포",  dept: "배포",   color: "#2dd4bf", charIdx: 1, area: "employee_deployment"  },
  { key: "집행",  name: "임집행",  dept: "마케팅",  color: "#f97316", charIdx: 2, area: "employee_growth"      },
  { key: "법무",  name: "유법무",  dept: "법무",   color: "#94a3b8", charIdx: 3, area: "employee_legal"       },
] as const;

type Employee = typeof EMPLOYEES[number];
type EmpStatus = "IDLE" | "WORKING" | "AWAITING" | "DONE";

// ── API types ──────────────────────────────────────────────────────────
type TokenSummary   = { user_key:string; display_name:string; role:string; token_limit:number; used_tokens:number; remaining_tokens:number; by_area:Array<{area:string;total_tokens:number}> };
type OfficeHistory  = { session_id:string; role:string; content:string; created_at:string };
type OfficeJob      = { id:number; title:string; task:string; enabled:number; last_run_at:string|null; next_run_at:string; last_status:string; run_count:number; created_at:string };
type OfficeEvent    = { event_type:string; title:string; detail:string; created_at:string };
type OfficeAction   = { id:number; action_type:string; title:string; detail:string; command:string; risk_level:string; status:string; requested_by:string; approved_at:string|null; completed_at:string|null; result:string; created_at:string };
type OfficeUser     = { user_key:string; display_name:string; role:string; token_limit:number; created_at:string };
type OfficeDocument = { title:string; path:string; category:string; created_at:string };
type UsageRow       = { area:string; model:string; prompt_tokens:number; completion_tokens:number; total_tokens:number };
type Overview = {
  status: { service:string; db_path:string; session_id:string; memory_count:number; auto_office_enabled:boolean };
  user: TokenSummary;
  users: OfficeUser[];
  documents: OfficeDocument[];
  history: OfficeHistory[];
  jobs: OfficeJob[];
  events: OfficeEvent[];
  actions: OfficeAction[];
  usage: UsageRow[];
};
type CommandResponse = { employee:string; result:string; tool_logs:Array<{employee:string;function:string;result:string}>; token_summary?:TokenSummary };

const EMPTY: Overview = {
  status: { service:"offline", db_path:"", session_id:"founder-main", memory_count:0, auto_office_enabled:false },
  user: { user_key:"founder", display_name:"Founder", role:"founder", token_limit:0, used_tokens:0, remaining_tokens:0, by_area:[] },
  users:[], documents:[], history:[], jobs:[], events:[], actions:[], usage:[],
};

// ── Design tokens ──────────────────────────────────────────────────────
const C = {
  bg:      "#0a0a0a",
  surface: "#111111",
  card:    "#161616",
  border:  "#262626",
  border2: "#1c1c1c",
  text:    "#ededed",
  muted:   "#6b7280",
  muted2:  "#374151",
  accent:  "#22c55e",
  accentDim:"#166534",
  warn:    "#f59e0b",
  warnDim: "#78350f",
  err:     "#ef4444",
  errDim:  "#7f1d1d",
  blue:    "#3b82f6",
  purple:  "#8b5cf6",
};

const STATUS_COLOR: Record<EmpStatus, string> = {
  IDLE:"#374151", WORKING:C.accent, AWAITING:C.warn, DONE:C.blue,
};
const STATUS_LABEL: Record<EmpStatus, string> = {
  IDLE:"대기", WORKING:"작업 중", AWAITING:"승인 대기", DONE:"완료",
};

// ── Helpers ────────────────────────────────────────────────────────────
function relTime(iso?: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function short(s: string, n = 120) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

// ── Sub-components ─────────────────────────────────────────────────────

function StatBadge({ label, value, accent = false }: { label:string; value:string|number; accent?:boolean }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
      <span style={{ fontSize:11, color:C.muted, letterSpacing:"0.05em", textTransform:"uppercase" }}>{label}</span>
      <span style={{ fontSize:16, fontWeight:600, color: accent ? C.accent : C.text }}>{value}</span>
    </div>
  );
}

function Pill({ color, label }: { color:string; label:string }) {
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:5,
      padding:"2px 8px", borderRadius:99, fontSize:11, fontWeight:500,
      background: color + "18", color, border:`1px solid ${color}30`,
    }}>
      <span style={{ width:5, height:5, borderRadius:99, background:color, display:"inline-block" }} />
      {label}
    </span>
  );
}

function EmployeeRow({
  emp, status, lastAction, tokenUsed, selected, onClick,
}: {
  emp: Employee; status: EmpStatus; lastAction: string; tokenUsed: number; selected: boolean; onClick: () => void;
}) {
  const sc = STATUS_COLOR[status];
  return (
    <button
      onClick={onClick}
      style={{
        width:"100%", display:"flex", alignItems:"center", gap:10,
        padding:"8px 12px", background: selected ? "#1a1a1a" : "transparent",
        border:"none", borderRadius:6, cursor:"pointer", textAlign:"left",
        borderLeft: selected ? `2px solid ${emp.color}` : "2px solid transparent",
        transition:"all 0.15s",
      }}
    >
      <motion.div
        style={{ width:7, height:7, borderRadius:1, background:sc, flexShrink:0 }}
        animate={status==="WORKING" ? { opacity:[1,0.2,1] } : status==="AWAITING" ? { opacity:[1,0,1] } : {}}
        transition={{ repeat:Infinity, duration:0.9 }}
      />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontSize:13, fontWeight:500, color: selected ? emp.color : C.text }}>{emp.name}</span>
          <span style={{ fontSize:11, color:C.muted }}>{emp.dept}</span>
        </div>
        <div style={{ fontSize:11, color:C.muted, marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {lastAction}
        </div>
      </div>
    </button>
  );
}

function ApprovalCard({
  action, onApprove, onComplete,
}: {
  action: OfficeAction; onApprove:(id:number)=>void; onComplete:(id:number)=>void;
}) {
  const isHigh = action.risk_level === "high" || action.risk_level === "critical";
  const bc = isHigh ? C.err : C.warn;
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity:0, y:8 }}
      animate={{ opacity:1, y:0 }}
      style={{
        background: C.card, border:`1px solid ${bc}30`,
        borderRadius:8, overflow:"hidden",
      }}
    >
      {/* top bar */}
      <div style={{ height:2, background: bc }} />

      <div style={{ padding:"12px 14px" }}>
        {/* header row */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:11, fontWeight:600, color:bc, textTransform:"uppercase", letterSpacing:"0.05em" }}>
              #{action.id} {action.risk_level}
            </span>
            <span style={{ fontSize:11, color:C.muted, background:C.muted2+"44", padding:"1px 6px", borderRadius:4 }}>
              {action.action_type}
            </span>
          </div>
          <span style={{ fontSize:11, color:C.muted }}>{relTime(action.created_at)}</span>
        </div>

        {/* title */}
        <div style={{ fontSize:14, fontWeight:500, color:C.text, marginBottom:6, lineHeight:1.4 }}>
          {action.title}
        </div>

        {/* detail */}
        {action.detail && (
          <div style={{ fontSize:12, color:C.muted, lineHeight:1.6, marginBottom:10 }}>
            {expanded ? action.detail : short(action.detail, 100)}
            {action.detail.length > 100 && (
              <button
                onClick={() => setExpanded(e => !e)}
                style={{ background:"none", border:"none", color:C.blue, cursor:"pointer", fontSize:11, padding:"0 4px" }}
              >
                {expanded ? "접기" : "더 보기"}
              </button>
            )}
          </div>
        )}

        {/* actions */}
        <div style={{ display:"flex", gap:6 }}>
          {action.status === "pending_approval" && (
            <button
              onClick={() => onApprove(action.id)}
              style={{
                flex:1, padding:"7px 0", borderRadius:6, border:`1px solid ${C.accent}50`,
                background: C.accentDim+"44", color:C.accent,
                fontSize:12, fontWeight:500, cursor:"pointer",
              }}
            >
              승인
            </button>
          )}
          {action.status !== "completed" && (
            <button
              onClick={() => onComplete(action.id)}
              style={{
                flex:1, padding:"7px 0", borderRadius:6, border:`1px solid ${C.border}`,
                background: C.card, color:C.muted,
                fontSize:12, fontWeight:500, cursor:"pointer",
              }}
            >
              완료 처리
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────
export default function App() {
  const [ov, setOv]               = useState<Overview>(EMPTY);
  const [cmd, setCmd]             = useState("");
  const [session, setSession]     = useState("founder-main");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [lastRes, setLastRes]     = useState<CommandResponse | null>(null);
  const [activeEmp, setActiveEmp] = useState<string | null>(null);
  const [selEmp, setSelEmp]       = useState<string | null>(null);
  const [tab, setTab]             = useState<"office" | "dashboard">("dashboard");

  async function refresh() {
    try {
      const r = await fetch(`${API_BASE}/office/overview?user_key=founder&session_id=${encodeURIComponent(session)}`, {
        headers: AUTH_HEADERS,
      });
      if (!r.ok) throw new Error(await r.text());
      setOv(await r.json());
      setError("");
    } catch(e) { setError(e instanceof Error ? e.message : "서버 연결 실패"); }
  }

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 15000);
    return () => clearInterval(t);
  }, [session]);

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    const task = cmd.trim();
    if (!task || loading) return;
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/command`, {
        method:"POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify({ task, session_id:session, user_key:"founder" }),
      });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json() as CommandResponse;
      setLastRes(d);
      setActiveEmp(d.employee);
      setCmd("");
      await refresh();
    } catch(e) { setError(e instanceof Error ? e.message : "명령 실행 실패"); }
    finally { setLoading(false); }
  }

  async function approve(id: number) {
    await fetch(`${API_BASE}/office/actions/${id}/approve`, { method:"POST", headers: AUTH_HEADERS });
    await refresh();
  }
  async function complete(id: number) {
    const r = window.prompt("완료 메모:", "완료");
    if (r === null) return;
    await fetch(`${API_BASE}/office/actions/${id}/complete?result=${encodeURIComponent(r)}`, { method:"POST", headers: AUTH_HEADERS });
    await refresh();
  }

  function getStatus(emp: Employee): EmpStatus {
    if (loading && activeEmp === emp.name) return "WORKING";
    if (ov.actions.some(a => a.status==="pending_approval" && (a.detail?.includes(emp.name) || a.requested_by?.includes(emp.key)))) return "AWAITING";
    if (ov.usage.some(u => u.area===emp.area && u.total_tokens>0)) return "DONE";
    return "IDLE";
  }
  function getLastAction(emp: Employee): string {
    const h = ov.history.find(h => h.content?.includes(emp.name) || h.role===emp.key);
    if (h) return short(h.content, 50);
    const u = ov.usage.find(u => u.area===emp.area);
    if (u) return `${u.total_tokens.toLocaleString()} 토큰 사용`;
    return "대기 중";
  }
  function getTokenUsed(emp: Employee) {
    return ov.usage.filter(u => u.area===emp.area).reduce((s,u) => s+u.total_tokens, 0);
  }

  const pendingCount = ov.actions.filter(a => a.status==="pending_approval").length;
  const tokenRate = ov.user.token_limit > 0
    ? Math.min(100, Math.round((ov.user.used_tokens / ov.user.token_limit) * 100))
    : 0;

  const selectedEmployee = EMPLOYEES.find(e => e.key === selEmp) ?? null;
  const selectedHistory  = selectedEmployee
    ? ov.history.filter(h => h.content?.includes(selectedEmployee.name)).slice(0, 5)
    : [];

  const roomEmployees: RoomEmployee[] = EMPLOYEES.map(e => ({
    name: e.name, charIdx: e.charIdx, status: getStatus(e), color: e.color,
  }));

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight:"100vh", background:C.bg, color:C.text,
      fontFamily:"Inter, system-ui, -apple-system, sans-serif",
      display:"flex", flexDirection:"column", fontSize:14,
    }}>

      {/* ── Header ── */}
      <header style={{
        height:52, borderBottom:`1px solid ${C.border}`,
        display:"flex", alignItems:"center", gap:16, padding:"0 20px",
        background:C.surface, flexShrink:0,
      }}>
        {/* Logo */}
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <motion.div
            animate={{ opacity:[1,0.4,1] }}
            transition={{ repeat:Infinity, duration:2 }}
            style={{ width:8, height:8, borderRadius:2, background:C.accent }}
          />
          <span style={{ fontWeight:700, fontSize:14, letterSpacing:"-0.02em" }}>
            FIZZYLUSH<span style={{ color:C.muted, fontWeight:400 }}> AI OFFICE</span>
          </span>
        </div>

        {/* Tabs */}
        <div style={{
          display:"flex", gap:2, background:C.bg, borderRadius:8, padding:3,
          border:`1px solid ${C.border}`,
        }}>
          {(["dashboard","office"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding:"4px 12px", borderRadius:6, border:"none", cursor:"pointer",
                fontSize:12, fontWeight:500,
                background: tab===t ? C.surface : "transparent",
                color: tab===t ? C.text : C.muted,
                transition:"all 0.15s",
              }}
            >
              {t === "dashboard" ? "대시보드" : "오피스 뷰"}
            </button>
          ))}
        </div>

        <div style={{ flex:1 }} />

        {/* Stats */}
        <div style={{ display:"flex", gap:24, alignItems:"center" }}>
          <StatBadge label="토큰" value={ov.user.used_tokens.toLocaleString()} />
          <StatBadge label="문서" value={ov.documents.length} />
          <StatBadge label="이벤트" value={ov.events.length} />
        </div>

        {/* AUTO */}
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <motion.div
            style={{ width:6, height:6, borderRadius:99, background: ov.status.auto_office_enabled ? C.accent : C.muted2 }}
            animate={ov.status.auto_office_enabled ? { opacity:[1,0.3,1] } : {}}
            transition={{ repeat:Infinity, duration:1.5 }}
          />
          <span style={{ fontSize:11, color:C.muted }}>AUTO</span>
        </div>

        {/* Pending badge */}
        {pendingCount > 0 && (
          <motion.div
            animate={{ scale:[1,1.05,1] }}
            transition={{ repeat:Infinity, duration:1.2 }}
            style={{
              background: C.warnDim, color:C.warn, border:`1px solid ${C.warn}40`,
              padding:"3px 10px", borderRadius:99, fontSize:11, fontWeight:600,
            }}
          >
            {pendingCount} 승인 대기
          </motion.div>
        )}

        <button
          onClick={() => void refresh()}
          style={{
            background:"transparent", border:`1px solid ${C.border}`,
            color:C.muted, borderRadius:6, padding:"4px 10px",
            fontSize:11, cursor:"pointer",
          }}
        >
          새로고침
        </button>
      </header>

      {/* Error */}
      {error && (
        <div style={{
          padding:"8px 20px", background:C.errDim, borderBottom:`1px solid ${C.err}30`,
          fontSize:12, color:C.err,
        }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Tab content ── */}
      <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>

        {/* ── OFFICE VIEW TAB ── */}
        {tab === "office" && (
          <div style={{ flex:1, overflow:"hidden" }}>
            <OfficeRoom employees={roomEmployees} />
          </div>
        )}

        {/* ── DASHBOARD TAB ── */}
        {tab === "dashboard" && (
          <div style={{
            flex:1, display:"grid",
            gridTemplateColumns:"260px 1fr 320px",
            overflow:"hidden",
          }}>

            {/* LEFT — Employee list */}
            <div style={{
              borderRight:`1px solid ${C.border}`,
              display:"flex", flexDirection:"column", overflow:"hidden",
            }}>
              <div style={{
                padding:"12px 14px 8px",
                borderBottom:`1px solid ${C.border2}`,
                fontSize:11, fontWeight:600, color:C.muted,
                letterSpacing:"0.07em", textTransform:"uppercase",
              }}>
                직원 ({EMPLOYEES.length})
              </div>
              <div style={{ flex:1, overflowY:"auto", padding:"6px 4px" }}>
                {EMPLOYEES.map(emp => (
                  <EmployeeRow
                    key={emp.key}
                    emp={emp}
                    status={getStatus(emp)}
                    lastAction={getLastAction(emp)}
                    tokenUsed={getTokenUsed(emp)}
                    selected={selEmp === emp.key}
                    onClick={() => setSelEmp(selEmp===emp.key ? null : emp.key)}
                  />
                ))}
              </div>

              {/* Token bar */}
              <div style={{ padding:"12px 14px", borderTop:`1px solid ${C.border2}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                  <span style={{ fontSize:11, color:C.muted }}>토큰 사용량</span>
                  <span style={{ fontSize:11, color:C.muted }}>{tokenRate}%</span>
                </div>
                <div style={{ height:3, background:C.border, borderRadius:99, overflow:"hidden" }}>
                  <motion.div
                    initial={{ width:0 }}
                    animate={{ width:`${tokenRate}%` }}
                    transition={{ duration:0.8 }}
                    style={{
                      height:"100%",
                      background: tokenRate > 80 ? C.err : C.accent,
                      borderRadius:99,
                    }}
                  />
                </div>
                <div style={{ fontSize:10, color:C.muted2, marginTop:4 }}>
                  {ov.user.used_tokens.toLocaleString()} / {ov.user.token_limit.toLocaleString()}
                </div>
              </div>
            </div>

            {/* CENTER — Command + Result */}
            <div style={{
              display:"flex", flexDirection:"column",
              borderRight:`1px solid ${C.border}`,
              overflow:"hidden",
            }}>
              {/* Command input */}
              <div style={{
                padding:16, borderBottom:`1px solid ${C.border2}`,
                flexShrink:0,
              }}>
                <div style={{
                  fontSize:11, fontWeight:600, color:C.muted,
                  letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:8,
                }}>
                  지시하기
                </div>
                <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <div style={{ position:"relative" }}>
                    <textarea
                      value={cmd}
                      onChange={e => setCmd(e.target.value)}
                      onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); void handleSubmit(); } }}
                      placeholder="AI 직원들에게 지시를 내리세요 (Enter로 전송)"
                      style={{
                        width:"100%", minHeight:88, background:C.card,
                        border:`1px solid ${loading ? C.accent+"60" : C.border}`,
                        borderRadius:8, color:C.text, resize:"vertical",
                        padding:"10px 12px", fontSize:13, lineHeight:1.6,
                        outline:"none", boxSizing:"border-box",
                        transition:"border-color 0.2s",
                        fontFamily:"inherit",
                      }}
                    />
                    {/* Session input */}
                    <div style={{
                      position:"absolute", bottom:8, right:8,
                      display:"flex", alignItems:"center", gap:4,
                    }}>
                      <span style={{ fontSize:10, color:C.muted }}>세션:</span>
                      <input
                        value={session}
                        onChange={e => setSession(e.target.value)}
                        style={{
                          width:100, background:"transparent", border:"none",
                          color:C.muted, fontSize:10, outline:"none",
                        }}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !cmd.trim()}
                    style={{
                      padding:"9px 0", borderRadius:7, border:"none", cursor: loading ? "wait" : "pointer",
                      background: loading ? C.accentDim : C.accent,
                      color: "#000", fontSize:13, fontWeight:600,
                      opacity: (!loading && !cmd.trim()) ? 0.4 : 1,
                      transition:"all 0.15s",
                    }}
                  >
                    {loading
                      ? <motion.span animate={{ opacity:[1,0.4,1] }} transition={{ repeat:Infinity, duration:0.6 }}>처리 중…</motion.span>
                      : "지시 보내기"
                    }
                  </button>
                </form>
              </div>

              {/* Employee detail (when selected) */}
              <AnimatePresence>
                {selectedEmployee && (
                  <motion.div
                    initial={{ opacity:0, height:0 }}
                    animate={{ opacity:1, height:"auto" }}
                    exit={{ opacity:0, height:0 }}
                    style={{
                      borderBottom:`1px solid ${C.border2}`,
                      overflow:"hidden", flexShrink:0,
                    }}
                  >
                    <div style={{ padding:"12px 16px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                        <span style={{ fontSize:13, fontWeight:600, color:selectedEmployee.color }}>
                          {selectedEmployee.name}
                        </span>
                        <Pill color={STATUS_COLOR[getStatus(selectedEmployee)]} label={STATUS_LABEL[getStatus(selectedEmployee)]} />
                        <button
                          onClick={() => setSelEmp(null)}
                          style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", marginLeft:"auto", fontSize:16 }}
                        >×</button>
                      </div>
                      {selectedHistory.length > 0 ? (
                        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                          {selectedHistory.map((h,i) => (
                            <div key={i} style={{
                              fontSize:12, color:C.muted, lineHeight:1.6,
                              borderLeft:`2px solid ${selectedEmployee.color}40`,
                              paddingLeft:10,
                            }}>
                              {short(h.content, 160)}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ fontSize:12, color:C.muted2 }}>아직 기록된 작업이 없습니다.</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Result */}
              <div style={{ flex:1, overflowY:"auto", padding:16 }}>
                {lastRes ? (
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                      <span style={{ fontSize:11, color:C.muted, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.07em" }}>
                        결과
                      </span>
                      <span style={{ fontSize:11, color:C.blue, background:C.blue+"15", padding:"1px 8px", borderRadius:99 }}>
                        {lastRes.employee}
                      </span>
                    </div>
                    <div style={{
                      fontSize:13, color:C.text, lineHeight:1.8,
                      whiteSpace:"pre-wrap", background:C.card,
                      border:`1px solid ${C.border}`, borderRadius:8,
                      padding:"12px 14px",
                    }}>
                      {lastRes.result}
                    </div>
                    {lastRes.tool_logs.length > 0 && (
                      <div style={{ marginTop:12 }}>
                        <div style={{ fontSize:11, color:C.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.07em" }}>
                          도구 호출 ({lastRes.tool_logs.length})
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                          {lastRes.tool_logs.map((l,i) => (
                            <div key={i} style={{
                              fontSize:11, color:C.muted,
                              background:C.card, border:`1px solid ${C.border}`,
                              borderRadius:6, padding:"6px 10px",
                              display:"flex", gap:8,
                            }}>
                              <span style={{ color:C.purple, fontFamily:"monospace" }}>{l.function}</span>
                              <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                {short(l.result, 80)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:8 }}>
                    <div style={{ fontSize:24 }}>⌨️</div>
                    <p style={{ fontSize:13, color:C.muted, textAlign:"center" }}>
                      지시를 입력하면<br />AI 직원들이 실행합니다
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT — Approvals + Activity */}
            <div style={{ display:"flex", flexDirection:"column", overflow:"hidden" }}>
              {/* Approvals */}
              <div style={{ flex:1, overflowY:"auto", padding:14 }}>
                <div style={{
                  fontSize:11, fontWeight:600, color:C.muted,
                  letterSpacing:"0.07em", textTransform:"uppercase",
                  marginBottom:10, display:"flex", alignItems:"center", gap:6,
                }}>
                  승인 큐
                  {pendingCount > 0 && (
                    <span style={{
                      background:C.warnDim, color:C.warn,
                      borderRadius:99, padding:"1px 6px", fontSize:10,
                    }}>
                      {pendingCount}
                    </span>
                  )}
                </div>

                {ov.actions.filter(a => a.status==="pending_approval" || a.status==="approved").length === 0 ? (
                  <div style={{
                    padding:"24px 0", textAlign:"center",
                    fontSize:12, color:C.muted2,
                  }}>
                    승인 대기 항목이 없습니다
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {ov.actions
                      .filter(a => a.status==="pending_approval" || a.status==="approved")
                      .map(a => (
                        <ApprovalCard key={a.id} action={a} onApprove={approve} onComplete={complete} />
                      ))}
                  </div>
                )}
              </div>

              {/* Recent events */}
              <div style={{ borderTop:`1px solid ${C.border}`, padding:14, flexShrink:0, maxHeight:200, overflowY:"auto" }}>
                <div style={{
                  fontSize:11, fontWeight:600, color:C.muted,
                  letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:8,
                }}>
                  최근 이벤트
                </div>
                {ov.events.length === 0 ? (
                  <p style={{ fontSize:12, color:C.muted2 }}>이벤트 없음</p>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    {ov.events.slice(0, 6).map((ev, i) => (
                      <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                        <span style={{
                          fontSize:10, color:C.muted, background:C.muted2+"33",
                          padding:"1px 5px", borderRadius:4, flexShrink:0, marginTop:1,
                        }}>
                          {ev.event_type}
                        </span>
                        <span style={{ fontSize:12, color:C.muted, lineHeight:1.4, flex:1 }}>
                          {short(ev.title, 50)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
