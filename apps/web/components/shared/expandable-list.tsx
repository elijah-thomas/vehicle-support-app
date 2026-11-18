"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { REVEAL_EVENT } from "@/lib/flash-element";

export type ListItem = { key: string; ids?: string[]; node: React.ReactNode };

// A list read in order: the first `initial` items, then a button that says what it adds. It expands
// in place, and a link to a row it's hiding (any flashWhenPresent call) expands it first.
export function ExpandableList({
  items,
  initial,
  noun,
  className,
}: {
  items: ListItem[];
  initial: number;
  // What the hidden items are, singular and plural: "Show 9 older events".
  noun: [one: string, many: string];
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hidden = items.slice(initial);
  const hiddenIds = hidden.flatMap((item) => item.ids ?? []).join(" ");

  useEffect(() => {
    if (!hiddenIds) return;
    const ids = new Set(hiddenIds.split(" "));
    function reveal(event: Event) {
      if (ids.has((event as CustomEvent<string>).detail)) setExpanded(true);
    }
    window.addEventListener(REVEAL_EVENT, reveal);
    return () => window.removeEventListener(REVEAL_EVENT, reveal);
  }, [hiddenIds]);

  const shown = expanded ? items : items.slice(0, initial);
  return (
    <>
      <ul className={className}>
        {shown.map((item) => (
          <li key={item.key}>{item.node}</li>
        ))}
      </ul>
      {hidden.length > 0 && (
        <Button variant="outline" size="sm" className="mt-2" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show fewer" : `Show ${hidden.length} ${hidden.length === 1 ? noun[0] : noun[1]}`}
          {expanded ? <ChevronUp data-icon="inline-end" aria-hidden /> : <ChevronDown data-icon="inline-end" aria-hidden />}
        </Button>
      )}
    </>
  );
}
