// GET /api/exportar: partidas validas no formato de linhas dos CSVs do treino.
// Protegido por token (Authorization: Bearer <EXPORT_TOKEN>). Uso: baixar_dados.py
import { reproduzir } from "../../docs/nucleo.js";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

function tokenOk(recebido, esperado) {
  if (!esperado || !recebido || recebido.length !== esperado.length) return false;
  let d = 0;
  for (let i = 0; i < esperado.length; i++) d |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i);
  return d === 0;
}

export async function onRequestGet({ request, env }) {
  const auth = (request.headers.get("Authorization") || "").replace(/^Bearer /, "");
  if (!tokenOk(auth, env.EXPORT_TOKEN)) return json({ erro: "nao autorizado" }, 401);

  const url = new URL(request.url);
  const apos = Math.max(0, parseInt(url.searchParams.get("apos") || "0", 10) || 0);
  const limite = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limite") || "100", 10) || 100));
  const minPassos = Math.max(1, parseInt(url.searchParams.get("min_passos") || "5", 10) || 5);
  const minPontuacao = Math.max(0, parseInt(url.searchParams.get("min_pontuacao") || "0", 10) || 0);

  // So partidas COMPLETAS entram no treino (abandonadas ficam fora).
  const { results } = await env.DB.prepare(
    `SELECT rowid AS rid, id, cols, linhas, resultado, pontuacao, passos
       FROM partidas
      WHERE rowid > ? AND resultado != 'abandonada' AND passos_n >= ? AND pontuacao >= ?
      ORDER BY rowid LIMIT ?`,
  ).bind(apos, minPassos, minPontuacao, limite).all();

  const partidas = [];
  for (const row of results) {
    const r = reproduzir({
      cols: row.cols,
      linhas: row.linhas,
      resultado: row.resultado,
      pontuacao: row.pontuacao,
      passos: JSON.parse(row.passos),
    });
    if (r.ok) partidas.push({ id: row.id, pontuacao: row.pontuacao, linhas: r.linhas });
  }

  const ultimo = results.length ? results[results.length - 1].rid : apos;
  return json({ partidas, proximo: ultimo, fim: results.length < limite });
}
