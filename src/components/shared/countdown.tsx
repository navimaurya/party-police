"use client";

import { useSyncExternalStore } from "react";

// One shared 1-second clock for every countdown on the page.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let current = 0;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    current = Date.now();
    timer = setInterval(() => {
      current = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => current || Date.now();
const getServerSnapshot = () => null;

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

export function Countdown({ to }: { to: string }) {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (now === null) return <div className="h-16" aria-hidden />;
  const left = new Date(to).getTime() - now;
  if (left <= 0) return <p className="text-lg font-semibold">🎉 It&apos;s party time! Go go go!</p>;
  const p = parts(left);
  return (
    <div className="flex gap-2 sm:gap-3" role="timer" aria-label="Time until the party">
      {(
        [
          ["Days", p.d],
          ["Hours", p.h],
          ["Mins", p.m],
          ["Secs", p.s],
        ] as const
      ).map(([label, value]) => (
        <div key={label} className="flex min-w-16 flex-col items-center rounded-xl bg-white/80 px-3 py-2 shadow-sm ring-1 ring-pink-100">
          <span className="font-heading text-2xl font-bold tabular-nums text-primary">{String(value).padStart(2, "0")}</span>
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}
