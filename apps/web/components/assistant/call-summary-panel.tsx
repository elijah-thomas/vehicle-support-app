import { CallSummaryForm } from "@/components/assistant/call-summary-form";
import { cannedTranscripts } from "@/lib/assistant/canned-transcripts";
import { getCases } from "@/lib/customer/cached-reads";
import { formatCaseNumber, formatDate } from "@/lib/format";
import { loadPanel } from "@/lib/load-panel";

// Server wrapper: hands the client form this vehicle's open cases, newest first, from the same
// cached fetch as the Cases panel.
export async function CallSummaryPanel({ vin }: { vin: string }) {
  // If cases can't load, the rep can still draft and file under a new case.
  const loaded = await loadPanel("call summary cases", () => getCases(vin));
  const cases = (loaded.ok ? loaded.data : null) ?? [];

  // Decision (D20): only open cases can be picked. Why: a note on a closed case reaches no open-case
  // view, so nobody follows it up; reopening on the case view records why it came back. Trade-off:
  // a call about a closed case needs that reopen first. See docs/decisions.md#call-summary
  const open = cases
    .filter((c) => c.status === "OPEN")
    .sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));

  return (
    <CallSummaryForm
      vin={vin}
      cannedTranscript={cannedTranscripts[vin]}
      cases={open.map((c) => ({
        id: c.id,
        number: c.number,
        subject: c.subject,
        label: `${formatCaseNumber(c.number)} · ${c.subject} · opened ${formatDate(c.openedAt)}`,
      }))}
    />
  );
}
