"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CATEGORY_DOT } from "@/components/shared/badges";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS, EVENT_CATEGORIES, type EventCategory, type EventStatus, type EventType } from "@/types";

type CalEvent = {
  _id: string;
  title: string;
  category: EventCategory;
  eventType: EventType;
  status: EventStatus;
  organizerName: string;
  eventDate: string;
  location?: string;
};

type View = "month" | "week" | "day";

const CHIP: Record<EventCategory, string> = {
  monthly: "bg-pink-100 text-pink-800 hover:bg-pink-200",
  special: "bg-violet-100 text-violet-800 hover:bg-violet-200",
  occasional: "bg-amber-100 text-amber-900 hover:bg-amber-200",
};

function rangeFor(view: View, cursor: Date) {
  if (view === "month") return { from: startOfWeek(startOfMonth(cursor)), to: endOfWeek(endOfMonth(cursor)) };
  if (view === "week") return { from: startOfWeek(cursor), to: endOfWeek(cursor) };
  return { from: startOfDay(cursor), to: endOfDay(cursor) };
}

type Props = { linkPrefix?: string; compact?: boolean };

/** The calendar depends on "today", so it renders at request time behind a Suspense boundary. */
export function PartyCalendar(props: Props) {
  return (
    <Suspense fallback={<div className="h-[28rem] animate-pulse rounded-2xl border bg-muted/40" aria-label="Loading calendar" />}>
      <CalendarInner {...props} />
    </Suspense>
  );
}

function CalendarInner({ linkPrefix = "/parties/", compact = false }: Props) {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const { from, to } = useMemo(() => rangeFor(view, cursor), [view, cursor]);
  const rangeKey = `${from.toISOString()}|${to.toISOString()}`;
  // Results are tagged with the range they belong to; "loading" = we don't have this range yet.
  const [result, setResult] = useState<{ key: string; events: CalEvent[]; error: string | null } | null>(null);
  const loading = result?.key !== rangeKey;
  const events = result?.events ?? [];
  const error = result?.key === rangeKey ? result.error : null;

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/calendar?from=${from.toISOString()}&to=${to.toISOString()}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((b) => {
        if (!b.success) throw new Error(b.error?.message ?? "Failed to load");
        setResult({ key: rangeKey, events: b.data, error: null });
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setResult({ key: rangeKey, events: [], error: "Couldn't load the calendar. The party planners are on a break. 😴" });
      });
    return () => ctrl.abort();
  }, [from, to, rangeKey]);

  const move = (dir: 1 | -1) =>
    setCursor((c) => (view === "month" ? addMonths(c, dir) : view === "week" ? addWeeks(c, dir) : addDays(c, dir)));

  const title =
    view === "month"
      ? format(cursor, "MMMM yyyy")
      : view === "week"
        ? `${format(from, "d MMM")} – ${format(to, "d MMM yyyy")}`
        : format(cursor, "EEEE, d MMMM yyyy");

  const days = eachDayOfInterval({ start: from, end: to });
  const eventsOn = (d: Date) => events.filter((e) => isSameDay(new Date(e.eventDate), d));

  const Chip = ({ e, full = false }: { e: CalEvent; full?: boolean }) => (
    <Link
      href={`${linkPrefix}${e._id}`}
      title={`${e.title} — hosted by ${e.organizerName}`}
      className={cn(
        "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-tight transition",
        CHIP[e.category],
        e.status === "cancelled" && "line-through opacity-60",
        full && "px-3 py-2 text-sm"
      )}
    >
      {e.eventType === "instant" ? <Zap className="size-3 shrink-0 text-red-600" aria-label="Instant party" /> : <span className={cn("size-1.5 shrink-0 rounded-full", CATEGORY_DOT[e.category])} />}
      <span className="truncate">
        {full && <span className="font-semibold">{format(new Date(e.eventDate), "h:mm a")} · </span>}
        {e.title}
        {full ? <span className="text-muted-foreground"> — {e.organizerName}{e.location ? ` @ ${e.location}` : ""}</span> : <span className="hidden opacity-70 lg:inline"> · {e.organizerName}</span>}
      </span>
    </Link>
  );

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => move(-1)} aria-label="Previous"><ChevronLeft /></Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
          <Button variant="outline" size="icon-sm" onClick={() => move(1)} aria-label="Next"><ChevronRight /></Button>
          <h3 className="ml-2 text-base font-semibold sm:text-lg">{title}</h3>
        </div>
        <div className="inline-flex rounded-lg border p-0.5" role="tablist" aria-label="Calendar view">
          {(["month", "week", "day"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn("rounded-md px-2.5 py-1 text-xs font-medium capitalize transition", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className={cn("relative", loading && "opacity-60")} aria-busy={loading}>
        {view === "month" && (
          <div className="grid grid-cols-7 overflow-hidden rounded-xl border text-xs">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="border-b bg-muted/60 py-1.5 text-center font-medium text-muted-foreground">
                <span className="sm:hidden">{d[0]}</span>
                <span className="hidden sm:inline">{d}</span>
              </div>
            ))}
            {days.map((d) => {
              const list = eventsOn(d);
              return (
                <div
                  key={d.toISOString()}
                  className={cn(
                    "flex flex-col gap-1 border-b border-r p-1 text-left transition hover:bg-muted/40",
                    compact ? "min-h-16" : "min-h-16 sm:min-h-24",
                    !isSameMonth(d, cursor) && "bg-muted/20 text-muted-foreground/60"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setCursor(d);
                      setView("day");
                    }}
                    aria-label={`${format(d, "d MMMM")}: ${list.length} parties. Open day view`}
                    className={cn("inline-flex size-6 items-center justify-center rounded-full text-xs hover:ring-2 hover:ring-ring/40", isToday(d) && "bg-primary font-bold text-primary-foreground")}
                  >
                    {format(d, "d")}
                  </button>
                  <div className="hidden w-full space-y-0.5 sm:block">
                    {list.slice(0, 3).map((e) => <Chip key={e._id} e={e} />)}
                    {list.length > 3 && <span className="text-[10px] text-muted-foreground">+{list.length - 3} more</span>}
                  </div>
                  {list.length > 0 && (
                    <div className="flex gap-0.5 sm:hidden">
                      {list.slice(0, 4).map((e) => <span key={e._id} className={cn("size-1.5 rounded-full", e.eventType === "instant" ? "bg-red-500" : CATEGORY_DOT[e.category])} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {view === "week" && (
          <div className="grid gap-2 sm:grid-cols-7">
            {days.map((d) => (
              <div key={d.toISOString()} className={cn("min-h-24 rounded-xl border p-2", isToday(d) && "border-primary bg-pink-50/60")}>
                <p className="mb-1 text-xs font-semibold text-muted-foreground">{format(d, "EEE d")}</p>
                <div className="space-y-1">
                  {eventsOn(d).map((e) => <Chip key={e._id} e={e} />)}
                  {eventsOn(d).length === 0 && <p className="text-[11px] text-muted-foreground/60">No parties 😴</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {view === "day" && (
          <div className="space-y-2">
            {eventsOn(cursor).length === 0 ? (
              <p className="rounded-xl bg-muted/40 p-6 text-center text-sm text-muted-foreground">No parties on this day. Tragic. 🥲</p>
            ) : (
              eventsOn(cursor).map((e) => <Chip key={e._id} e={e} full />)
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {EVENT_CATEGORIES.map((c) => (
          <span key={c} className="flex items-center gap-1"><span className={cn("size-2 rounded-full", CATEGORY_DOT[c])} /> {CATEGORY_LABELS[c]}</span>
        ))}
        <span className="flex items-center gap-1"><Zap className="size-3 text-red-600" /> Instant party</span>
      </div>
    </div>
  );
}
