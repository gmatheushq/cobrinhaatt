import {
  DIRS, NOMES, TABULEIROS, criarEstado, gerarFruta, movimentoValido, passo, decidirIA,
} from "./nucleo.js";

// ==================================================
// CONFIGURACOES (iguais ao prototipo.py)
// ==================================================
const INTERVALO_MOVIMENTO = 120;
const TEMPO_REINICIO_IA = 800;
const COR = {
  fundo: "#009600", fruta: "#ffdc00", cabeca: "#ff0000", corpo: "#b40000",
};
const API = "/api/partida";
const CHAVE_FILA = "cobrinha_fila_v1";
const CHAVE_JOGADOR = "cobrinha_jogador";
const MAX_FILA = 30;

const $ = (id) => document.getElementById(id);
const canvas = $("tela");
const ctx = canvas.getContext("2d");

// ==================================================
// IDENTIFICADOR ANONIMO (so neste navegador)
// ==================================================
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function guardado(chave, criar) {
  try {
    let v = localStorage.getItem(chave);
    if (!v) { v = criar(); localStorage.setItem(chave, v); }
    return v;
  } catch { return criar(); }
}
const jogador = guardado(CHAVE_JOGADOR, uuid);

// ==================================================
// ENVIO PARA O BANCO: fila local + reenvio (nao perde partida)
// ==================================================
let enviando = false;
let tentativas = 0;
let timerReenvio = null;

function lerFila() {
  try { return JSON.parse(localStorage.getItem(CHAVE_FILA) || "[]"); } catch { return []; }
}
function gravarFila(f) {
  try { localStorage.setItem(CHAVE_FILA, JSON.stringify(f)); }
  catch { // cheio: descarta as mais antigas ate caber
    while (f.length > 1) { f.shift(); try { localStorage.setItem(CHAVE_FILA, JSON.stringify(f)); return; } catch {} }
  }
}
function enfileirar(payload) {
  const f = lerFila().filter((p) => p.id !== payload.id);
  f.push(payload);
  while (f.length > MAX_FILA) f.shift();
  gravarFila(f);
}
function remover(id) { gravarFila(lerFila().filter((p) => p.id !== id)); }

let msgStatus = "";
function mostrarStatus(texto, fadeMs = 0) {
  msgStatus = texto;
  $("status").textContent = texto;
  if (fadeMs) setTimeout(() => { if (msgStatus === texto) $("status").textContent = ""; }, fadeMs);
}

async function enviarFila() {
  if (enviando) return;
  const fila = lerFila();
  if (!fila.length) { mostrarStatus(""); return; }
  enviando = true;
  let falhou = false, enviou = false;
  try {
    for (const p of fila) {
      let r;
      try {
        r = await fetch(API, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p),
        });
      } catch { falhou = true; break; } // sem conexao
      if (r.ok) { remover(p.id); enviou = true; }
      else if (r.status === 429 || r.status >= 500) { falhou = true; break; } // tenta depois
      else { remover(p.id); console.warn("Partida recusada pelo servidor:", r.status); } // invalida: nao reenviar
    }
  } finally { enviando = false; }

  if (falhou) {
    mostrarStatus("sem conexão: será enviado depois");
    tentativas++;
    clearTimeout(timerReenvio);
    timerReenvio = setTimeout(enviarFila, Math.min(60000, 2000 * 2 ** tentativas));
  } else {
    tentativas = 0;
    if (enviou) mostrarStatus("partida salva ✓", 2500); else mostrarStatus("");
  }
}
addEventListener("online", () => { tentativas = 0; enviarFila(); });

// Guarda a partida em curso se a pagina for fechada / minimizada (fica marcada como
// "abandonada" e nao entra no treino).
function salvarAbandonada() {
  if (!partida || !partida.humano || partida.passos.length === 0) return;
  if (partida.passos.length === partida.ultimoSalvo) return;
  partida.ultimoSalvo = partida.passos.length;
  const p = montarPayload("abandonada");
  enfileirar(p);
  try {
    const corpo = JSON.stringify(p);
    if (corpo.length < 60000)
      fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: corpo, keepalive: true })
        .then((r) => { if (r.ok) remover(p.id); }).catch(() => {});
  } catch {}
  partida.id = uuid(); // se o jogador voltar e continuar, e outra partida no banco
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") salvarAbandonada(); });
addEventListener("pagehide", salvarAbandonada);

// ==================================================
// ESTADO DO JOGO
// ==================================================
let modelo = null;
let tela = "MENU";        // MENU | JOGO | FIM
let modo = null;          // HUMANO | IA
let est = null;           // estado do motor (nucleo.js)
let partida = null;       // dados para o banco
let estado = "parado";    // parado | pronto (aguarda o 1o gesto) | jogo | morto
let direcao = "Direita";
let buffer = [];
let acumulado = 0;
let tempoJogo = 0;
let rodadasIA = 0;
let reinicioIA = 0;
let dispositivo = "teclado";

function montarPayload(resultado) {
  return {
    v: 1, id: partida.id, jogador, cols: est.cols, linhas: est.linhas, resultado,
    pontuacao: est.pontuacao, tempo_ms: Math.round(tempoJogo),
    dispositivo: partida.dispositivo, passos: partida.passos,
  };
}

function iniciar(novoModo) {
  if (novoModo) modo = novoModo;
  const r = $("palco").clientWidth / $("palco").clientHeight;
  const [cols, linhas] = TABULEIROS[r >= 1 ? 0 : 1]; // retrato usa o tabuleiro girado
  est = criarEstado(cols, linhas);
  est.fruta = gerarFruta(est);
  direcao = "Direita";
  buffer = [];
  acumulado = 0;
  tempoJogo = 0;
  partida = { id: uuid(), humano: modo === "HUMANO", passos: [], ultimoSalvo: 0, dispositivo };
  tela = "JOGO";
  $("menu").hidden = true;
  $("fim").hidden = true;
  $("sair").hidden = modo !== "IA";
  $("pont").textContent = "Pontuação: 0";
  atualizarInfo();
  if (modo === "HUMANO") {
    estado = "pronto";
    dica("Deslize o dedo para começar");
  } else {
    estado = "jogo";
    dica("");
  }
  ajustarTamanho();
}

function atualizarInfo() {
  $("info").textContent = modo === "IA"
    ? `IA ${modelo?.versao ? "v" + modelo.versao + " · " : ""}Rodada ${rodadasIA}`
    : "";
}

function dica(txt) { $("dica").hidden = !txt; $("dica").textContent = txt; }

function pedirDirecao(nome, tipo) {
  if (tela !== "JOGO" || modo !== "HUMANO") return;
  if (estado !== "pronto" && estado !== "jogo") return;
  if (tipo) dispositivo = tipo;
  if (estado === "pronto") {
    partida.dispositivo = dispositivo;
    buffer = [nome];
    estado = "jogo";
    dica("");
    return;
  }
  const ref = buffer.length ? buffer[buffer.length - 1] : direcao;
  if (nome === ref) return;
  const a = DIRS[nome], b = DIRS[ref];
  if (est.cobra.length > 1 && a[0] === -b[0] && a[1] === -b[1]) return;
  if (buffer.length < 2) buffer.push(nome); // guarda 1 gesto a frente: curvas rapidas nao se perdem
}

function atualizarJogo() {
  if (modo === "HUMANO") {
    if (buffer.length) {
      const n = buffer.shift();
      if (movimentoValido(est, n)) direcao = n;
    }
  } else {
    const n = decidirIA(modelo, est);
    if (movimentoValido(est, n)) direcao = n;
  }

  const reg = passo(est, direcao, (e) => gerarFruta(e));
  if (modo === "HUMANO") partida.passos.push([reg.dx, reg.dy, NOMES.indexOf(reg.decisao)]);
  $("pont").textContent = `Pontuação: ${est.pontuacao}`;

  if (est.fim) terminar();
}

function terminar() {
  estado = "morto";
  if (modo === "HUMANO") {
    enfileirar(montarPayload(est.resultado));
    partida.ultimoSalvo = partida.passos.length;
    mostrarStatus("salvando…");
    enviarFila();
    setTimeout(() => {
      if (estado !== "morto") return;
      tela = "FIM";
      $("fim").classList.toggle("venceu", est.venceu);
      $("f-titulo").textContent = est.venceu ? "VOCÊ VENCEU!" : "GAME OVER";
      $("f-pont").textContent = `Pontuação final: ${est.pontuacao}`;
      $("f-nota").textContent = "Suas jogadas ajudam a treinar a IA.";
      $("fim").hidden = false;
    }, 600);
  } else {
    reinicioIA = 0;
    dica(est.venceu ? "IA VENCEU!" : `IA perdeu! Pontuação: ${est.pontuacao}`);
  }
}

// ==================================================
// DESENHO
// ==================================================
let celula = 10;

function ajustarTamanho() {
  if (!est) return;
  const p = $("palco");
  celula = Math.max(4, Math.floor(Math.min(p.clientWidth / est.cols, p.clientHeight / est.linhas)));
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = est.cols * celula + "px";
  canvas.style.height = est.linhas * celula + "px";
  canvas.width = Math.round(est.cols * celula * dpr);
  canvas.height = Math.round(est.linhas * celula * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener("resize", ajustarTamanho);

function desenhar() {
  if (!est) return;
  ctx.fillStyle = COR.fundo;
  ctx.fillRect(0, 0, est.cols * celula, est.linhas * celula);
  if (est.fruta) {
    ctx.fillStyle = COR.fruta;
    ctx.fillRect(est.fruta[0] * celula, est.fruta[1] * celula, celula, celula);
  }
  est.cobra.forEach((s, i) => {
    ctx.fillStyle = i === 0 ? COR.cabeca : COR.corpo;
    ctx.fillRect(s[0] * celula, s[1] * celula, celula, celula);
  });
}

// ==================================================
// LOOP
// ==================================================
let ultimo = performance.now();
function quadro(agora) {
  const dt = Math.min(100, agora - ultimo); // aba em segundo plano nao "pula" o jogo
  ultimo = agora;

  if (tela === "JOGO" && estado === "jogo") {
    acumulado += dt;
    tempoJogo += dt;
    if (acumulado >= INTERVALO_MOVIMENTO) {
      acumulado = 0;
      atualizarJogo();
    }
  } else if (tela === "JOGO" && estado === "morto" && modo === "IA") {
    reinicioIA += dt;
    if (reinicioIA >= TEMPO_REINICIO_IA) { rodadasIA++; iniciar(); }
  }
  desenhar();
  requestAnimationFrame(quadro);
}

// ==================================================
// ENTRADA: SWIPE (toque) E TECLADO
// ==================================================
const palco = $("palco");
let origem = null;

palco.addEventListener("pointerdown", (e) => {
  origem = { x: e.clientX, y: e.clientY, id: e.pointerId };
  try { palco.setPointerCapture(e.pointerId); } catch {}
  e.preventDefault();
});
palco.addEventListener("pointermove", (e) => {
  if (!origem || e.pointerId !== origem.id) return;
  const dx = e.clientX - origem.x, dy = e.clientY - origem.y;
  const limite = Math.max(12, Math.min(28, celula * 1.5)); // distancia minima do gesto
  if (Math.max(Math.abs(dx), Math.abs(dy)) < limite) return;
  const nome = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "Direita" : "Esquerda") : (dy > 0 ? "Baixo" : "Cima");
  pedirDirecao(nome, "toque");
  origem = { x: e.clientX, y: e.clientY, id: e.pointerId }; // gestos encadeados sem tirar o dedo
  e.preventDefault();
});
const soltar = (e) => { if (origem && e.pointerId === origem.id) origem = null; };
palco.addEventListener("pointerup", soltar);
palco.addEventListener("pointercancel", soltar);
// iOS Safari: impede a rolagem/elastico da pagina durante o gesto.
document.addEventListener("touchmove", (e) => { if (palco.contains(e.target)) e.preventDefault(); }, { passive: false });
document.addEventListener("contextmenu", (e) => e.preventDefault());

const TECLAS = {
  ArrowRight: "Direita", ArrowLeft: "Esquerda", ArrowUp: "Cima", ArrowDown: "Baixo",
  d: "Direita", a: "Esquerda", w: "Cima", s: "Baixo",
};
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modo === "IA" && tela === "JOGO") { sair(); return; }
  const nome = TECLAS[e.key] || TECLAS[e.key.toLowerCase?.()];
  if (!nome) return;
  if (tela === "JOGO") { e.preventDefault(); pedirDirecao(nome, "teclado"); }
});

// ==================================================
// MENUS
// ==================================================
function sair() {
  estado = "parado"; tela = "MENU"; modo = null; est = null;
  dica(""); $("sair").hidden = true; $("info").textContent = ""; $("pont").textContent = "Pontuação: 0";
  $("menu").hidden = false; $("fim").hidden = true;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

$("b-humano").onclick = () => iniciar("HUMANO");
$("b-de-novo").onclick = () => iniciar();
$("b-menu").onclick = sair;
$("sair").onclick = sair;

$("b-ia").onclick = async () => {
  const b = $("b-ia");
  if (!modelo) {
    b.disabled = true; b.textContent = "CARREGANDO A IA…";
    try {
      const r = await fetch("modelo.json");
      if (!r.ok) throw new Error(r.status);
      modelo = await r.json();
    } catch {
      b.textContent = "IA INDISPONÍVEL (sem conexão)";
      setTimeout(() => { b.disabled = false; b.textContent = "JOGAR COM A IA"; }, 2500);
      return;
    }
    b.disabled = false; b.textContent = "JOGAR COM A IA";
  }
  rodadasIA = 1;
  iniciar("IA");
};

if (matchMedia("(pointer: coarse)").matches) dispositivo = "toque";
else $("m-dica").textContent = "Use as setas ou WASD. Na tela de toque, é só deslizar o dedo.";

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

enviarFila(); // reenvia partidas que ficaram pendentes
requestAnimationFrame(quadro);
