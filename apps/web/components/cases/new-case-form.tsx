"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { openCaseAction } from "@/app/vehicles/[vin]/cases/case-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CASE_CATEGORIES } from "@/lib/cases";

// A case without a transcript. On success the action takes the rep to the new case. vin is null
// while the page's params resolve, so the same form can be the static shell's fallback, disabled.
export function NewCaseForm({ vin }: { vin: string | null }) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [reported, setReported] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [opening, startOpening] = useTransition();
  const ready = subject.trim() && category.trim() && reported.trim();

  function open(event: React.FormEvent) {
    event.preventDefault();
    if (!vin) return;
    setError(null);
    startOpening(async () => {
      try {
        const result = await openCaseAction({ vin, subject, category, reported });
        if (result && !result.ok) setError(result.error);
      } catch {
        setError("The case didn't open. Your text is still here. Try again in a moment.");
      }
    });
  }

  return (
    <Card className="p-4">
      <form onSubmit={open} className="space-y-3" aria-labelledby="new-case-title">
        <h2 id="new-case-title" className="text-xl font-semibold tracking-tight">
          New case
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="new-case-subject">Subject</Label>
            <Input id="new-case-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-case-category">Category</Label>
            <Input
              id="new-case-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              maxLength={100}
              list="case-categories"
              autoComplete="off"
            />
            <datalist id="case-categories">
              {CASE_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-case-reported">What the customer reported</Label>
          <Textarea id="new-case-reported" value={reported} onChange={(e) => setReported(e.target.value)} rows={3} maxLength={4000} />
        </div>
        {error && (
          <Alert variant="destructive" role="alert">
            <CircleAlert aria-hidden />
            <AlertDescription className="text-foreground">{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={!vin || opening || !ready}>
            {opening ? "Opening…" : "Open case"}
          </Button>
          <Link href={vin ? `/vehicles/${vin}` : "/"} className={buttonVariants({ variant: "outline" })} aria-disabled={opening}>
            Cancel
          </Link>
        </div>
      </form>
    </Card>
  );
}
