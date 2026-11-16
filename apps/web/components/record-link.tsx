"use client";

import { flashWhenPresent } from "@/lib/flash-element";

// A link to a row elsewhere on the vehicle page. It scrolls to and highlights the row without
// changing the URL, so the address stays clean and Back leaves the page in one step.
export function RecordLink({
  targetId,
  className,
  children,
}: {
  targetId: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={`#${targetId}`}
      className={className}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        flashWhenPresent(targetId);
      }}
    >
      {children}
    </a>
  );
}
