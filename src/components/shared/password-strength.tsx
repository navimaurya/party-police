"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PASSWORD_RULES, passwordStrength } from "@/lib/password-policy";

const BAR = ["bg-red-500", "bg-orange-500", "bg-amber-500", "bg-lime-500", "bg-emerald-500"];
const TEXT = ["text-red-700", "text-orange-700", "text-amber-700", "text-lime-700", "text-emerald-700"];

/** Live strength meter + the policy checklist, shown under a "new password" field. */
export function PasswordStrength({ password, id }: { password: string; id?: string }) {
  const { score, label } = passwordStrength(password);
  return (
    <div id={id} className="space-y-1.5" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors", password && i < Math.max(1, score) ? BAR[score] : "bg-muted")} />
          ))}
        </div>
        {password && <span className={cn("w-16 text-right text-xs font-semibold", TEXT[score])}>{label}</span>}
      </div>
      <ul className="grid gap-0.5 text-xs sm:grid-cols-2">
        {PASSWORD_RULES.map((r) => {
          const okRule = r.test(password);
          return (
            <li key={r.id} className={cn("flex items-center gap-1", okRule ? "text-emerald-700" : "text-muted-foreground")}>
              {okRule ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
              <span>{r.label}<span className="sr-only">{okRule ? " (done)" : " (missing)"}</span></span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
