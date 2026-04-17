"use client";

import Image from "next/image";
import { useState } from "react";

type Props = {
  username: string;
  onUsername: (name: string) => void;
  onContinue: () => void;
};

export default function Hero({ username, onUsername, onContinue }: Props) {
  const [val, setVal] = useState(username);

  const submit = () => {
    const trimmed = val.trim();
    if (!trimmed) return;
    onUsername(trimmed);
    onContinue();
  };

  return (
    <section className="relative min-h-screen w-full overflow-hidden bg-black">
      {/* Top nav */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-10 pt-7">
        <div className="flex items-center gap-3">
          <span className="size-9 rounded-xl overflow-hidden bg-[#0c1530] grid place-items-center ring-1 ring-white/10">
            <Image src="/logo.png" alt="EcoCloud" width={36} height={36} className="object-contain" loading="eager" />
          </span>
          <span className="text-[15px] font-semibold tracking-[0.18em] text-white/85">
            ECOCLOUD
          </span>
        </div>
        <button
          aria-label="menu"
          className="size-9 rounded-md grid place-items-center text-white/80 hover:bg-white/5 transition"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </header>

      {/* Earth backdrop */}
      <EarthBackdrop />

      {/* Centered content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center text-center px-6">
        <h1 className="text-white tracking-[-0.04em] font-semibold leading-[0.95] text-[clamp(48px,8.5vw,120px)] max-w-[14ch]">
          Don't let your cloud
          <br />
          <span className="text-grad-eco">drain you.</span>
        </h1>

        <p className="mt-7 text-[15px] md:text-[16px] text-white/55 max-w-[44ch] leading-relaxed">
          Discover where your AI workloads should live — routed across providers
          and regions for the best price, in real time.
        </p>

        {/* Username input — sits just below the hero copy in the same viewport */}
        <div className="mt-10 w-full max-w-md flex flex-col gap-3">
          <label className="eyebrow text-white/45">Begin with your name</label>
          <div className="relative flex items-center gap-2 p-1.5 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
            <span className="pl-3 text-white/40">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="3.5" />
                <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
              </svg>
            </span>
            <input
              autoFocus
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="your name"
              className="flex-1 bg-transparent outline-none text-white placeholder:text-white/30 px-1 py-2 text-[15px]"
            />
            <button
              onClick={submit}
              className="px-4 h-10 rounded-xl text-[13px] font-medium text-black bg-white hover:bg-white/90 transition flex items-center gap-1.5"
            >
              Continue
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
          <p className="text-[11px] text-white/35">
            We'll personalise your routing console with this.
          </p>
        </div>

        {/* Subtle scroll cue */}
        <div className="mt-12 flex flex-col items-center gap-1 text-white/30">
          <span className="text-[10px] tracking-[0.3em]">SCROLL</span>
          <span className="size-5 rounded-full border border-white/20 grid place-items-center drift">
            <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </div>
      </div>
    </section>
  );
}

/* The big rim-lit Earth that occupies the lower half of the hero. */
function EarthBackdrop() {
  return (
    <div aria-hidden className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
      {/* faint stars */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 12% 22%, rgba(255,255,255,0.6), transparent 50%)," +
            "radial-gradient(1px 1px at 80% 18%, rgba(255,255,255,0.4), transparent 50%)," +
            "radial-gradient(1.2px 1.2px at 65% 35%, rgba(255,255,255,0.5), transparent 50%)," +
            "radial-gradient(1px 1px at 28% 70%, rgba(255,255,255,0.4), transparent 50%)," +
            "radial-gradient(1.4px 1.4px at 90% 60%, rgba(255,255,255,0.45), transparent 50%)," +
            "radial-gradient(1px 1px at 45% 12%, rgba(255,255,255,0.35), transparent 50%)," +
            "radial-gradient(1px 1px at 5% 50%, rgba(255,255,255,0.4), transparent 50%)",
        }}
      />
      {/* Earth body — huge circle anchored below the fold */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-full"
        style={{
          bottom: "-95vh",
          width: "200vw",
          height: "200vw",
          maxWidth: "2400px",
          maxHeight: "2400px",
          background:
            "radial-gradient(circle at 50% 30%, #0a4a55 0%, #042230 35%, #010810 60%, transparent 70%)",
          boxShadow:
            "inset 0 0 280px 40px rgba(0, 0, 0, 0.85), 0 0 200px 40px rgba(75,228,197,0.18)",
        }}
      />
      {/* Atmospheric rim highlight */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
        style={{
          bottom: "-95vh",
          width: "200vw",
          height: "200vw",
          maxWidth: "2400px",
          maxHeight: "2400px",
          background:
            "radial-gradient(circle at 50% 5%, rgba(120, 220, 255, 0.55), transparent 12%)," +
            "radial-gradient(circle at 18% 25%, rgba(75, 228, 197, 0.35), transparent 22%)," +
            "radial-gradient(circle at 82% 25%, rgba(90, 215, 255, 0.35), transparent 22%)",
          filter: "blur(8px)",
          mixBlendMode: "screen",
        }}
      />
      {/* Vignette top */}
      <div
        className="absolute inset-x-0 top-0 h-1/2"
        style={{
          background: "linear-gradient(180deg, #000 30%, transparent 100%)",
        }}
      />
    </div>
  );
}
