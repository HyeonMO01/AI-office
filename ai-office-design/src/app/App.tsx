import { FormEvent, useEffect, useMemo, useState } from "react";

const API_BASE = "http://127.0.0.1:8000";

type TokenSummary = {
  user_key: string;
  display_name: string;
  role: string;
  token_limit: number;
  used_tokens: number;
  remaining_tokens: number;
  by_area: Array<{ area: string; total_tokens: number }>;
};

type OfficeUser = {
  user_key: string;
  display_name: string;
  role: string;
  token_limit: number;
  created_at: string;
};

type OfficeDocument = {
  title: string;
  path: string;
  category: string;
  created_at: string;
};

type OfficeHistory = {
  session_id: string;
  role: string;
  content: string;
  created_at: string;
};

type OfficeJob = {
  id: number;
  job_key: string;
  title: string;
  task: string;
  interval_minutes: number;
  enabled: number;
  last_run_at: string | null;
  next_run_at: string;
  last_status: string;
  last_result: string;
  run_count: number;
  created_at: string;
};

type OfficeEvent = {
  event_type: string;
  title: string;
  detail: string;
  created_at: string;
};

type OfficeAction = {
  id: number;
  action_type: string;
  title: string;
  detail: string;
  command: string;
  risk_level: string;
  status: string;
  requested_by: string;
  approved_at: string | null;
  completed_at: string | null;
  result: string;
  created_at: string;
};

type UsageRow = {
  area: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

type Overview = {
  status: {
    service: string;
    db_path: string;
    session_id: string;
    memory_count: number;
    auto_office_enabled: boolean;
  };
  user: TokenSummary;
  users: OfficeUser[];
  documents: OfficeDocument[];
  history: OfficeHistory[];
  jobs: OfficeJob[];
  events: OfficeEvent[];
  actions: OfficeAction[];
  usage: UsageRow[];
};

type CommandResponse = {
  employee: string;
  result: string;
  tool_logs: Array<{ employee: string; function: string; result: string }>;
  token_summary?: TokenSummary;
};

const EMPTY_OVERVIEW: Overview = {
  status: {
    service: "offline",
    db_path: "",
    session_id: "founder-main",
    memory_count: 0,
    auto_office_enabled: false,
  },
  user: {
    user_key: "founder",
    display_name: "Founder",
    role: "founder",
    token_limit: 0,
    used_tokens: 0,
    remaining_tokens: 0,
    by_area: [],
  },
  users: [],
  documents: [],
  history: [],
  jobs: [],
  events: [],
  actions: [],
  usage: [],
};

function formatTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function short(text: string, max = 140) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="card">
      <div className="cardHeader">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function App() {
  const [overview, setOverview] = useState<Overview>(EMPTY_OVERVIEW);
  const [command, setCommand] = useState("");
  const [sessionId, setSessionId] = useState("founder-main");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState<CommandResponse | null>(null);

  const tokenRate = useMemo(() => {
    const limit = overview.user.token_limit || 1;
    return Math.min(100, Math.round((overview.user.used_tokens / limit) * 100));
  }, [overview.user.token_limit, overview.user.used_tokens]);

  async function refresh() {
    try {
      const res = await fetch(`${API_BASE}/office/overview?user_key=founder&session_id=${encodeURIComponent(sessionId)}`);
      if (!res.ok) throw new Error(await res.text());
      setOverview((await res.json()) as Overview);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "사무실 서버에 연결하지 못했습니다.");
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [sessionId]);

  async function submit(event?: FormEvent) {
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
      setLastResult((await res.json()) as CommandResponse);
      setCommand("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "명령 실행에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function runJob(jobId: number) {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/office/jobs/${jobId}/run`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "자동 업무 실행에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleJob(job: OfficeJob) {
    const enabled = job.enabled ? "false" : "true";
    try {
      const res = await fetch(`${API_BASE}/office/jobs/${job.id}/toggle?enabled=${enabled}`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "자동 업무 상태 변경에 실패했습니다.");
    }
  }

  async function approveAction(actionId: number) {
    try {
      const res = await fetch(`${API_BASE}/office/actions/${actionId}/approve`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "승인 처리에 실패했습니다.");
    }
  }

  async function completeAction(actionId: number) {
    try {
      const result = window.prompt("완료 결과를 적어주세요.", "완료");
      if (result === null) return;
      const res = await fetch(`${API_BASE}/office/actions/${actionId}/complete?result=${encodeURIComponent(result)}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "완료 처리에 실패했습니다.");
    }
  }

  return (
    <div className="page">
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; }
        button, input, textarea { font: inherit; }
        .page {
          min-height: 100vh;
          background: #101217;
          color: #e7e0d2;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          letter-spacing: 0;
        }
        .topbar {
          height: 56px;
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 0 20px;
          border-bottom: 1px solid #2a2e37;
          background: #151821;
        }
        .brand { font-weight: 700; font-size: 18px; color: #f0c66a; }
        .muted { color: #9ca3af; font-size: 13px; }
        .pill {
          border: 1px solid #343a46;
          background: #1d222d;
          color: #d8dee9;
          padding: 6px 9px;
          border-radius: 6px;
          font-size: 13px;
        }
        .layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 420px;
          gap: 16px;
          padding: 16px;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        .stack { display: grid; gap: 12px; }
        .card {
          background: #181c25;
          border: 1px solid #2b313d;
          border-radius: 8px;
          overflow: hidden;
        }
        .cardHeader {
          min-height: 42px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          border-bottom: 1px solid #2b313d;
        }
        h1, h2, h3, p { margin: 0; }
        h2 { font-size: 14px; color: #f0c66a; }
        .metric {
          padding: 14px;
          display: grid;
          gap: 6px;
        }
        .metric strong { font-size: 28px; color: #ffffff; }
        .progress {
          height: 8px;
          background: #0f1218;
          border-radius: 999px;
          overflow: hidden;
        }
        .progress span {
          display: block;
          height: 100%;
          width: var(--value);
          background: #f0c66a;
        }
        .table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .table th, .table td {
          padding: 9px 10px;
          border-bottom: 1px solid #272d38;
          text-align: left;
          vertical-align: top;
        }
        .table th { color: #9ca3af; font-weight: 600; }
        .scroll { max-height: 300px; overflow: auto; }
        .list { display: grid; }
        .item {
          padding: 10px 12px;
          border-bottom: 1px solid #272d38;
          display: grid;
          gap: 5px;
        }
        .item:last-child { border-bottom: 0; }
        .status {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          padding: 3px 7px;
          border-radius: 999px;
          border: 1px solid #384152;
          color: #cbd5e1;
          font-size: 12px;
        }
        .status.ok { color: #86efac; border-color: #22543a; }
        .status.err { color: #fca5a5; border-color: #7f1d1d; }
        .btn {
          height: 32px;
          border: 1px solid #3b4658;
          background: #222938;
          color: #e7e0d2;
          border-radius: 6px;
          padding: 0 10px;
          cursor: pointer;
        }
        .btn.primary { background: #735c23; border-color: #9b7b2e; color: #fff7dc; }
        .btn:disabled { opacity: .55; cursor: wait; }
        .input, .textarea {
          width: 100%;
          border: 1px solid #333b4b;
          background: #11151d;
          color: #f8fafc;
          border-radius: 6px;
          padding: 9px 10px;
          outline: none;
        }
        .textarea { min-height: 116px; resize: vertical; line-height: 1.45; }
        .error {
          padding: 10px 12px;
          border: 1px solid #7f1d1d;
          background: #2a1215;
          color: #fecaca;
          border-radius: 8px;
          margin: 0 16px 12px;
        }
        .result {
          white-space: pre-wrap;
          font-size: 13px;
          line-height: 1.55;
          color: #d7dde8;
          padding: 12px;
          max-height: 280px;
          overflow: auto;
        }
        @media (max-width: 1100px) {
          .layout { grid-template-columns: 1fr; }
          .grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <header className="topbar">
        <div className="brand">FIZZYLUSH AI OFFICE</div>
        <div className="muted">운영 현황판</div>
        <div style={{ flex: 1 }} />
        <span className={overview.status.auto_office_enabled ? "status ok" : "status"}>자동업무 {overview.status.auto_office_enabled ? "ON" : "OFF"}</span>
        <input className="input" style={{ width: 160 }} value={sessionId} onChange={(event) => setSessionId(event.target.value)} />
        <button className="btn" onClick={() => void refresh()}>새로고침</button>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <main className="layout">
        <div className="stack">
          <div className="grid">
            <Card title="사용자">
              <div className="metric">
                <strong>{overview.users.length}</strong>
                <span className="muted">등록된 사무실 사용자</span>
              </div>
            </Card>
            <Card title="토큰">
              <div className="metric">
                <strong>{overview.user.used_tokens.toLocaleString()}</strong>
                <span className="muted">사용 / {overview.user.token_limit.toLocaleString()}</span>
                <div className="progress" style={{ "--value": `${tokenRate}%` } as React.CSSProperties}>
                  <span />
                </div>
              </div>
            </Card>
            <Card title="문서">
              <div className="metric">
                <strong>{overview.documents.length}</strong>
                <span className="muted">최근 저장 문서</span>
              </div>
            </Card>
          </div>

          <Card title="자동 업무">
            <div className="scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>업무</th>
                    <th>상태</th>
                    <th>다음 실행</th>
                    <th>횟수</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {overview.jobs.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <strong>{job.title}</strong>
                        <div className="muted">{short(job.task, 120)}</div>
                      </td>
                      <td>
                        <span className={job.last_status === "error" ? "status err" : "status ok"}>
                          {job.enabled ? job.last_status : "disabled"}
                        </span>
                      </td>
                      <td>{formatTime(job.next_run_at)}</td>
                      <td>{job.run_count}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="btn" disabled={loading} onClick={() => void runJob(job.id)}>지금 실행</button>{" "}
                        <button className="btn" onClick={() => void toggleJob(job)}>{job.enabled ? "끄기" : "켜기"}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="실행/승인 대기">
            <div className="scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>작업</th>
                    <th>종류</th>
                    <th>위험도</th>
                    <th>상태</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {overview.actions.map((action) => (
                    <tr key={action.id}>
                      <td>
                        <strong>#{action.id} {action.title}</strong>
                        <div className="muted">{short(action.detail, 150)}</div>
                        {action.command ? <div className="muted">{action.command}</div> : null}
                      </td>
                      <td>{action.action_type}</td>
                      <td>
                        <span className={action.risk_level === "high" || action.risk_level === "critical" ? "status err" : "status"}>
                          {action.risk_level}
                        </span>
                      </td>
                      <td>{action.status}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {action.status === "pending_approval" ? (
                          <button className="btn" onClick={() => void approveAction(action.id)}>승인</button>
                        ) : null}{" "}
                        {action.status !== "completed" ? (
                          <button className="btn" onClick={() => void completeAction(action.id)}>완료</button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid">
            <Card title="사용자 목록">
              <div className="scroll">
                <table className="table">
                  <tbody>
                    {overview.users.map((user) => (
                      <tr key={user.user_key}>
                        <td>{user.display_name}</td>
                        <td className="muted">{user.role}</td>
                        <td>{user.token_limit.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="토큰 사용 영역">
              <div className="scroll">
                <table className="table">
                  <tbody>
                    {overview.usage.map((row) => (
                      <tr key={`${row.area}-${row.model}`}>
                        <td>{row.area}</td>
                        <td className="muted">{row.model}</td>
                        <td>{row.total_tokens.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="최근 문서">
              <div className="scroll list">
                {overview.documents.map((doc) => (
                  <div className="item" key={`${doc.path}-${doc.created_at}`}>
                    <strong>{doc.title}</strong>
                    <span className="muted">{doc.category} · {formatTime(doc.created_at)}</span>
                    <span className="muted">{doc.path}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid">
            <Card title="사무실 이벤트">
              <div className="scroll list">
                {overview.events.map((event) => (
                  <div className="item" key={`${event.created_at}-${event.title}`}>
                    <span className="status">{event.event_type}</span>
                    <strong>{event.title}</strong>
                    <span className="muted">{formatTime(event.created_at)}</span>
                    {event.detail ? <span className="muted">{short(event.detail, 180)}</span> : null}
                  </div>
                ))}
              </div>
            </Card>

            <Card title="최근 대화/작업 기록">
              <div className="scroll list">
                {overview.history.map((row) => (
                  <div className="item" key={`${row.created_at}-${row.role}-${row.content.slice(0, 20)}`}>
                    <span className="muted">{row.session_id} · {row.role} · {formatTime(row.created_at)}</span>
                    <span>{short(row.content, 220)}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="데이터베이스">
              <div className="metric">
                <span className="muted">SQLite 파일</span>
                <strong style={{ fontSize: 15, overflowWrap: "anywhere" }}>{overview.status.db_path || "-"}</strong>
                <span className="muted">메모리 메시지 {overview.status.memory_count}개</span>
              </div>
            </Card>
          </div>
        </div>

        <aside className="stack">
          <Card title="직접 지시">
            <form onSubmit={submit} className="stack" style={{ padding: 12 }}>
              <textarea
                className="textarea"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="예: 이번 주 fizzylush 운영 리스크와 해야 할 일을 정리해줘."
              />
              <button className="btn primary" disabled={loading || !command.trim()} type="submit">
                {loading ? "작업 중" : "사무실에 지시"}
              </button>
            </form>
          </Card>

          <Card title="최근 결과">
            <div className="result">{lastResult?.result || "아직 직접 실행한 결과가 없습니다."}</div>
          </Card>

          <Card title="도구 호출">
            <div className="scroll list">
              {(lastResult?.tool_logs || []).map((tool, index) => (
                <div className="item" key={`${tool.function}-${index}`}>
                  <strong>{tool.function}</strong>
                  <span className="muted">{tool.employee}</span>
                  <span>{short(tool.result, 180)}</span>
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </main>
    </div>
  );
}
