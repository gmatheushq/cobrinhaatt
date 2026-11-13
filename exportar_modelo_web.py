"""
Exporta o modelo_cobrinha.pkl para docs/modelo.json, que o jogo no
navegador usa para a IA jogar (sem servidor, sem Python no celular).

Uso:
    python exportar_modelo_web.py

Rode depois de cada Treino.py e publique de novo a pasta docs.
"""

import json
import os

import joblib

from features import COLUNAS_MODELO

PASTA_PROJETO = os.path.dirname(os.path.abspath(__file__))
CAMINHO_MODELO = os.path.join(PASTA_PROJETO, "modelo_cobrinha.pkl")
CAMINHO_SAIDA = os.path.join(PASTA_PROJETO, "docs", "modelo.json")

ESCALA = 10000  # probabilidades guardadas como inteiros de 0 a 10000


def exportar_arvore(estimador):
    t = estimador.tree_
    n = t.node_count

    for i in range(n):
        esq = t.children_left[i]
        if esq != -1 and esq != i + 1:
            raise ValueError("Ordem de nos inesperada: filho esquerdo != proximo no.")

    f, th, r, folhas = [], [], [], []

    for i in range(n):
        if t.children_left[i] == -1:
            valores = t.value[i, 0, :].astype(float)
            soma = valores.sum() or 1.0
            f.append(-1)
            th.append(len(folhas) // len(valores))  # indice da folha
            r.append(-1)
            folhas.extend(int(round(v / soma * ESCALA)) for v in valores)
        else:
            f.append(int(t.feature[i]))
            th.append(round(float(t.threshold[i]), 4))
            r.append(int(t.children_right[i]))

    return {"f": f, "t": th, "r": r, "p": folhas}


def main(meta=None):
    modelo = joblib.load(CAMINHO_MODELO)

    if list(modelo.feature_names_in_) != COLUNAS_MODELO:
        raise ValueError("Modelo treinado com colunas diferentes de features.COLUNAS_MODELO.")

    dados = {
        "classes": [str(c) for c in modelo.classes_],
        "colunas": COLUNAS_MODELO,
        "escala": ESCALA,
        **(meta or {}),  # versao, criado, partidas, registros
        "arvores": [exportar_arvore(e) for e in modelo.estimators_],
    }

    with open(CAMINHO_SAIDA, "w", encoding="utf-8") as arq:
        json.dump(dados, arq, separators=(",", ":"))

    print(f"docs/modelo.json gerado ({os.path.getsize(CAMINHO_SAIDA) / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
