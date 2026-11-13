<<<<<<< HEAD
# cobrinhaatt
=======
# cobrinhaAI

Jogo da cobrinha que ensina uma IA (RandomForest). Agora também é um **webapp público**:
joga-se pelo navegador (celular por swipe, PC por setas/WASD), sem login nem instalação, e
as partidas de todos os jogadores alimentam o treino da IA.

```
docs/                 site (HTML/JS) + modelo.json (a IA no navegador) + PWA
functions/api/        API (Cloudflare Pages Functions): grava e exporta partidas
schema.sql            banco D1 (SQLite)
baixar_dados.py       baixa partidas de todos -> dadosTreino/*.csv
atualizar_modelo.py   baixa + Treino.py + exporta modelo + guarda versão em modelos/
prototipo.py, Treino.py, features.py   o jogo/treino originais (inalterados)
```

## Como funciona
- O navegador envia cada partida (anônima, id aleatório guardado no aparelho) para `/api/partida`.
- O servidor **refaz a partida passo a passo** com as mesmas regras do jogo e recalcula todas as
  features; partida adulterada, impossível ou rápida demais é recusada. Reenvio não duplica.
  Limite de envios por IP (hash com sal, apagado em 1 h) e por jogador.
- Sem conexão ou banco fora do ar: o jogo continua e a partida fica numa fila local, reenviada depois.
- Partidas abandonadas (aba fechada no meio) ficam guardadas mas **não entram no treino**.
- O treino é separado do site: `baixar_dados.py` gera CSVs no formato de sempre e o `Treino.py` roda igual.

## Publicar (grátis, ~10 min)
Pré-requisitos: conta gratuita no Cloudflare e Node instalado.

1. **Banco**
   ```
   npx wrangler login
   npx wrangler d1 create cobrinha          # copie o database_id para wrangler.toml
   npx wrangler d1 execute cobrinha --remote --file=schema.sql
   ```
2. **Site + API**: no painel Cloudflare → *Workers & Pages* → *Create* → *Pages* → conectar este repositório do GitHub.
   Build command: *(vazio)* · Build output directory: `docs`.
3. **Ligar o banco e os segredos**: no projeto Pages → *Settings*:
   - *Bindings* → D1 database → variável `DB` → banco `cobrinha`.
   - *Variables and Secrets* → `EXPORT_TOKEN` (uma senha longa qualquer) e `SAL` (texto aleatório).
   - Faça um novo deploy. O link público é `https://<projeto>.pages.dev`. É só compartilhar.
4. No celular, o navegador oferece "Adicionar à tela inicial" (PWA, opcional).

## Treino coletivo
Manual:
```
pip install -r requirements.txt
# crie um arquivo .env (já ignorado pelo git):
#   COBRINHA_URL=https://<projeto>.pages.dev
#   EXPORT_TOKEN=<o mesmo do Cloudflare>
python atualizar_modelo.py
git add -A && git commit -m "novo modelo" && git push     # o site atualiza sozinho
```
Automático: em *Settings → Secrets and variables → Actions* do GitHub crie `COBRINHA_URL` e
`EXPORT_TOKEN`. O workflow `Treino coletivo` roda toda segunda e também por botão (*Run workflow*).
Cada treino vira uma versão em `modelos/` (`versoes.json` + `modelo_vN.json.gz`).
Para voltar a uma versão antiga, descompacte-a sobre `docs/modelo.json`.

Use `python baixar_dados.py --min-pontuacao 3` para treinar só com partidas melhores.

## Testar localmente
`npx wrangler pages dev docs --d1=DB` (use `.dev.vars` com `EXPORT_TOKEN=...`).
>>>>>>> d9ce789 (Jogo no navegador com toque e banco de dados)
