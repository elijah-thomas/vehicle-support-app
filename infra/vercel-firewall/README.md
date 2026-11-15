# Vercel Firewall rules

Rate limits enforced at Vercel's edge, before any function runs, so a blocked request costs no
compute and no model tokens. See `docs/decisions.md` (D8, D28).

| File | Matches | Limit |
|---|---|---|
| `rate-limit-ai-endpoints.json` | `POST /api/agent`, `POST /api/call-summary` | 20 per minute per IP → 429 |
| `rate-limit-note-saves.json` | `POST /vehicles/*` with a `Next-Action` header (Server Actions) | 30 per minute per IP → 429 |

These files are the source of truth. To apply them to a project:

```bash
for f in infra/vercel-firewall/*.json; do vercel firewall rules add --data "$(cat "$f")" --yes; done
vercel firewall diff      # review
vercel firewall publish   # make live (prints a digest; non-interactive runs pass
                          # --confirm-name <project> --effects-digest <digest>)
```

Rules apply to every deployment of the project, previews included. Counters are per Vercel
region; with functions pinned to `cle1` (D21), that is effectively one counter. Per-IP limits
don't bound total spend across many IPs: that backstop is the provider-side spend limits on the
BYOK keys, since AI Gateway budgets don't cap BYOK spend (D9).
