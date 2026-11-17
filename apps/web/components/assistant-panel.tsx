import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tabClass =
  "h-7 flex-none px-2.5 text-xs text-muted-foreground data-active:bg-card data-active:text-foreground data-active:shadow-sm focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

// Both tabs stay mounted, so switching never loses the chat thread or an unsaved draft.
// See docs/decisions.md#lookup-and-layout
export function AssistantPanel({ ask, callSummary }: { ask: React.ReactNode; callSummary: React.ReactNode }) {
  return (
    <Card className="h-full gap-0 py-0">
      <Tabs defaultValue="ask" className="min-h-0 flex-1 gap-0">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="size-4 text-primary" aria-hidden />
            Assistant
          </h2>
          <TabsList className="h-auto rounded-md p-0.5">
            <TabsTrigger value="ask" className={tabClass}>
              Ask
            </TabsTrigger>
            <TabsTrigger value="call-summary" className={tabClass}>
              Call summary
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="ask" keepMounted className="flex min-h-0 flex-col">
          {ask}
        </TabsContent>
        <TabsContent value="call-summary" keepMounted className="flex min-h-0 flex-col">
          {callSummary}
        </TabsContent>
      </Tabs>
    </Card>
  );
}
