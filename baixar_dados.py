"""
Baixa as partidas de todos os jogadores do webapp e grava como CSVs em
dadosTreino/ (formato identico ao do prototipo.py), prontos para o Treino.py.

Variaveis (ambiente ou arquivo .env):
    COBRINHA_URL   ex.: https://cobrinha.pages.dev
    EXPORT_TOKEN   o mesmo token configurado no Cloudflare Pages

Uso:
    python baixar_dados.py [--min-pontuacao N] [--min-passos N]

So partidas COMPLETAS e validadas pelo servidor entram. Partidas ja baixadas
(dados_web_<id>.csv) sao puladas.
"""

import argparse
import csv
import json
import os
import urllib.error
import urllib.parse
import urllib.request

from features import COLUNAS_ABSOLUTAS

PASTA_PROJETO = os.path.dirname(os.path.abspath(__file__))
PASTA_DADOS = os.path.join(PASTA_PROJETO, "dadosTreino")

COLUNAS_CSV = COLUNAS_ABSOLUTAS + ["decisao", "Momento"]


def carregar_env():
    caminho = os.path.join(PASTA_PROJETO, ".env")
    if not os.path.exists(caminho):
        return
    with open(caminho, encoding="utf-8") as arq:
        for linha in arq:
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                chave, valor = linha.split("=", 1)
                os.environ.setdefault(chave.strip(), valor.strip().strip('"').strip("'"))


def buscar(url, token, params):
    req = urllib.request.Request(
        url.rstrip("/") + "/api/exportar?" + urllib.parse.urlencode(params),
        headers={"Authorization": f"Bearer {token}", "User-Agent": "cobrinha-treino/1.0"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main(min_pontuacao=0, min_passos=5):
    carregar_env()
    url = os.environ.get("COBRINHA_URL")
    token = os.environ.get("EXPORT_TOKEN")

    if not url or not token:
        raise SystemExit("Defina COBRINHA_URL e EXPORT_TOKEN (ambiente ou arquivo .env).")

    os.makedirs(PASTA_DADOS, exist_ok=True)

    novas = ja_existiam = 0
    apos = 0

    while True:
        try:
            lote = buscar(url, token, {
                "apos": apos, "limite": 100,
                "min_passos": min_passos, "min_pontuacao": min_pontuacao,
            })
        except urllib.error.HTTPError as erro:
            raise SystemExit(f"Servidor recusou o download (HTTP {erro.code}). Confira o EXPORT_TOKEN.")

        for partida in lote["partidas"]:
            caminho = os.path.join(PASTA_DADOS, f"dados_web_{partida['id'][:8]}.csv")

            if os.path.exists(caminho):
                ja_existiam += 1
                continue

            with open(caminho, "w", newline="", encoding="utf-8") as arq:
                escritor = csv.DictWriter(arq, fieldnames=COLUNAS_CSV)
                escritor.writeheader()
                escritor.writerows(partida["linhas"])

            novas += 1

        apos = lote["proximo"]

        if lote["fim"]:
            break

    print(f"Partidas novas: {novas} | ja baixadas: {ja_existiam}")
    return novas


if __name__ == "__main__":
    analisador = argparse.ArgumentParser()
    analisador.add_argument("--min-pontuacao", type=int, default=0,
                            help="ignora partidas com pontuacao menor (padrao 0: igual ao jogo atual)")
    analisador.add_argument("--min-passos", type=int, default=5)
    args = analisador.parse_args()
    main(args.min_pontuacao, args.min_passos)
