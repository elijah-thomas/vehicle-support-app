"use client";

import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { Car, Check, CircleX, Clock, Mail, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "cn";
import { startTransition, useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { searchAction, type SearchState } from "@/app/search-action";
import { ComboboxContent, ComboboxGroup, ComboboxItem, ComboboxLabel, ComboboxList } from "@/components/ui/combobox";
import { formatRelative } from "@/lib/format";
import { checkVin, lookupInPastedText, suggestedVehicles, matchRange, normalizeQuery, queryKind } from "@/lib/lookup";
import {
  clearRecentVehicles,
  getRecentVehicles,
  getServerRecentVehicles,
  subscribeRecentVehicles,
} from "@/lib/recent-vehicles";

type Option =
  | { kind: "vehicle"; id: string; vin: string; name: string; owner?: string; openedAt?: string; hint?: string }
  | { kind: "clear"; id: string };

type OptionGroup = { label: string; items: Option[] };

// Suggestions are recent vehicles from this browser and a fixed list, never a search of customer data.
// See docs/decisions.md#lookup-and-layout
function suggestionGroups(
  query: string,
  recents: ReturnType<typeof getRecentVehicles>,
  customer: SearchState["customer"],
): OptionGroup[] {
  if (customer) {
    return [
      {
        label: `${customer.name}'s vehicles`,
        items: customer.vehicles.map((v) => ({ kind: "vehicle", id: `customer-${v.vin}`, vin: v.vin, name: v.label })),
      },
    ];
  }

  const isVin = queryKind(query) === "vin";
  const recent = recents
    .filter((v) => !query || matches(query, isVin, v.vin, v.name, v.owner))
    .map((v): Option => ({ kind: "vehicle", id: `recent-${v.vin}`, ...v }));
  const recentVins = new Set(recents.map((v) => v.vin));
  const vehicles = suggestedVehicles
    .filter((v) => !recentVins.has(v.vin) && (!query || matches(query, isVin, v.vin, v.name, v.owner)))
    .map((v): Option => ({ kind: "vehicle", id: `vehicle-${v.vin}`, ...v }));

  const clear: Option = { kind: "clear", id: "clear" };
  const groups: OptionGroup[] = [
    { label: "Recent", items: recent.length > 0 && !query ? [...recent, clear] : recent },
    { label: "Vehicles", items: vehicles },
  ];
  return groups.filter((group) => group.items.length > 0);
}

function matches(query: string, isVin: boolean, vin: string, ...labels: string[]) {
  if (isVin) return vin.startsWith(query);
  return [vin, ...labels].some((text) => matchRange(text, query));
}

export function VehicleSearch({ size = "default", className }: { size?: "default" | "lg"; className?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const fieldRef = useRef<HTMLDivElement>(null);
  const [openedAt, setOpenedAt] = useState(0);
  const recents = useSyncExternalStore(subscribeRecentVehicles, getRecentVehicles, getServerRecentVehicles);

  const [state, formAction, pending] = useActionState<SearchState, FormData>(async (previous, formData) => {
    const next = await searchAction(previous, formData);
    if (next.customer || next.error) setOpen(true);
    return next;
  }, {});
  // The bar persists across vehicle pages, so a lookup result is hidden once the rep moves on.
  const [dismissed, setDismissed] = useState<SearchState | null>(null);
  const result = state === dismissed ? {} : state;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const groups = suggestionGroups(query, recents, result.customer);
  const kind = queryKind(query);

  function openList() {
    setOpenedAt(Date.now());
    setOpen(true);
  }

  function changeQuery(next: string) {
    setQuery(normalizeQuery(next));
    setDismissed(state);
    openList();
  }

  function lookUp(text: string) {
    const formData = new FormData();
    formData.set("query", text);
    startTransition(() => formAction(formData));
  }

  function choose(option: Option | null) {
    if (!option) return;
    if (option.kind === "clear") {
      clearRecentVehicles();
      return;
    }
    setOpen(false);
    setDismissed(state);
    setQuery("");
    router.push(`/vehicles/${option.vin}`);
  }

  const large = size === "lg";
  const hasSuggestions = groups.length > 0 || Boolean(result.error);
  const suggestions = (
    <>
      {result.error && (
        <p role="status" className="px-3 pt-3 text-sm text-destructive">
          {result.error}
        </p>
      )}
      <ComboboxList className="max-h-[min(28rem,var(--available-height))] p-1">
        {(group: OptionGroup) => (
          <ComboboxGroup key={group.label} items={group.items}>
            <ComboboxLabel className="px-2 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {group.label}
            </ComboboxLabel>
            <ComboboxPrimitive.Collection>
              {(option: Option) => (
                <SuggestionRow key={option.id} option={option} query={query} now={openedAt} />
              )}
            </ComboboxPrimitive.Collection>
          </ComboboxGroup>
        )}
      </ComboboxList>
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground" aria-hidden>
        <span>
          <Kbd>↑</Kbd> <Kbd>↓</Kbd> choose
        </span>
        <span>
          <Kbd>Enter</Kbd> open
        </span>
        {!large && (
          <span>
            <Kbd>Esc</Kbd> close
          </span>
        )}
        <span className="ml-auto">
          <Kbd>/</Kbd> from anywhere
        </span>
      </div>
    </>
  );

  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(event) => {
        event.preventDefault();
        if (query) lookUp(query);
      }}
    >
      <ComboboxPrimitive.Root<Option>
        items={groups}
        filteredItems={groups}
        value={null}
        onValueChange={choose}
        inputValue={query}
        onInputValueChange={(next, details) => {
          // Only typing changes the query; Base UI's close-time reset to the (empty) selection is ignored.
          if (details.reason === "input-change") changeQuery(next);
        }}
        inline={large}
        open={hasSuggestions && (large || open)}
        onOpenChange={(next) => (next ? openList() : setOpen(false))}
        itemToStringLabel={(option) => (option.kind === "vehicle" ? option.vin : "")}
      >
        <div
          ref={fieldRef}
          className={cn(
            "flex items-center gap-2 rounded-md border border-input bg-card px-2.5 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring",
            large ? "h-11" : "h-8",
          )}
        >
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <ComboboxPrimitive.Input
            ref={inputRef}
            name="query"
            placeholder="VIN or customer email"
            aria-label="VIN or customer email"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            spellCheck={false}
            onFocus={openList}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text");
              const found = lookupInPastedText(text);
              if (found && found !== text.trim()) {
                event.preventDefault();
                changeQuery(found);
              }
            }}
            className={cn(
              "h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground",
              kind === "vin" ? "font-mono text-[13px]" : large ? "text-base" : "text-sm",
            )}
          />
          <QueryCheck query={query} pending={pending} />
        </div>

        {large ? (
          hasSuggestions && (
            <div className="mt-2 overflow-hidden rounded-md border bg-popover shadow-md">{suggestions}</div>
          )
        ) : (
          <ComboboxContent anchor={fieldRef} className="rounded-md border p-0 ring-0">
            {suggestions}
          </ComboboxContent>
        )}
      </ComboboxPrimitive.Root>
      <button type="submit" className="sr-only">
        Look up
      </button>
    </form>
  );
}

function QueryCheck({ query, pending }: { query: string; pending: boolean }) {
  const base = "flex shrink-0 items-center gap-1 text-xs whitespace-nowrap text-muted-foreground tabular-nums";
  if (pending) return <span className={base}>Looking up…</span>;

  switch (queryKind(query)) {
    case "empty":
      return <Kbd>/</Kbd>;
    case "email":
      return (
        <span className={base}>
          <Mail className="size-3.5" aria-hidden />
          Email
        </span>
      );
    case "vin": {
      const check = checkVin(query);
      return (
        <span
          aria-live="polite"
          className={cn(base, check.tone === "ok" && "text-success", check.tone === "error" && "text-destructive")}
        >
          {check.tone === "ok" && <Check className="size-3.5" aria-hidden />}
          {check.tone === "error" && <CircleX className="size-3.5" aria-hidden />}
          {check.text}
        </span>
      );
    }
    default:
      return null;
  }
}

function SuggestionRow({ option, query, now }: { option: Option; query: string; now: number }) {
  const itemClass = "items-start gap-2.5 px-2 py-1.5 pr-2 data-highlighted:bg-accent";

  if (option.kind === "clear") {
    return (
      <ComboboxItem value={option} className={cn(itemClass, "items-center text-muted-foreground")}>
        <Trash2 className="size-4" aria-hidden />
        Clear recent
      </ComboboxItem>
    );
  }

  const isVin = queryKind(query) === "vin";
  const Icon = option.openedAt ? Clock : Car;

  return (
    <ComboboxItem value={option} className={itemClass}>
      <Icon className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <Highlight text={option.name} query={isVin ? "" : query} />
        </p>
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-mono">
            <Highlight text={option.vin} query={query} prefixOnly={isVin} />
          </span>
          {option.owner && (
            <>
              {" · "}
              <Highlight text={option.owner} query={isVin ? "" : query} />
            </>
          )}
        </p>
      </div>
      {option.openedAt && now > 0 && (
        <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">{formatRelative(option.openedAt, now)}</span>
      )}
      {option.hint && <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">{option.hint}</span>}
    </ComboboxItem>
  );
}

function Highlight({ text, query, prefixOnly = false }: { text: string; query: string; prefixOnly?: boolean }) {
  const range = matchRange(text, query, prefixOnly);
  if (!range) return text;
  return (
    <>
      {text.slice(0, range[0])}
      <span className="font-semibold text-foreground">{text.slice(range[0], range[1])}</span>
      {text.slice(range[1])}
    </>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border bg-muted px-1 font-sans text-[11px] text-muted-foreground">
      {children}
    </kbd>
  );
}
