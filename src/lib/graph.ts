import type { SupabaseClient } from "@supabase/supabase-js";

// Microsoft Graph com o app do Canal (client credentials). O segredo fica no
// banco (rpc teo_teams_segredo); tenant e client id em teo_config.
export type GraphCfg = {
  teams_tenant_id: string | null;
  teams_client_id: string | null;
};

export async function graphToken(
  supabase: SupabaseClient,
  cfg: GraphCfg
): Promise<{ ok: true; auth: Record<string, string> } | { ok: false; erro: string } | null> {
  if (!cfg.teams_tenant_id || !cfg.teams_client_id) return null;
  const { data: segredo } = await supabase.rpc("teo_teams_segredo");
  if (!segredo) return null;
  const tok = await fetch(`https://login.microsoftonline.com/${cfg.teams_tenant_id}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.teams_client_id,
      client_secret: String(segredo),
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const t = (await tok.json().catch(() => null)) as { access_token?: string; error_description?: string } | null;
  if (!t?.access_token) return { ok: false, erro: `token ${tok.status}: ${(t?.error_description ?? "").slice(0, 200)}` };
  return { ok: true, auth: { Authorization: `Bearer ${t.access_token}`, "Content-Type": "application/json" } };
}

// "WEBVTT … 00:00:01.000 --> 00:00:04.000\n<v Flávio Reis>Boa tarde</v>" vira
// "[00:01] Flávio Reis: Boa tarde", juntando falas seguidas da mesma pessoa.
export function vttParaTexto(vtt: string): string {
  const linhas: string[] = [];
  let tempo = "";
  let ultimo = "";
  for (const bruta of vtt.split(/\r?\n/)) {
    const l = bruta.trim();
    const t = l.match(/^(\d{2}):(\d{2}):(\d{2})\.\d+\s+-->/);
    if (t) {
      const h = Number(t[1]);
      tempo = h > 0 ? `${h}:${t[2]}:${t[3]}` : `${t[2]}:${t[3]}`;
      continue;
    }
    const v = l.match(/^<v\s+([^>]+)>(.*?)(<\/v>)?$/);
    if (!v) continue;
    const quem = v[1].trim();
    const fala = v[2].trim();
    if (!fala) continue;
    if (quem === ultimo && linhas.length) linhas[linhas.length - 1] += ` ${fala}`;
    else linhas.push(`[${tempo}] ${quem}: ${fala}`);
    ultimo = quem;
  }
  return linhas.join("\n");
}
