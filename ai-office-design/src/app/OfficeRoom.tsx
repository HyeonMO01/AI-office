import { useEffect, useRef } from "react";

export type EmpStatus = "IDLE" | "WORKING" | "AWAITING" | "DONE";
export interface RoomEmployee {
  name: string; charIdx: number; status: EmpStatus; color: string;
}

// ── Canvas ─────────────────────────────────────────────────────────────
const S  = 3;   // character pixel scale
const FS = 2;   // furniture pixel scale
const T  = 16 * S;   // 48px tile
const CW = 960;
const CH = 480;

// Character sprite: 16×32 per frame, sheet 7col × 3row
const FW  = 16; const FH  = 32;
const CRW = FW * S;  // 48
const CRH = FH * S;  // 96

const ROW_DOWN = 0;
const ROW_UP   = 1;
const ROW_SIDE = 2;

// Furniture sizes (native px × FS)
const DW  = 48 * FS; const DH  = 32 * FS; // Desk front  96×64
const PW  = 16 * S;  const PH  = 32 * S;  // PC          48×96
const SFW = 32 * FS; const SFH = 16 * FS; // Sofa front  64×32
const WBW = 32 * FS; const WBH = 32 * FS; // Whiteboard  64×64
const CLKW = 16 * FS; const CLKH = 32 * FS; // Clock     32×64
const CHW = 16 * FS; const CHH = 16 * FS; // Cushioned chair 32×32
const PLW = 16 * S;  const PLH = 32 * S;  // Plant       48×96
const BSW = 32 * S;  const BSH = 16 * S;  // Bookshelf   96×48

// Walk animation
const WALK_FRAMES = [0, 1, 2, 1];
const WALK_SPEED  = 2.0;

// ── Home positions ────────────────────────────────────────────────────
const HOME_POSITIONS = [
  { x: 90,  y: 160 }, { x: 250, y: 160 }, { x: 430, y: 160 },
  { x: 620, y: 160 }, { x: 810, y: 160 },
  { x: 90,  y: 320 }, { x: 250, y: 320 }, { x: 430, y: 320 },
  { x: 620, y: 320 }, { x: 810, y: 320 },
];

// Wander / break spots (open floor area)
const WANDER_SPOTS = [
  { x: 480, y: 420 }, { x: 160, y: 400 }, { x: 790, y: 400 },
  { x: 330, y: 370 }, { x: 630, y: 370 }, { x: 480, y: 240 },
  { x: 140, y: 250 }, { x: 820, y: 250 }, { x: 480, y: 445 },
];

// ── Speech bubbles ────────────────────────────────────────────────────
const BUBBLES: Record<string, string[]> = {
  working:  ["타이핑 중...", "분석 중 🔍", "열심히!", "집중 💪", "거의 다 됐다!", "작성 중..."],
  awaiting: ["승인 기다리는 중...", "결재 언제? 🕐", "대기 중..."],
  done:     ["완료! 🎉", "끝났다!", "다음 업무는?", "잘 됐어!"],
  break:    ["잠깐 쉬는 중~", "커피 마시고 싶다 ☕", "배고프다 🍜",
             "스트레칭!", "하아... 졸려 😪", "점심 뭐 먹지?"],
};

// ── Agent state ───────────────────────────────────────────────────────
type AgentMode = "working" | "idle_home" | "leaving" | "wandering" | "returning";

interface Agent {
  x: number; y: number;
  hx: number; hy: number;
  tx: number; ty: number;
  mode: AgentMode;
  countdown: number;
  walkPhase: number; walkTimer: number;
  facing: number; flipX: boolean;
  bubble: string | null; bubbleLife: number;
}

function makeAgents(): Agent[] {
  return HOME_POSITIONS.map(({ x, y }) => ({
    x, y, hx: x, hy: y, tx: x, ty: y,
    mode: "idle_home",
    countdown: 60 + Math.floor(Math.random() * 80),
    walkPhase: 0, walkTimer: 0,
    facing: ROW_DOWN, flipX: false,
    bubble: null, bubbleLife: 0,
  }));
}

function tickAgent(a: Agent, status: EmpStatus) {
  if (status === "WORKING" || status === "AWAITING") {
    if (a.mode !== "working") {
      a.tx = a.hx; a.ty = a.hy; a.mode = "returning";
    }
  }

  const dx = a.tx - a.x;
  const dy = a.ty - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const moving = dist > 1.5;

  if (moving) {
    const spd = Math.min(WALK_SPEED, dist);
    a.x += (dx / dist) * spd;
    a.y += (dy / dist) * spd;
    if (Math.abs(dx) > Math.abs(dy)) {
      a.facing = ROW_SIDE; a.flipX = dx < 0;
    } else {
      a.facing = dy > 0 ? ROW_DOWN : ROW_UP; a.flipX = false;
    }
    a.walkTimer++;
    if (a.walkTimer >= 3) { a.walkTimer = 0; a.walkPhase = (a.walkPhase + 1) % 4; }
  } else {
    a.x = a.tx; a.y = a.ty;
    if (a.mode === "leaving") {
      a.mode = "wandering";
      a.countdown = 50 + Math.floor(Math.random() * 90);
      a.facing = ROW_DOWN;
    } else if (a.mode === "returning") {
      a.mode = status === "WORKING" || status === "AWAITING" ? "working" : "idle_home";
      a.facing = ROW_UP;
      a.countdown = 80 + Math.floor(Math.random() * 100);
    }
  }

  if (!moving) {
    a.countdown--;
    if (a.countdown <= 0) {
      if ((a.mode === "idle_home" || a.mode === "working") &&
          status !== "WORKING" && status !== "AWAITING") {
        const spot = WANDER_SPOTS[Math.floor(Math.random() * WANDER_SPOTS.length)];
        a.tx = spot.x; a.ty = spot.y; a.mode = "leaving";
      } else if (a.mode === "wandering") {
        a.tx = a.hx; a.ty = a.hy; a.mode = "returning";
      } else {
        a.countdown = 60 + Math.floor(Math.random() * 60);
      }
    }
  }

  if (a.bubbleLife > 0) {
    a.bubbleLife--;
    if (a.bubbleLife === 0) a.bubble = null;
  } else if (Math.random() < 0.004) {
    const pool = status === "WORKING"  ? BUBBLES.working
               : status === "AWAITING" ? BUBBLES.awaiting
               : status === "DONE"     ? BUBBLES.done
               : BUBBLES.break;
    a.bubble    = pool[Math.floor(Math.random() * pool.length)];
    a.bubbleLife = 45 + Math.floor(Math.random() * 20);
  }
}

// ── Drawing helpers ───────────────────────────────────────────────────
function loadImg(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i); i.onerror = () => rej(); i.src = src;
  });
}

function paintFloor(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#c8946a";
  ctx.fillRect(0, T, CW, CH - T);
  ctx.strokeStyle = "rgba(0,0,0,0.07)"; ctx.lineWidth = 1;
  for (let y = T; y <= CH; y += T / 2) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke();
  }
  ctx.strokeStyle = "rgba(0,0,0,0.04)";
  const ph = T / 2;
  for (let row = 0; ; row++) {
    const ry = T + row * ph; if (ry > CH) break;
    const off = (row % 2) ? T * 0.75 : 0;
    for (let x = off; x < CW; x += T * 1.5) {
      ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x, ry + ph); ctx.stroke();
    }
  }
}

function paintWall(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, 0, T);
  g.addColorStop(0, "#3a1e0c"); g.addColorStop(1, "#6a3a1e");
  ctx.fillStyle = g; ctx.fillRect(0, 0, CW, T);
  ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(0, T - 3, CW, 3);
}

function drawBubble(ctx: CanvasRenderingContext2D, text: string, cx: number, topY: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.font = "bold 11px Inter, system-ui, sans-serif";
  ctx.textBaseline = "middle"; ctx.textAlign = "center";
  const tw = ctx.measureText(text).width;
  const bw = tw + 18; const bh = 22;
  const bx = cx - bw / 2; const by = topY - bh - 8;
  const r = 6; const arr = 5;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(bx + r, by); ctx.lineTo(bx + bw - r, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
  ctx.lineTo(bx + bw, by + bh - r);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
  ctx.lineTo(cx + arr, by + bh); ctx.lineTo(cx, by + bh + arr); ctx.lineTo(cx - arr, by + bh);
  ctx.lineTo(bx + r, by + bh); ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
  ctx.lineTo(bx, by + r); ctx.quadraticCurveTo(bx, by, bx + r, by);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.1)"; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = "#111"; ctx.fillText(text, cx, by + bh / 2);
  ctx.restore();
}

function drawNameTag(ctx: CanvasRenderingContext2D, name: string, color: string, cx: number, topY: number) {
  ctx.font = "bold 9px 'Press Start 2P', monospace";
  ctx.textBaseline = "middle"; ctx.textAlign = "center";
  const tw = ctx.measureText(name).width;
  const bw = tw + 10; const bh = 13;
  const by = topY - bh - 2;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(cx - bw / 2, by, bw, bh);
  ctx.fillStyle = color;
  ctx.fillText(name, cx, by + bh / 2);
}

// ── Component ─────────────────────────────────────────────────────────
export function OfficeRoom({ employees }: { employees: RoomEmployee[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);
  const empRef    = useRef(employees);
  const imgs      = useRef(new Map<string, HTMLImageElement>());
  const agents    = useRef<Agent[]>(makeAgents());
  const ready     = useRef(false);

  useEffect(() => { empRef.current = employees; }, [employees]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    let alive = true, last = 0;

    async function boot() {
      if (!ready.current) {
        const list: [string, string][] = [
          ["pl1",  "/assets/furniture/PLANT/PLANT.png"],
          ["pl2",  "/assets/furniture/PLANT_2/PLANT_2.png"],
          ["pl3",  "/assets/furniture/LARGE_PLANT/LARGE_PLANT.png"],
          ["bs",   "/assets/furniture/BOOKSHELF/BOOKSHELF.png"],
          ["desk", "/assets/furniture/DESK/DESK_FRONT.png"],
          ["sofa", "/assets/furniture/SOFA/SOFA_FRONT.png"],
          ["wb",   "/assets/furniture/WHITEBOARD/WHITEBOARD.png"],
          ["clk",  "/assets/furniture/CLOCK/CLOCK.png"],
          ["chair","/assets/furniture/CUSHIONED_CHAIR/CUSHIONED_CHAIR_FRONT.png"],
          ["pc1",  "/assets/furniture/PC/PC_FRONT_ON_1.png"],
          ["pc2",  "/assets/furniture/PC/PC_FRONT_ON_2.png"],
          ["pc3",  "/assets/furniture/PC/PC_FRONT_ON_3.png"],
          ["pco",  "/assets/furniture/PC/PC_FRONT_OFF.png"],
          ...([0,1,2,3,4,5].map((n): [string,string] => [`c${n}`, `/assets/characters/char_${n}.png`])),
        ];
        await Promise.all(list.map(async ([k, v]) => {
          try { imgs.current.set(k, await loadImg(v)); } catch {}
        }));
        ready.current = true;
      }
      if (alive) raf(0);
    }

    function raf(now: number) {
      if (!alive) return;
      rafRef.current = requestAnimationFrame(raf);
      if (now - last < 83) return; // ~12fps
      last = now;
      const emps = empRef.current;
      agents.current.forEach((a, i) => tickAgent(a, emps[i]?.status ?? "IDLE"));
      render(ctx);
    }

    function render(ctx: CanvasRenderingContext2D) {
      const im   = imgs.current;
      const emps = empRef.current;
      const ags  = agents.current;

      ctx.clearRect(0, 0, CW, CH);
      paintFloor(ctx);
      paintWall(ctx);

      // ── Wall decorations ───────────────────────────────────────────
      // Bookshelves along the wall
      const bs = im.get("bs");
      if (bs) {
        for (let x = T; x < CW - T; x += BSW + T / 2)
          ctx.drawImage(bs, x, 0, BSW, BSH);
      }

      // Whiteboard on wall (center-left)
      const wb = im.get("wb");
      if (wb) ctx.drawImage(wb, CW / 2 - WBW / 2, 0, WBW, WBH);

      // Clock on wall (right side)
      const clk = im.get("clk");
      if (clk) ctx.drawImage(clk, CW - CLKW - T, 0, CLKW, CLKH);

      // Corner plants on wall
      const pl1 = im.get("pl1");
      if (pl1) {
        ctx.drawImage(pl1, 0, 0, PLW, PLH);
        ctx.drawImage(pl1, CW - PLW, 0, PLW, PLH);
      }

      // ── Depth-sorted items ─────────────────────────────────────────
      type Item = { depth: number; fn: () => void };
      const items: Item[] = [];

      // Plants on floor (bottom corners + center)
      const pl2 = im.get("pl2"); const pl3 = im.get("pl3");
      if (pl2) {
        items.push({ depth: CH - PLH + PLH, fn: () => {
          ctx.drawImage(pl2!, 0,       CH - PLH, PLW, PLH);
          ctx.drawImage(pl2!, CW-PLW,  CH - PLH, PLW, PLH);
        }});
      }
      if (pl3) {
        items.push({ depth: CH - PLH + PLH, fn: () => {
          ctx.drawImage(pl3!, CW/2 - PLW/2, CH - PLH, PLW, PLH);
        }});
      }

      // Sofa + chairs in break area (bottom center)
      const sofaY = CH - SFH - 24;
      const sofaX = CW / 2 - SFW / 2;
      const sofa = im.get("sofa");
      const chair = im.get("chair");
      if (sofa) {
        items.push({ depth: sofaY + SFH, fn: () => {
          ctx.drawImage(sofa!, sofaX, sofaY, SFW, SFH);
          // Flanking chairs
          if (chair) {
            ctx.drawImage(chair!, sofaX - CHW - 8, sofaY + (SFH - CHH) / 2, CHW, CHH);
            ctx.drawImage(chair!, sofaX + SFW + 8,  sofaY + (SFH - CHH) / 2, CHW, CHH);
          }
        }});
      }

      // Desks + PCs at each home position
      const pcFrame = Math.floor(Date.now() / 250) % 3 + 1;
      const pcOnImg = im.get(`pc${pcFrame}`) ?? im.get("pc1");
      const pcOffImg = im.get("pco");
      const deskImg = im.get("desk");

      for (let i = 0; i < HOME_POSITIONS.length; i++) {
        const emp = emps[i];
        const { x: hx, y: hy } = HOME_POSITIONS[i];

        // Desk: centered on home position, behind the character
        const dx = hx + CRW / 2 - DW / 2;
        const dy = hy - DH / 2;           // desk y is above (north of) character

        // PC: centered on desk, sitting on top of it
        const px = dx + (DW - PW) / 2;
        const py = dy - PH + DH * 0.75;   // PC sits on the desk surface

        // PC is ON if employee is WORKING and at home
        const ag = ags[i];
        const atHome = ag ? (ag.mode === "working" || ag.mode === "idle_home") : true;
        const isWorking = emp?.status === "WORKING";
        const pcImg = isWorking && atHome ? pcOnImg : pcOffImg;

        const deskDepth = dy + DH; // always drawn behind character (charDepth = hy + CRH > hy)

        items.push({ depth: deskDepth, fn: () => {
          if (deskImg) ctx.drawImage(deskImg, dx, dy, DW, DH);
          if (pcImg)   ctx.drawImage(pcImg, px, py, PW, PH);
        }});
      }

      // Characters
      for (let i = 0; i < 10; i++) {
        const emp = emps[i]; const ag = ags[i];
        if (!emp || !ag) continue;
        const cImg = im.get(`c${emp.charIdx}`);
        if (!cImg) continue;

        const isWorking  = emp.status === "WORKING";
        const isAwaiting = emp.status === "AWAITING";
        const atHome     = ag.mode === "working" || ag.mode === "idle_home";
        const isMoving   = ag.mode === "leaving" || ag.mode === "returning" || ag.mode === "wandering";

        let frameCol: number, frameRow: number;
        if (isWorking && atHome) {
          frameCol = [3, 4][Math.floor(Date.now() / 200) % 2];
          frameRow = ROW_UP;
        } else if (isAwaiting && atHome) {
          frameCol = [5, 6][Math.floor(Date.now() / 400) % 2];
          frameRow = ROW_DOWN;
        } else if (isMoving) {
          frameCol = WALK_FRAMES[ag.walkPhase];
          frameRow = ag.facing;
        } else {
          frameCol = 1;
          frameRow = ROW_DOWN;
        }

        const cx = ag.x + CRW / 2;

        items.push({
          depth: ag.y + CRH,
          fn: () => {
            if (ag.flipX) {
              ctx.save();
              ctx.translate(ag.x + CRW, ag.y);
              ctx.scale(-1, 1);
              ctx.drawImage(cImg, frameCol*FW, frameRow*FH, FW, FH, 0, 0, CRW, CRH);
              ctx.restore();
            } else {
              ctx.drawImage(cImg, frameCol*FW, frameRow*FH, FW, FH, ag.x, ag.y, CRW, CRH);
            }

            drawNameTag(ctx, emp.name, emp.color, cx, ag.y + 2);

            if (ag.bubble && ag.bubbleLife > 0) {
              drawBubble(ctx, ag.bubble, cx, ag.y - 2, ag.bubbleLife / 8);
            }

            const dotColor =
              emp.status === "WORKING"  ? "#22c55e" :
              emp.status === "AWAITING" ? "#f59e0b" :
              emp.status === "DONE"     ? "#3b82f6" : "#374151";
            if (emp.status !== "IDLE") {
              ctx.shadowColor = dotColor; ctx.shadowBlur = 7;
            }
            ctx.fillStyle = dotColor;
            ctx.fillRect(ag.x + CRW - 9, ag.y + CRH - 9, 8, 8);
            ctx.shadowBlur = 0;
          },
        });
      }

      items.sort((a, b) => a.depth - b.depth);
      items.forEach(it => it.fn());
    }

    void boot();
    return () => { alive = false; cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={CW}
      height={CH}
      style={{
        width: "100%", height: "auto", display: "block",
        imageRendering: "pixelated", background: "#3a1e0c",
      }}
    />
  );
}
