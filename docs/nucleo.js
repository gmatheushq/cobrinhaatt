// Regras do jogo e features. Porte fiel do prototipo.py (unidades em CELULAS).
// Mesmo modulo no navegador (jogo) e no servidor (validacao por replay).

export const NOMES = ["Cima", "Baixo", "Esquerda", "Direita"]; // indices usados no envio
export const DIRS = {
  Cima: [0, -1],
  Baixo: [0, 1],
  Esquerda: [-1, 0],
  Direita: [1, 0],
};
export const TABULEIROS = [
  [40, 30], // paisagem (o tabuleiro original 800x600 / 20px)
  [30, 40], // retrato (mesmo jogo, girado)
];
export const RESULTADOS = ["parede", "corpo", "venceu", "abandonada"];

const igual = (a, b) => a[0] === b[0] && a[1] === b[1];

export function inicioDe(cols, linhas) {
  return [cols / 2, linhas / 2]; // (400,300) em pixels -> (20,15)
}

export function criarEstado(cols, linhas) {
  return {
    cols,
    linhas,
    cobra: [inicioDe(cols, linhas)],
    dirPasso: "Direita", // direcao do ultimo passo executado
    fruta: null,
    pontuacao: 0,
    momento: 0,
    fim: false,
    venceu: false,
    resultado: null, // "parede" | "corpo" | "venceu"
  };
}

function fora(est, c) {
  return c[0] < 0 || c[0] >= est.cols || c[1] < 0 || c[1] >= est.linhas;
}

// Parede ou corpo. A ponta do rabo sai do lugar no proximo passo, entao nao conta.
function ehPerigo(est, c) {
  if (fora(est, c)) return true;
  const corpo = est.cobra.length > 1 ? est.cobra.slice(0, -1) : [];
  return corpo.some((s) => igual(s, c));
}

export function gerarFruta(est, rnd = Math.random) {
  const ocupado = new Set(est.cobra.map((s) => s[0] + "," + s[1]));
  const livres = [];
  for (let x = 0; x < est.cols; x++)
    for (let y = 0; y < est.linhas; y++)
      if (!ocupado.has(x + "," + y)) livres.push([x, y]);
  return livres.length ? livres[Math.floor(rnd() * livres.length)] : null;
}

// Mesmas colunas gravadas nos CSVs pelo prototipo.py (features.COLUNAS_ABSOLUTAS).
export function features(est) {
  const [hx, hy] = est.cobra[0];
  const dx = est.fruta ? est.fruta[0] - hx : 0;
  const dy = est.fruta ? est.fruta[1] - hy : 0;
  const perigo = (nome) =>
    ehPerigo(est, [hx + DIRS[nome][0], hy + DIRS[nome][1]]) ? 1 : 0;
  return {
    dx,
    dy,
    dir_cima: est.dirPasso === "Cima" ? 1 : 0,
    dir_baixo: est.dirPasso === "Baixo" ? 1 : 0,
    dir_esquerda: est.dirPasso === "Esquerda" ? 1 : 0,
    dir_direita: est.dirPasso === "Direita" ? 1 : 0,
    perigo_cima: perigo("Cima"),
    perigo_baixo: perigo("Baixo"),
    perigo_esquerda: perigo("Esquerda"),
    perigo_direita: perigo("Direita"),
    TamanhoCobrinha: est.cobra.length,
  };
}

// Proibe meia-volta (so com a cobra maior que 1), comparando com o ultimo passo executado.
export function movimentoValido(est, nome, referencia = est.dirPasso) {
  if (est.cobra.length <= 1) return true;
  const a = DIRS[nome];
  const b = DIRS[referencia];
  return !(a[0] === -b[0] && a[1] === -b[1]);
}

// Executa um passo (porte de atualizar_jogo, ja com a direcao decidida).
// escolherFruta(est) devolve a proxima fruta; no replay do servidor e omitida
// (a fruta fica pendente ate o proximo registro informa-la).
export function passo(est, nome, escolherFruta = null) {
  est.momento += 1;
  const feats = features(est);
  const d = DIRS[nome];
  const [hx, hy] = est.cobra[0];
  const nova = [hx + d[0], hy + d[1]];

  const comeu = est.fruta !== null && igual(nova, est.fruta);
  const corpo = comeu ? est.cobra : est.cobra.slice(0, -1);
  const bateuParede = fora(est, nova);
  const bateuCorpo = corpo.some((s) => igual(s, nova));

  const registro = { ...feats, decisao: nome, Momento: est.momento };

  if (bateuParede || bateuCorpo) {
    est.fim = true;
    est.resultado = bateuParede ? "parede" : "corpo";
  } else {
    est.cobra.unshift(nova);
    est.dirPasso = nome;
    if (comeu) {
      est.pontuacao += 1;
      if (est.cobra.length >= est.cols * est.linhas) {
        est.venceu = true;
        est.fim = true;
        est.resultado = "venceu";
        est.fruta = null;
      } else {
        est.fruta = escolherFruta ? escolherFruta(est) : null;
      }
    } else {
      est.cobra.pop();
    }
  }
  return registro;
}

// --------------------------------------------------------------------------
// Replay: recria a partida a partir do envio e recalcula TODAS as features.
// Nada vindo do cliente alem da fruta (dx,dy) e da decisao e confiado.
// passos: [[dx, dy, indiceDaDecisao], ...]
// --------------------------------------------------------------------------
export function reproduzir(p) {
  const est = criarEstado(p.cols, p.linhas);
  const linhas = [];

  for (let i = 0; i < p.passos.length; i++) {
    if (est.fim) return { ok: false, erro: "passos apos o fim da partida" };

    const [dx, dy, di] = p.passos[i];
    const nome = NOMES[di];
    const [hx, hy] = est.cobra[0];
    const fruta = [hx + dx, hy + dy];

    if (est.fruta === null) {
      if (fora(est, fruta) || est.cobra.some((s) => igual(s, fruta)))
        return { ok: false, erro: `fruta invalida no passo ${i + 1}` };
      est.fruta = fruta;
    } else if (!igual(est.fruta, fruta)) {
      return { ok: false, erro: `fruta mudou sem ser comida no passo ${i + 1}` };
    }

    if (!movimentoValido(est, nome))
      return { ok: false, erro: `meia-volta no passo ${i + 1}` };

    linhas.push(passo(est, nome));
  }

  const esperado = p.resultado;
  if (esperado === "abandonada") {
    if (est.fim) return { ok: false, erro: "abandonada, mas a partida ja tinha acabado" };
  } else if (est.resultado !== esperado) {
    return { ok: false, erro: `resultado ${esperado} nao confere (${est.resultado})` };
  }
  if (est.pontuacao !== p.pontuacao) return { ok: false, erro: "pontuacao nao confere" };

  return { ok: true, linhas, pontuacao: est.pontuacao, resultado: esperado };
}

// --------------------------------------------------------------------------
// IA: floresta exportada por exportar_modelo_web.py (media das probabilidades
// das arvores, igual ao predict() do scikit-learn).
// --------------------------------------------------------------------------
const VET = DIRS;
const esq = (v) => [v[1], -v[0]];
const dir = (v) => [-v[1], v[0]];
const nomeDe = (v) => NOMES.find((n) => igual(VET[n], v));
const COL_PERIGO = {
  Cima: "perigo_cima",
  Baixo: "perigo_baixo",
  Esquerda: "perigo_esquerda",
  Direita: "perigo_direita",
};

// features.para_relativo
export function paraRelativo(f, nomeDirecao) {
  const frente = VET[nomeDirecao];
  const e = esq(frente);
  const d = dir(frente);
  return [
    f.dx * frente[0] + f.dy * frente[1], // fruta_frente
    f.dx * e[0] + f.dy * e[1], // fruta_esq
    f[COL_PERIGO[nomeDirecao]], // rel_perigo_frente
    f[COL_PERIGO[nomeDe(e)]], // rel_perigo_esq
    f[COL_PERIGO[nomeDe(d)]], // rel_perigo_dir
    f.TamanhoCobrinha,
  ];
}

export function preverAcao(modelo, x) {
  const k = modelo.classes.length;
  const soma = new Array(k).fill(0);
  for (const a of modelo.arvores) {
    let i = 0;
    while (a.f[i] >= 0) i = x[a.f[i]] <= a.t[i] ? i + 1 : a.r[i];
    const base = a.t[i] * k;
    for (let c = 0; c < k; c++) soma[c] += a.p[base + c];
  }
  let melhor = 0;
  for (let c = 1; c < k; c++) if (soma[c] > soma[melhor]) melhor = c;
  return modelo.classes[melhor];
}

// features.absoluto_de
export function absolutoDe(acao, nomeDirecao) {
  const frente = VET[nomeDirecao];
  if (acao === "Esquerda") return nomeDe(esq(frente));
  if (acao === "Direita") return nomeDe(dir(frente));
  return nomeDirecao;
}

export function decidirIA(modelo, est) {
  const f = features(est);
  return absolutoDe(preverAcao(modelo, paraRelativo(f, est.dirPasso)), est.dirPasso);
}
