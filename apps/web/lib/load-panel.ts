import "server-only";
import { unstable_rethrow } from "next/navigation";

export type Loaded<T> = { ok: true; data: T } | { ok: false };

// Decision (D29): one panel's data failing (telematics down, say) costs that panel, not the page.
// unstable_rethrow lets Next's own control-flow errors through: connection() postpones
// prerendering by throwing, and swallowing that would break the static shell.
// See docs/decisions.md#error-states
export async function loadPanel<T>(name: string, load: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (error) {
    unstable_rethrow(error);
    console.error(`${name} failed to load`, error);
    return { ok: false };
  }
}
