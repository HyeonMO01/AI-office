import { useEffect, useRef } from "react";

export type EmpStatus = "IDLE" | "WORKING" | "AWAITING" | "DONE";
export interface RoomEmployee {
  name: string; charIdx: number; status: EmpStatus; color: string;
}

// ─── Canvas & Scale ────────────────────────────────────────────────────
const S   = 3;           // pixel scale  (1 logical px → 3 display px)
const T   = 16 * S;      // tile = 48 px
const CW  = 960;
const CH  = 460;
const WALL_H = T;        // 48 px top wall

// ─── Furniture sizes (source px × S) ──────────────────────────────────
//  DESK_FRONT: 48×32  → 144×96
const DW = 48*S, DH = 32*S;
//  PC:          16×32  →  48×96
const PW = 16*S, PH = 32*S;
//  PLANT:       16×32  →  48×96
const PLW = 16*S, PLH = 32*S;
//  BOOKSHELF:   32×16  →  96×48
const BSW = 32*S, BSH = 16*S;

// ─── Character sprite (source 16×32 per frame, sheet 7col × 3row) ─────
const FW = 16, FH = 32;
const CRW = FW*S, CRH = FH*S;   // 48×96 displayed

const ROW_UP   = 1;  // facing wall   (working)
const ROW_DOWN = 0;  // facing viewer (idle/done/await)

const ANIM: Record<EmpStatus, number[]> = {
  IDLE:[1], WORKING:[3,4], AWAITING:[5,6], DONE:[0,1,2,1],
};
const FPS: Record<EmpStatus, number> = {
  IDLE:1, WORKING:5, AWAITING:2, DONE:3,
};
const LED_COL: Record<EmpStatus, string> = {
  IDLE:"#444", WORKING:"#00ff41", AWAITING:"#f9ca24", DONE:"#45b7d1",
};

// ─── Station layout ────────────────────────────────────────────────────
// 5 stations × 192 px each = 960 px total
// Each station: 24 px pad | 144 px desk | 24 px pad
const STATION_X = [0, 192, 384, 576, 768];

// Desk top-edge Y for each row.
// The character must sit BEHIND (higher-y) the desk face but LOW enough
// to peek out visually.
//
// Render order (painter's algorithm, ascending depth = ascending bottomY):
//   1. PC          depth = pcY + PH
//   2. Character   depth = charY + CRH          ← drawn after PC
//   3. DESK_FRONT  depth = deskY + DH            ← covers char lower half
//
// → We need:  pcY+PH  <  charY+CRH  <  deskY+DH
//
// Choose:
//   pcY    = deskY - PH          (PC top flush with desk top, extends above)
//   charY  = deskY - CRH + 28   (char mostly behind desk, head ~28 px above desk top)
//
//   pcY   + PH  = deskY          ✓ < charY+CRH = deskY+28
//   charY + CRH = deskY + 28     ✓ < deskY+DH  = deskY+96

const DESK_ROW_Y: [number, number] = [150, 305];

// ─── Helpers ──────────────────────────────────────────────────────────
function loadImg(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.onload  = () => res(img);
    img.onerror = () => rej();
    img.src = src;
  });
}

function drawFloor(ctx: CanvasRenderingContext2D) {
  // Warm wood base
  ctx.fillStyle = "#c89060";
  ctx.fillRect(0, WALL_H, CW, CH - WALL_H);
  // Horizontal plank lines
  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.lineWidth = 1;
  for (let y = WALL_H; y <= CH; y += T / 2) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke();
  }
  // Vertical plank joints (staggered rows)
  ctx.strokeStyle = "rgba(0,0,0,0.05)";
  const ph = T / 2;
  for (let row = 0; ; row++) {
    const ry = WALL_H + row * ph;
    if (ry > CH) break;
    const off = (row % 2) ? T * 0.75 : 0;
    for (let x = off; x < CW; x += T * 1.5) {
      ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x, ry + ph); ctx.stroke();
    }
  }
}

function drawTopWall(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, 0, WALL_H);
  g.addColorStop(0, "#3a1e0c");
  g.addColorStop(1, "#6a3a1e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CW, WALL_H);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, WALL_H - 4, CW, 4);
}

function drawNameTag(
  ctx: CanvasRenderingContext2D,
  emp: RoomEmployee,
  charX: number,
  charY: number,
) {
  const cx = charX + CRW / 2;
  const ty = charY - 4;

  ctx.font         = "bold 9px 'Press Start 2P', monospace";
  ctx.textAlign    = "center";
  ctx.textBaseline = "bottom";

  const tw = ctx.measureText(emp.name).width;
  // pill bg
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.fillRect(cx - tw / 2 - 5, ty - 13, tw + 10, 15);
  // text
  ctx.fillStyle = emp.color;
  ctx.fillText(emp.name, cx, ty);
  // LED dot
  const led = LED_COL[emp.status];
  ctx.fillStyle = led;
  if (emp.status !== "IDLE") { ctx.shadowColor = led; ctx.shadowBlur = 8; }
  ctx.fillRect(cx - 3, ty - 18, 6, 6);
  ctx.shadowBlur = 0;
}

// ─── Component ────────────────────────────────────────────────────────
export function OfficeRoom({ employees }: { employees: RoomEmployee[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);
  const empRef    = useRef(employees);
  const imgs      = useRef(new Map<string, HTMLImageElement>());
  const ready     = useRef(false);

  useEffect(() => { empRef.current = employees; }, [employees]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    let alive = true, tick = 0, last = 0;

    async function boot() {
      if (!ready.current) {
        const list: [string, string][] = [
          ["desk",  "/assets/furniture/DESK/DESK_FRONT.png"],
          ["pc1",   "/assets/furniture/PC/PC_FRONT_ON_1.png"],
          ["pc2",   "/assets/furniture/PC/PC_FRONT_ON_2.png"],
          ["pc3",   "/assets/furniture/PC/PC_FRONT_ON_3.png"],
          ["pl1",   "/assets/furniture/PLANT/PLANT.png"],
          ["pl2",   "/assets/furniture/PLANT_2/PLANT_2.png"],
          ["bs",    "/assets/furniture/BOOKSHELF/BOOKSHELF.png"],
          ...([0,1,2,3,4,5].map((n): [string,string] =>
            [`c${n}`, `/assets/characters/char_${n}.png`])),
        ];
        await Promise.all(list.map(async ([k, v]) => {
          try { imgs.current.set(k, await loadImg(v)); } catch {}
        }));
        ready.current = true;
      }
      if (alive) frame(0);
    }

    function frame(now: number) {
      if (!alive) return;
      rafRef.current = requestAnimationFrame(frame);
      if (now - last < 83) return;  // ~12 fps
      last = now; tick++;
      render(ctx, tick);
    }

    function render(ctx: CanvasRenderingContext2D, t: number) {
      const im   = imgs.current;
      const emps = empRef.current;

      ctx.clearRect(0, 0, CW, CH);

      drawFloor(ctx);
      drawTopWall(ctx);

      // Bookshelves on top wall
      const bs = im.get("bs");
      if (bs) for (let x = T; x < CW - T; x += BSW + T / 2)
        ctx.drawImage(bs, x, 0, BSW, BSH);

      // Corner plants
      const pl1 = im.get("pl1"), pl2 = im.get("pl2");
      if (pl1) {
        ctx.drawImage(pl1, 0, 0, PLW, PLH);
        ctx.drawImage(pl1, CW - PLW, 0, PLW, PLH);
      }
      if (pl2) {
        ctx.drawImage(pl2, 0, CH - PLH, PLW, PLH);
        ctx.drawImage(pl2, CW - PLW, CH - PLH, PLW, PLH);
      }

      // ── Workstations ──────────────────────────────────────────────
      type Drawable = { depth: number; fn: () => void };
      const list: Drawable[] = [];

      const pcImg   = im.get(`pc${(t % 3) + 1}`) ?? im.get("pc1");
      const deskImg = im.get("desk");

      for (let i = 0; i < 10; i++) {
        const emp = emps[i];
        if (!emp) continue;

        const stX   = STATION_X[i % 5];
        const deskY = DESK_ROW_Y[i < 5 ? 0 : 1];

        const deskX  = stX + 24;          // desk left edge (24 px margin inside 192 px station)
        const pcX    = deskX + T;          // PC centered on desk width (one tile from left)
        const pcY    = deskY - PH;         // PC top aligns with desk top, extends above

        // Character: head visible above desk, body mostly hidden behind it
        const charX  = deskX + T;
        const charY  = deskY - CRH + 28;  // 28 px of char visible above desk top

        const isWork = emp.status === "WORKING";
        const dir    = isWork ? ROW_UP : ROW_DOWN;
        const frames = ANIM[emp.status] ?? [1];
        const fps    = FPS[emp.status] ?? 2;
        const col    = frames[Math.floor(t / (12 / fps)) % frames.length];
        const cImg   = im.get(`c${emp.charIdx}`);

        // depth = bottom-edge y (painter's sort ascending)
        // PC depth    = deskY           (flush with desk top)
        // Char depth  = deskY + 28      (slightly below PC depth)
        // Desk depth  = deskY + DH = deskY + 96   (covers char's lower 68 px)
        if (pcImg)
          list.push({ depth: pcY + PH, fn: () =>
            ctx.drawImage(pcImg, pcX, pcY, PW, PH) });

        if (cImg)
          list.push({ depth: charY + CRH, fn: () => {
            ctx.drawImage(cImg, col*FW, dir*FH, FW, FH, charX, charY, CRW, CRH);
            drawNameTag(ctx, emp, charX, charY);
          }});

        if (deskImg)
          list.push({ depth: deskY + DH, fn: () =>
            ctx.drawImage(deskImg, deskX, deskY, DW, DH) });
      }

      list.sort((a, b) => a.depth - b.depth);
      list.forEach(d => d.fn());
    }

    void boot();
    return () => { alive = false; cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={CW}
      height={CH}
      style={{ width:"100%", height:"auto", display:"block",
               imageRendering:"pixelated", background:"#3a1e0c" }}
    />
  );
}
