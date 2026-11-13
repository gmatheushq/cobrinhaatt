"""
Treino coletivo em um comando:

    python atualizar_modelo.py            # baixa partidas + treina + publica modelo
    python atualizar_modelo.py --sem-download   # so treina com o que ja esta em dadosTreino

1. baixar_dados.py  -> partidas de todos os jogadores viram CSVs em dadosTreino/
2. Treino.py        -> o MESMO algoritmo de sempre (RandomForest), sem alteracoes
3. exportar_modelo_web.py -> docs/modelo.json (a IA do site)
4. guarda a versao em modelos/ (modelos/versoes.json + copia compactada)

Depois publique: git add -A && git commit && git push (o Cloudflare Pages atualiza sozinho).
Coleta e treino sao separados: o site so grava partidas; o treino roda fora dele.
"""

import argparse
import glob
import gzip
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone

import pandas as pd

PASTA_PROJETO = os.path.dirname(os.path.abspath(__file__))
PASTA_DADOS = os.path.join(PASTA_PROJETO, "dadosTreino")
PASTA_MODELOS = os.path.join(PASTA_PROJETO, "modelos")
VERSOES = os.path.join(PASTA_MODELOS, "versoes.json")


def contar_dados():
    arquivos = glob.glob(os.path.join(PASTA_DADOS, "*.csv"))
    registros = sum(len(pd.read_csv(a)) for a in arquivos)
    return len(arquivos), registros


def main():
    analisador = argparse.ArgumentParser()
    analisador.add_argument("--sem-download", action="store_true")
    args = analisador.parse_args()

    if not args.sem_download:
        import baixar_dados
        baixar_dados.main()

    partidas, registros = contar_dados()
    print(f"\nTreinando com {partidas} partidas ({registros} jogadas)...\n")

    ambiente = dict(os.environ, MPLBACKEND="Agg")  # sem janela de grafico
    subprocess.run([sys.executable, os.path.join(PASTA_PROJETO, "Treino.py")],
                   check=True, cwd=PASTA_PROJETO, env=ambiente)

    os.makedirs(PASTA_MODELOS, exist_ok=True)
    versoes = json.load(open(VERSOES, encoding="utf-8")) if os.path.exists(VERSOES) else []
    meta = {
        "versao": str(len(versoes) + 1),
        "criado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "partidas": partidas,
        "registros": registros,
    }

    import exportar_modelo_web
    exportar_modelo_web.main(meta)

    # Versao arquivada (JSON compactado) + indice.
    with open(exportar_modelo_web.CAMINHO_SAIDA, "rb") as origem, \
            gzip.open(os.path.join(PASTA_MODELOS, f"modelo_v{meta['versao']}.json.gz"), "wb") as destino:
        shutil.copyfileobj(origem, destino)

    versoes.append(meta)
    with open(VERSOES, "w", encoding="utf-8") as arq:
        json.dump(versoes, arq, indent=2, ensure_ascii=False)

    print(f"\nModelo v{meta['versao']} pronto: docs/modelo.json e modelos/modelo_v{meta['versao']}.json.gz")


if __name__ == "__main__":
    main()
