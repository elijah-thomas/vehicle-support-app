import { CallSummary } from "@/components/call-summary";
import { cannedTranscripts } from "@/lib/canned-transcripts";
import { getCases } from "@/lib/customer/vehicles";
import { formatDate } from "@/lib/format";
import { loadPanel } from "@/lib/load-panel";

// Server wrapper: hands the client form this vehicle's cases (from the same cached fetch as
// Case history) so the picker can default to the most recent open case.
export async function CallSummaryPanel({ vin }: { vin: string }) {
  // If cases can't load, the rep can still draft and file under a new case.
  const loaded = await loadPanel("call summary cases", () => getCases(vin));
  const cases = (loaded.ok ? loaded.data : null) ?? [];

  return (
    <CallSummary
      vin={vin}
      cannedTranscript={cannedTranscripts[vin]}
      cases={cases.map((c) => ({
        id: c.id,
        number: c.number,
        open: c.status === "OPEN",
        subject: c.subject,
        label: `${c.status === "OPEN" ? "Open" : "Closed"} · ${c.subject} · ${formatDate(c.openedAt)}`,
      }))}
    />
  );
}
