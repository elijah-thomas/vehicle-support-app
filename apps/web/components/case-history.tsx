import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getCases } from "@/lib/customer/vehicles";
import { formatDate } from "@/lib/format";

export async function CaseHistory({ vin }: { vin: string }) {
  const cases = await getCases(vin);
  if (!cases) return null;

  return (
    <Card id="cases" className="scroll-mt-18">
      <CardHeader>
        <CardTitle>Case history</CardTitle>
        <CardDescription>{cases.length === 1 ? "1 case" : `${cases.length} cases`}, newest first.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {cases.length === 0 && <p className="text-sm text-muted-foreground">No previous cases for this vehicle.</p>}
        {cases.map((supportCase, index) => (
          <div key={supportCase.id} className="space-y-2 text-sm">
            {index > 0 && <Separator className="mb-4" />}
            <div className="flex items-center gap-2">
              <Badge variant={supportCase.status === "OPEN" ? "info" : "secondary"}>
                {supportCase.status === "OPEN" ? "Open" : "Closed"}
              </Badge>
              <span className="font-medium">{supportCase.subject}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {supportCase.category} · opened {formatDate(supportCase.openedAt)}
              {supportCase.closedAt && ` · closed ${formatDate(supportCase.closedAt)}`}
            </p>
            <p>{supportCase.description}</p>
            {supportCase.resolution && (
              <p>
                <span className="text-muted-foreground">Resolution: </span>
                {supportCase.resolution}
              </p>
            )}
            {supportCase.notes.map((note) => (
              <div key={note.id} className="rounded-md bg-muted p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  Note · {formatDate(note.createdAt)}
                  {note.source === "AI_DRAFT_EDITED" && <Badge variant="info">AI draft, reviewed by rep</Badge>}
                </div>
                <p className="mt-1 font-medium">{note.issue}</p>
                <p>{note.summary}</p>
                <ul className="mt-1 list-disc pl-5">
                  {note.nextSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
