import { Check, LoaderCircle, X } from "lucide-react";
import { cn } from "cn";

const labels: Record<string, { running: string; done: string }> = {
  "tool-getTelematics": { running: "Checking telematics", done: "Telematics" },
};

export function AgentToolStep({ type, state }: { type: string; state?: string }) {
  const label = labels[type] ?? { running: type.replace(/^tool-/, ""), done: type.replace(/^tool-/, "") };
  const failed = state === "output-error";
  const done = state === "output-available";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium",
        failed ? "bg-destructive-soft text-destructive" : "bg-accent text-accent-foreground",
      )}
    >
      {failed ? (
        <X className="size-3" aria-hidden />
      ) : done ? (
        <Check className="size-3" aria-hidden />
      ) : (
        <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />
      )}
      {failed ? `${label.done} unavailable` : done ? label.done : `${label.running}…`}
    </span>
  );
}
