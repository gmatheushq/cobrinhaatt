-- Banco D1 (SQLite) das partidas coletadas pelo webapp.
-- Aplicar uma vez:  npx wrangler d1 execute cobrinha --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS partidas (
  id         TEXT PRIMARY KEY,          -- UUID gerado no navegador (evita duplicados)
  jogador    TEXT NOT NULL,             -- UUID anonimo guardado no navegador
  criado_em  INTEGER NOT NULL,          -- epoch em ms (servidor)
  cols       INTEGER NOT NULL,
  linhas     INTEGER NOT NULL,
  resultado  TEXT NOT NULL CHECK (resultado IN ('parede','corpo','venceu','abandonada')),
  pontuacao  INTEGER NOT NULL CHECK (pontuacao >= 0),
  passos_n   INTEGER NOT NULL CHECK (passos_n >= 1),
  tempo_ms   INTEGER NOT NULL CHECK (tempo_ms >= 0),  -- tempo de sobrevivencia
  dispositivo TEXT NOT NULL CHECK (dispositivo IN ('toque','teclado')),
  passos     TEXT NOT NULL              -- JSON [[dx,dy,decisao],...]; o resto e recalculado por replay
);
CREATE INDEX IF NOT EXISTS idx_partidas_jogador ON partidas (jogador, criado_em);

-- Controle anti-abuso: so um hash com sal do IP, apagado depois de 1 hora.
CREATE TABLE IF NOT EXISTS limite (
  ip_hash TEXT NOT NULL,
  ts      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_limite ON limite (ip_hash, ts);
