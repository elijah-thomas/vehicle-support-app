"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// A short list that is one field's value, behind a button with its count. Click or Enter opens it;
// Escape or clicking away closes it and returns focus to the button. Never on hover.
export function PeekButton({
  label,
  title,
  className,
  children,
}: {
  label: string;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" className={className} />}>
        {label}
        <ChevronDown data-icon="inline-end" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={title} className="w-80 gap-1 p-2">
        <p className="px-2 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
        {children}
      </PopoverContent>
    </Popover>
  );
}
