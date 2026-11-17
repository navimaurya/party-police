import { cn } from "@/lib/utils";

export function EmptyState({ emoji = "🥲", message, className, children }: { emoji?: string; message: string; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-muted/40 px-6 py-10 text-center", className)}>
      <span className="text-4xl" aria-hidden>{emoji}</span>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {children}
    </div>
  );
}
