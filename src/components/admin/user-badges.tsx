import { Crown, ShieldCheck, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, type UserRole } from "@/types";

const AVATAR_TONES = [
  "bg-pink-100 text-pink-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-800",
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-rose-100 text-rose-700",
  "bg-indigo-100 text-indigo-700",
];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Initials avatar with a stable colour per email. */
export function UserAvatar({ name, email, size = "md", className }: { name: string; email: string; size?: "sm" | "md" | "lg"; className?: string }) {
  let h = 0;
  for (const ch of email) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        AVATAR_TONES[h % AVATAR_TONES.length],
        size === "sm" && "size-8 text-xs",
        size === "md" && "size-10 text-sm",
        size === "lg" && "size-16 text-xl",
        className
      )}
    >
      {initials(name)}
    </span>
  );
}

const ROLE_STYLE: Record<UserRole, { className: string; icon: typeof Crown }> = {
  super_admin: { className: "bg-amber-100 text-amber-800 ring-amber-200", icon: Crown },
  admin: { className: "bg-violet-100 text-violet-700 ring-violet-200", icon: ShieldCheck },
  member: { className: "bg-slate-100 text-slate-700 ring-slate-200", icon: UserRound },
};

export function RoleBadge({ role, className }: { role: UserRole; className?: string }) {
  const { className: tone, icon: Icon } = ROLE_STYLE[role];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tone, className)}>
      <Icon className="size-3.5" /> {ROLE_LABELS[role]}
    </span>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", active ? "text-emerald-700" : "text-muted-foreground")}>
      <span className={cn("size-1.5 rounded-full", active ? "bg-emerald-500" : "bg-slate-300")} />
      {active ? "Active" : "Inactive"}
    </span>
  );
}
