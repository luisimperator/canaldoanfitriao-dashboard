import { execFile } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";
import { transcreverComTempos } from "./transcribe";

// Transcrição refeita a partir da gravação da call (vídeo da Teams), pra quando
// a transcrição da própria Teams sai errada. Ex.: reunião com idioma en-US, em
// que a conversa em português vira um inglês sem sentido. Baixa o vídeo, tira
// só o áudio (ffmpeg, mono 16 kHz, 32 kbps, em partes de 20 min, ~5 MB cada,
// abaixo do limite de 25 MB do Whisper) e transcreve em português com o mesmo
// provedor dos áudios do WhatsApp (src/lib/transcribe.ts). O Whisper não diz
// quem fala: o nome vem dos turnos da transcrição da Teams, cujos nomes e
// tempos continuam certos mesmo com o texto errado.

const exec = promisify(execFile);
const PARTE_S = 20 * 60;

// Frases que o Whisper inventa em silêncio.
const ALUCINACAO = /amara\.org|legendas pela comunidade|obrigad[oa] por assistir|inscreva-se no canal/i;

function caminhoFfmpeg(): string | null {
  const candidatos = [ffmpegStatic, path.join(process.cwd(), "node_modules/ffmpeg-static/ffmpeg")];
  return candidatos.find((p): p is string => !!p && existsSync(p)) ?? null;
}

function segundos(t: string): number {
  const p = t.split(":").map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
}

function relogio(s: number): string {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600);
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
  const ss = String(t % 60).padStart(2, "0");
  return h > 0 ? `${h}:${m}:${ss}` : `${m}:${ss}`;
}

/** Turnos de fala ("[mm:ss] Nome: texto", formato do vttParaTexto). */
export function turnosDaTeams(texto: string | null): { t: number; quem: string }[] {
  const turnos: { t: number; quem: string }[] = [];
  for (const l of (texto ?? "").split("\n")) {
    const m = l.match(/^\[(\d+:\d{2}(?::\d{2})?)\]\s+([^:]+):/);
    if (m) turnos.push({ t: segundos(m[1]), quem: m[2].trim() });
  }
  return turnos.sort((a, b) => a.t - b.t);
}

// Transcrição da Teams que saiu em inglês (idioma da reunião errado): muito
// mais palavras comuns do inglês do que do português.
export function pareceIngles(texto: string): boolean {
  const palavras = texto
    .toLowerCase()
    .replace(/^\[[^\]]*\][^:]*:/gm, " ")
    .match(/[a-zà-ú']+/g) ?? [];
  if (palavras.length < 30) return false;
  const en = new Set(["the", "you", "to", "and", "is", "it", "that", "of", "we", "what", "yeah", "okay", "this", "have", "for", "with", "are", "be", "not", "know", "can", "just", "get", "got", "go", "i"]);
  const pt = new Set(["que", "não", "você", "é", "pra", "eu", "um", "uma", "com", "isso", "tá", "então", "mas", "da", "na", "se", "por", "para", "mais", "tem", "sim", "aqui", "como", "muito", "já", "o"]);
  let nEn = 0;
  let nPt = 0;
  for (const p of palavras) {
    if (en.has(p)) nEn++;
    else if (pt.has(p)) nPt++;
  }
  return nEn >= 10 && nEn > nPt * 1.5;
}

export type Gravacao = { url: string | null; inicio: string | null };

export async function transcreverGravacoes(
  gravacoes: Gravacao[],
  auth: Record<string, string>,
  turnos: { t: number; quem: string }[]
): Promise<{ ok: true; texto: string } | { ok: false; erro: string }> {
  const ff = caminhoFfmpeg();
  if (!ff) return { ok: false, erro: "ffmpeg não encontrado no servidor" };
  const validas = gravacoes.filter((g): g is { url: string; inicio: string | null } => !!g.url);
  if (!validas.length) return { ok: false, erro: "sem gravação" };
  const base = validas[0].inicio ? new Date(validas[0].inicio).getTime() : null;
  const trechos: { t: number; texto: string }[] = [];

  for (const g of validas) {
    const desloc = base && g.inicio ? Math.max(0, (new Date(g.inicio).getTime() - base) / 1000) : 0;
    const dir = await mkdtemp(path.join(tmpdir(), "gravacao-"));
    try {
      const res = await fetch(g.url, { headers: { Authorization: auth.Authorization } });
      if (!res.ok || !res.body) return { ok: false, erro: `baixar gravação: ${res.status}` };
      const video = path.join(dir, "call.mp4");
      await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(video));
      await exec(
        ff,
        [
          "-hide_banner", "-loglevel", "error", "-y", "-i", video,
          "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k",
          "-f", "segment", "-segment_time", String(PARTE_S), "-reset_timestamps", "1",
          path.join(dir, "parte%03d.mp3"),
        ],
        { maxBuffer: 1024 * 1024 }
      );
      await rm(video, { force: true });
      const partes = (await readdir(dir)).filter((f) => f.startsWith("parte")).sort();
      if (!partes.length) return { ok: false, erro: "a gravação não tem áudio" };
      for (const [i, nome] of partes.entries()) {
        const buf = await readFile(path.join(dir, nome));
        const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
        const r = await transcreverComTempos(ab, "audio/mpeg", nome);
        if (!r.ok) return { ok: false, erro: `transcrever: ${r.error}` };
        for (const s of r.trechos) {
          if (!ALUCINACAO.test(s.texto)) trechos.push({ t: desloc + i * PARTE_S + s.inicio, texto: s.texto });
        }
      }
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message.slice(0, 300) : String(e) };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  if (!trechos.length) return { ok: false, erro: "transcrição vazia" };

  // Quem fala em cada trecho: o último turno da Teams que começou até ali
  // (1 s de folga pro desencontro entre a gravação e a transcrição).
  const linhas: string[] = [];
  let ultimo: string | null | undefined;
  for (const s of trechos) {
    let quem: string | null = null;
    for (const t of turnos) {
      if (t.t <= s.t + 1) quem = t.quem;
      else break;
    }
    if (linhas.length && quem === ultimo) linhas[linhas.length - 1] += ` ${s.texto}`;
    else linhas.push(quem ? `[${relogio(s.t)}] ${quem}: ${s.texto}` : `[${relogio(s.t)}] ${s.texto}`);
    ultimo = quem;
  }
  return { ok: true, texto: linhas.join("\n") };
}
