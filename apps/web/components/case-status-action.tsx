"use client";

import { CircleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { closeCaseAction, reopenCaseAction } from "@/app/vehicles/[vin]/cases/case-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const forms = {
  close: { button: "Close case", label: "Resolution", placeholder: "What fixed it, or why the case is closing", busy: "Closing…" },
  reopen: { button: "Reopen case", label: "Why are you reopening it?", placeholder: undefined, busy: "Reopening…" },
};

// The case header with its one status action: Close on an open case (a resolution is required,
// since the assistant reads it later), Reopen on a closed one (the reason is kept as a note). The
// form opens inline under the header.
export function CaseStatusAction({
  vin,
  caseId,
  isOpen,
  children,
}: {
  vin: string;
  caseId: string;
  isOpen: boolean;
  children: React.ReactNode;
}) {
  const mode = isOpen ? "close" : "reopen";
  const copy = forms[mode];
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  // After a successful close or reopen the case changes mode; start the next form empty.
  const [shownMode, setShownMode] = useState(mode);
  if (shownMode !== mode) {
    setShownMode(mode);
    setOpen(false);
    setText("");
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startSaving(async () => {
      try {
        const result =
          mode === "close"
            ? await closeCaseAction({ vin, caseId, resolution: text })
            : await reopenCaseAction({ vin, caseId, reason: text });
        if (!result.ok) setError(result.error);
      } catch {
        setError(`${copy.button} didn't go through. Try again in a moment.`);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-3">{children}</div>
        {!open && (
          <Button variant="outline" onClick={() => setOpen(true)}>
            {copy.button}
          </Button>
        )}
      </div>
      {open && (
        <form onSubmit={submit} className="space-y-2 rounded-md bg-muted p-3">
          <Label htmlFor="case-status-text">{copy.label}</Label>
          <Textarea
            id="case-status-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={copy.placeholder}
            className="bg-card"
            autoFocus
          />
          {error && (
            <Alert variant="destructive" role="alert">
              <CircleAlert aria-hidden />
              <AlertDescription className="text-foreground">{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving || !text.trim()}>
              {saving ? copy.busy : copy.button}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
