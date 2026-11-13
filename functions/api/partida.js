// POST /api/partida: recebe uma partida, valida por replay e grava no D1.
import { NOMES, RESULTADOS, TABULEIROS, reproduzir } from "../../docs/nucleo.js";

const MAX_BYTES = 400_000;
const MAX_PASSOS = 20_000;
const MIN_MS_POR_PASSO = 90; // o jogo anda a cada 120 ms; abaixo disso e robo
const LIMITE_IP = 40; // partidas por 10 min por IP
const LIMITE_JOGADOR = 30; // partidas por 10 min por jogador
const JANELA_MS = 10 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const resp = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const inteiro = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

export function validarFormato(p) {
  if (!p || typeof p !== "object") return "corpo invalido";
  if (p.v !== 1) return "versao desconhecida";
  if (typeof p.id !== "string" || !UUID.test(p.id)) return "id invalido";
  if (typeof p.jogador !== "string" || !UUID.test(p.jogador)) return "jogador invalido";
  if (!TABULEIROS.some(([c, l]) => c === p.cols && l === p.linhas)) return "tabuleiro invalido";
  if (!RESULTADOS.includes(p.resultado)) return "resultado invalido";
  if (!["toque", "teclado"].includes(p.dispositivo)) return "dispositivo invalido";
  if (!inteiro(p.pontuacao, 0, p.cols * p.linhas)) return "pontuacao invalida";
  if (!inteiro(p.tempo_ms, 0, 6 * 3600 * 1000)) return "tempo invalido";
  if (!Array.isArray(p.passos) || p.passos.length < 1 || p.passos.length > MAX_PASSOS)
    return "passos invalidos";
  for (const s of p.passos) {
    if (!Array.isArray(s) || s.length !== 3) return "passo malformado";
    if (!inteiro(s[0], -p.cols, p.cols) || !inteiro(s[1], -p.linhas, p.linhas)) return "passo fora da faixa";
    if (!inteiro(s[2], 0, NOMES.length - 1)) return "decisao invalida";
  }
  if (p.tempo_ms < (p.passos.length - 1) * MIN_MS_POR_PASSO) return "rapido demais";
  return null;
}

async function hashIp(ip, sal) {
  const dados = new TextEncoder().encode(`${sal}|${ip}`);
  const h = await crypto.subtle.digest("SHA-256", dados);
  return [...new Uint8Array(h)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost({ request, env }) {
  const bruto = await request.text();
  if (bruto.length > MAX_BYTES) return resp({ erro: "grande demais" }, 413);

  let p;
  try {
    p = JSON.parse(bruto);
  } catch {
    return resp({ erro: "json invalido" }, 400);
  }

  const erroFormato = validarFormato(p);
  if (erroFormato) return resp({ erro: erroFormato }, 400);

  const agora = Date.now();
  const ipHash = await hashIp(request.headers.get("CF-Connecting-IP") || "?", env.SAL || "cobrinha");

  // Reenvio da mesma partida: sucesso silencioso (nao conta no limite).
  const existe = await env.DB.prepare("SELECT 1 FROM partidas WHERE id = ?").bind(p.id).first();
  if (existe) return resp({ ok: true, duplicado: true });

  // Protecao contra envio em massa.
  const desde = agora - JANELA_MS;
  const porIp = await env.DB.prepare("SELECT COUNT(*) AS n FROM limite WHERE ip_hash = ? AND ts > ?")
    .bind(ipHash, desde).first();
  const porJogador = await env.DB.prepare("SELECT COUNT(*) AS n FROM partidas WHERE jogador = ? AND criado_em > ?")
    .bind(p.jogador, desde).first();
  if (porIp.n >= LIMITE_IP || porJogador.n >= LIMITE_JOGADOR)
    return resp({ erro: "muitas partidas, tente mais tarde" }, 429);

  // A partida precisa ser reproduzivel pelas regras do jogo.
  const r = reproduzir(p);
  if (!r.ok) return resp({ erro: r.erro }, 422);

  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO partidas (id, jogador, criado_em, cols, linhas, resultado, pontuacao, passos_n, tempo_ms, dispositivo, passos) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(p.id, p.jogador, agora, p.cols, p.linhas, p.resultado, p.pontuacao, p.passos.length, p.tempo_ms, p.dispositivo, JSON.stringify(p.passos)),
    env.DB.prepare("INSERT INTO limite (ip_hash, ts) VALUES (?, ?)").bind(ipHash, agora),
  ]);

  if (Math.random() < 0.05)
    await env.DB.prepare("DELETE FROM limite WHERE ts < ?").bind(agora - 3600_000).run();

  return resp({ ok: true });
}

export const onRequest = () => resp({ erro: "use POST" }, 405);
