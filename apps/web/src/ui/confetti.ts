// A short burst of paint-chip confetti for moments worth celebrating, like a
// client approving an item. Skipped entirely for people who prefer less motion.

const COLORS = ["#f6ae2d", "#f2643d", "#f283a6", "#9b5de5", "#2f54eb", "#0fa3a6", "#2f9e57", "#e2cc1e"];

export function confetti(from?: { x: number; y: number }) {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  canvas.className = "confetti";
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.remove();
  ctx.scale(dpr, dpr);

  const origin = from ?? { x: innerWidth / 2, y: innerHeight / 3 };
  const pieces = Array.from({ length: 70 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 7;
    return {
      x: origin.x,
      y: origin.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 5,
      w: 6 + Math.random() * 6,
      h: 9 + Math.random() * 8,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
    };
  });

  const start = performance.now();
  const frame = (now: number) => {
    const t = now - start;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of pieces) {
      p.vy += 0.28;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 1600);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < 1600) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
