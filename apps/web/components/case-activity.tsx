"use client";

import { CircleAlert, CircleCheck, FilePlus, FileText, RotateCcw } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { removeNoteAction, restoreNoteAction } from "@/app/vehicles/[vin]/cases/case-actions";
import { CaseNote } from "@/components/case-note";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Case } from "@/lib/customer/vehicles";
import { newestFirst } from "@/lib/cases";
import { formatDate } from "@/lib/format";

type Note = Case["notes"][number];

export type ActivityItem =
  | { kind: "note"; date: string; note: Note }
  | { kind: "opened" | "closed" | "reopened"; date: string; text: string };

const UNDO_MS = 8000;

// The case's history, newest first. Removing a note asks for no confirmation: it's replaced at
// once by a marker, with Undo for a few seconds. Case reads leave removed notes out (D40), so the
// marker is kept here, in the order the note had.
export function CaseActivity({ vin, caseId, items }: { vin: string; caseId: string; items: ActivityItem[] }) {
  const [removed, setRemoved] = useState<Map<string, { note: Note; at: string }>>(new Map());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startWrite] = useTransition();

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function setRemovedNote(noteId: string, value: { note: Note; at: string } | null) {
    setRemoved((current) => {
      const next = new Map(current);
      if (value) next.set(noteId, value);
      else next.delete(noteId);
      return next;
    });
  }

  function remove(note: Note) {
    setError(null);
    setRemovedNote(note.id, { note, at: new Date().toISOString() });
    setNotice(note.id);
    startWrite(async () => {
      const result = await removeNoteAction({ vin, caseId, noteId: note.id }).catch(() => null);
      if (result?.ok) return;
      // The note stays: put it back and say why.
      setRemovedNote(note.id, null);
      setNotice(null);
      setError(result?.error ?? "Removing the note didn't go through. Try again in a moment.");
    });
  }

  function undo(noteId: string) {
    setNotice(null);
    setError(null);
    startWrite(async () => {
      const result = await restoreNoteAction({ vin, caseId, noteId }).catch(() => null);
      if (result?.ok) return setRemovedNote(noteId, null);
      setError(result?.error ?? "Undo didn't go through. Try again in a moment.");
    });
  }

  // Server items, plus markers for notes removed here that the refreshed list no longer has.
  const shownIds = new Set(items.flatMap((item) => (item.kind === "note" ? [item.note.id] : [])));
  const merged: ActivityItem[] = [
    ...items,
    ...[...removed.values()]
      .filter(({ note }) => !shownIds.has(note.id))
      .map(({ note }) => ({ kind: "note" as const, date: note.createdAt, note })),
  ].sort(newestFirst);

  return (
    <section className="space-y-3" aria-labelledby="activity-title">
      <h3 id="activity-title" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Activity
      </h3>
      {error && (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden />
          <AlertDescription className="text-foreground">{error}</AlertDescription>
        </Alert>
      )}
      <ol className="space-y-3">
        {merged.map((item) => {
          if (item.kind !== "note") {
            const { Icon, title } = events[item.kind];
            return (
              <Event key={`${item.kind}-${item.date}`} Icon={Icon} title={title} date={item.date}>
                {item.text}
              </Event>
            );
          }
          const marker = removed.get(item.note.id);
          if (marker) {
            return (
              <li key={item.note.id} className="flex items-center gap-3 text-sm">
                <EventIcon Icon={FileText} />
                <p className="text-muted-foreground italic">Note removed · {formatDate(marker.at)}</p>
              </li>
            );
          }
          return (
            <CaseNote
              key={item.note.id}
              id={`note-${item.note.id}`}
              note={item.note}
              action={
                <button
                  type="button"
                  onClick={() => remove(item.note)}
                  className="text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  Remove
                </button>
              }
            />
          );
        })}
      </ol>
      <div role="status" aria-live="polite">
        {notice && (
          <div className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-sm items-center gap-3 rounded-md bg-foreground py-2 pr-2 pl-3 text-sm text-background shadow-lg">
            <span className="flex-1">Note removed.</span>
            <Button
              size="sm"
              variant="outline"
              className="border-background bg-transparent text-background hover:bg-background/10 hover:text-background"
              onClick={() => undo(notice)}
            >
              Undo
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

const events = {
  opened: { Icon: FilePlus, title: "Case opened" },
  closed: { Icon: CircleCheck, title: "Case closed" },
  reopened: { Icon: RotateCcw, title: "Reopened" },
} as const;

function EventIcon({ Icon }: { Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }> }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Icon className="size-3" aria-hidden />
    </span>
  );
}

function Event({
  Icon,
  title,
  date,
  children,
}: {
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  date: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3 text-sm">
      <EventIcon Icon={Icon} />
      <div className="space-y-0.5">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{title}</span> · {formatDate(date)}
        </p>
        <p className="whitespace-pre-line">{children}</p>
      </div>
    </li>
  );
}
