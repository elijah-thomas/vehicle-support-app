"use client";

import Link from "next/link";
import { useActionState } from "react";
import { searchAction, type SearchState } from "@/app/search-action";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Canned examples so reviewers can try every story without knowing the data.
const examples = [
  { label: "Recurring battery fault", query: "dana.whitfield@example.com" },
  { label: "Symptom matches an open recall", query: "0MRKC15V8PA200002" },
  { label: "Healthy new vehicle", query: "priya.raman@example.com" },
  { label: "Customer with two vehicles", query: "jordan.okafor@example.com" },
  { label: "Fault returned after a closed case", query: "0MRSH25H9PA500006" },
];

export function SearchForm() {
  const [state, formAction, pending] = useActionState<SearchState, FormData>(searchAction, {});

  return (
    <div className="space-y-6">
      <form action={formAction} className="flex gap-2">
        <Input
          name="query"
          placeholder="VIN or customer email"
          aria-label="VIN or customer email"
          autoComplete="off"
          required
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Searching…" : "Search"}
        </Button>
      </form>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {state.customer && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {state.customer.name} has {state.customer.vehicles.length} vehicles. Which one is the call about?
          </p>
          <ul className="space-y-1">
            {state.customer.vehicles.map((v) => (
              <li key={v.vin}>
                <Link href={`/vehicles/${v.vin}`} className="text-sm font-medium underline-offset-4 hover:underline">
                  {v.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Try an example</p>
        <div className="flex flex-wrap gap-2">
          {examples.map((example) => (
            <form key={example.query} action={formAction}>
              <input type="hidden" name="query" value={example.query} />
              <Button type="submit" variant="outline" size="sm" disabled={pending}>
                {example.label}
              </Button>
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}
