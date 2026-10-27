/* =====================================================
   SOBREVIVA — versão melhorada
   - Inimigos novos aparecem em tempos diferentes
   - Boss a cada 5 minutos
   - Vida em 5 corações
===================================================== */

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const $ = (id) => document.getElementById(id);

// Sprites dos zumbis
const zombie1Img = new Image();
zombie1Img.src = "asset/sZombie1_A_strip.png";

const zombie2Img = new Image();
zombie2Img.src = "asset/sZombie2_A_strip.png";

const personagemImg = new Image();

personagemImg.src = "asset/personagem_animado.png";

personagemImg.onload = () => {
    console.log("Sprite carregada!");
    console.log("Largura:", personagemImg.naturalWidth);
    console.log("Altura:", personagemImg.naturalHeight);
};

let quadroPersonagem = 0;
let tempoAnimacaoPersonagem = 0;

personagemImg.onerror = () => {
    console.error("Erro ao carregar a sprite do personagem!");
};
let frameZombie = 0;
let contadorFrameZombie = 0;

const imagemArmas = new Image();
imagemArmas.src = "asset/armas_sprites.png";

const menu = $("menu"), instructions = $("instructions"),
      gameScreen = $("gameScreen"), gameOver = $("gameOver");
const startButton = $("startButton"), instructionsButton = $("instructionsButton"),
      backButton = $("backButton"), restartButton = $("restartButton"),
      menuButton = $("menuButton");
const modoNormalButton = $("modoNormalButton"), modoDificilButton = $("modoDificilButton"),
      modeDesc = $("modeDesc");
const healthText = $("healthText"), scoreText = $("scoreText"),
      timeText = $("timeText"), enemyText = $("enemyText"),
      menuHighScore = $("menuHighScore"), finalScore = $("finalScore"),
      finalTime = $("finalTime"), finalHighScore = $("finalHighScore");
const ammoHud = $("ammoHud"), ammoText = $("ammoText"),
      hordaHud = $("hordaHud"), hordaText = $("hordaText");

/* =====================================================
   CONFIGURAÇÕES
===================================================== */

const VIDAS_MAX = 5;          // 5 corações
const INTERVALO_BOSS = 15;   // boss a cada 300s (5 min) — modo normal
const RAIO_ATAQUE_ESPECIAL = 160;
const ATAQUE_ESPECIAL_COOLDOWN = 25 * 1000;
const ATAQUE_ESPECIAL_DANO_PCT = 0.15;
const ATAQUE_ESPECIAL_INVULN = 500;

/* ---- Modos de jogo ---- */
const MODO = { NORMAL: "normal", DIFICIL: "dificil" };
let modoJogo = MODO.NORMAL;

/* ---- Sistema de hordas (modo difícil) ----
   A cada HORDAS_POR_NOVO_TIPO hordas, libera um novo tipo de inimigo.
   A cada HORDAS_POR_BOSS hordas, aparece um boss em vez de uma horda normal. */
const ORDEM_TIPOS_DIFICIL = ["normal", "rapido", "tanque", "zigzag", "divisor", "atirador"];
const HORDAS_POR_NOVO_TIPO = 2;
const BALAS_MAX_DIFICIL = 12;   // munição máxima no modo difícil
const INTERVALO_MUNICAO = 12000;   // a cada ~12s garante uma munição extra no mapa (modo difícil)

let horda = 0;
let especialDesbloqueado = false;
let golpes = [];
let hordaInimigosAlvo = 0, hordaInimigosGerados = 0;
let hordaEmAndamento = false;
let hordaSpawnTimer = 0;
let hordaAguardando = false, hordaPausaTimer = 0;
const PAUSA_ENTRE_HORDAS = 3000;   // ms de intervalo entre uma horda e a próxima
let hordaDesdeUltimoBoss = 0;      // conta hordas desde o último boss (reinicia a cada boss)
let municaoTimer = INTERVALO_MUNICAO / 2;
let tiposDesbloqueadosDificil = new Set(["normal"]);

/* No nível 1 o boss aparece a cada 5 hordas; no nível 2, a cada 10; nível 3, 15... */
function hordasParaProximoBoss() {
    return 5 * nivel;
}

/* Dificuldade automática: cada vez que o nível sobe (ao derrotar um boss),
   os inimigos ficam mais fortes, rápidos e frequentes.
   vel   = multiplicador da velocidade dos inimigos
   vida  = multiplicador da vida dos inimigos
   spawn = multiplicador do intervalo entre inimigos (menor = mais inimigos) */
const DIFICULDADE_NIVEL = {
    velInicial: 0.65,  velPorNivel: 0.17,  velMax: 1.6,     // nível 1: bem lento
    vidaInicial: 0.50, vidaPorNivel: 0.25,                  // nível 1: metade da vida
    spawnInicial: 2.0, spawnPorNivel: -0.30, spawnMin: 0.5  // nível 1: poucos inimigos
};

function configNivel() {
    const d = DIFICULDADE_NIVEL, n = nivel - 1;
    return {
        vel: Math.min(d.velMax, d.velInicial + d.velPorNivel * n),
        vida: d.vidaInicial + d.vidaPorNivel * n,
        spawn: Math.max(d.spawnMin, d.spawnInicial + d.spawnPorNivel * n)
    };
}

/* Cada inimigo "desbloqueia" em um tempo (segundos) no modo normal.
   No modo difícil, o desbloqueio é por horda (ver ORDEM_TIPOS_DIFICIL).
   peso = chance relativa de ser sorteado. */
const TIPOS_INIMIGO = {
    normal: {
        nome: "NORMAL", desbloqueia: 0,
        peso: (t) => Math.max(2, 10 - t / 30),   // fica mais raro com o tempo
        raio: 18, vel: 1.4, velEsc: 0.05, vida: 40, vidaEsc: 4,
        dano: 1, pontos: 10, cor: "#e74c3c"
    },
    rapido: {
        nome: "RÁPIDO", desbloqueia: 60,
        peso: () => 3,
        raio: 13, vel: 3, velEsc: 0.06, vida: 25, vidaEsc: 3,
        dano: 1, pontos: 20, cor: "#f1c40f"
    },
    tanque: {
        nome: "TANQUE", desbloqueia: 120,
        peso: () => 2,
        raio: 25, vel: 0.8, velEsc: 0.03, vida: 100, vidaEsc: 10,
        dano: 2, pontos: 50, cor: "#8e44ad",
        tiro: { intervalo: 3500, vel: 3, raio: 5 }     // tiro fraco: lento e raro
    },
    zigzag: {
        nome: "ZIGUEZAGUE", desbloqueia: 180,
        peso: () => 3,
        raio: 15, vel: 2, velEsc: 0.05, vida: 45, vidaEsc: 5,
        dano: 1, pontos: 35, cor: "#1abc9c"
    },
    divisor: {
        nome: "DIVISOR", desbloqueiaNivel: 2,      // chega depois do boss 1
        peso: () => 2,
        raio: 20, vel: 1.2, velEsc: 0.04, vida: 60, vidaEsc: 6,
        dano: 1, pontos: 40, cor: "#fd79a8"
    },
    atirador: {
        nome: "ATIRADOR", desbloqueiaNivel: 3,     // chega depois do boss 2
        peso: () => 2,
        raio: 16, vel: 1.1, velEsc: 0.03, vida: 40, vidaEsc: 4,
        dano: 1, pontos: 60, cor: "#ecf0f1",
        tiro: { intervalo: 2200, vel: 4, raio: 6 }
    },
    /* Filhote do Divisor (nunca é sorteado sozinho) */
    mini: {
        nome: "MINI", desbloqueia: Infinity,
        peso: () => 0,
        raio: 10, vel: 2.4, velEsc: 0.05, vida: 15, vidaEsc: 1,
        dano: 1, pontos: 5, cor: "#fab1cf"
    }
};

/* =====================================================
   ESTADO
===================================================== */

let jogoRodando = false;
let score = 0, tempo = 0, ultimoTempo = 0;
let spawnTimer = 0, dificuldade = 1;
let proximoBoss = INTERVALO_BOSS, bossContador = 0;
let boss = null;
let nivel = 1;
const ARMAS = [
    {
        id: "escopeta",
        nome: "Escopeta",
        desc: "3 tiros espalhados; ótima de perto",
        dano: 14,
        intervaloTiro: 300,
        tiros: 3,
        espalhamento: 0.55,
        velTiro: 9,
        perfurante: false,
        emoji: "💥"
    },
    {
        id: "rifle",
        nome: "Rifle de Precisão",
        desc: "Tiros mais fortes e precisos",
        dano: 60,
        intervaloTiro: 350,
        tiros: 1,
        espalhamento: 0,
        velTiro: 13,
        perfurante: false,
        emoji: "🎯"
    },
    {
        id: "canhao",
        nome: "Canhão Perfurante",
        desc: "Os tiros atravessam inimigos",
        dano: 35,
        intervaloTiro: 280,
        tiros: 1,
        espalhamento: 0,
        velTiro: 11,
        perfurante: true,
        emoji: "🛡️"
    },
    {
        id: "metralhadora",
        nome: "Metralhadora Pesada",
        desc: "Dispara muito rapidamente",
        dano: 10,
        intervaloTiro: 70,
        tiros: 1,
        espalhamento: 0,
        velTiro: 11,
        perfurante: false,
        emoji: "🔥"
    },
    {
        id: "fuzil",
        nome: "Fuzil de Assalto",
        desc: "Equilíbrio entre dano e velocidade",
        dano: 24,
        intervaloTiro: 130,
        tiros: 1,
        espalhamento: 0,
        velTiro: 12,
        perfurante: false,
        emoji: "⚡"
    },
    {
        id: "canhaoduplo",
        nome: "Canhão Duplo Perfurante",
        desc: "2 tiros perfurantes simultâneos",
        dano: 25,
        intervaloTiro: 250,
        tiros: 2,
        espalhamento: 0.25,
        velTiro: 11,
        perfurante: true,
        emoji: "💫"
    }
];

let armaAtualId = null;

let armasEquipadas = [];
const MAX_ARMAS = 3;

let escolhendoUpgrade = false;

let opcoesUpgrade = [];
const cartasUpgrade = [
    { x: 0, y: 0, w: 260, h: 220 },
    { x: 0, y: 0, w: 260, h: 220 },
    { x: 0, y: 0, w: 260, h: 220 }
];
function sortearUpgrades() {
    // Só oferece armas que o jogador ainda não possui
    const disponiveis = ARMAS.filter(arma =>
        !armasEquipadas.some(equipada => equipada.id === arma.id)
    );

    // Embaralha as armas para que a ordem varie a cada sorteio
    for (let i = disponiveis.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [disponiveis[i], disponiveis[j]] =
            [disponiveis[j], disponiveis[i]];
    }

    // Oferece até 3 armas aleatórias
    return disponiveis.slice(0, 3);
}
let pausado = false, frameId = 0;
let aviso = { texto: "", tempo: 0 };
let tiposAvisados = new Set();

let ondas = [];
let tiros = [], tirosInimigos = [], inimigos = [], powerUps = [], particulas = [];


let highScore = Number(localStorage.getItem("sobrevivaHighScore")) || 0;
menuHighScore.textContent = highScore;

const jogador = {
    x: 0, y: 0, largura: 30, altura: 30,
    velocidadeBase: 4, danoBase: 25,
    velocidade: 4, dano: 25,
    vida: VIDAS_MAX,
    cooldownTiro: 0, intervaloTiro: 180,
    ataqueEspecialTimer: 0,
    tirosPorDisparo: 1,
    espalhamento: 0,
    velTiro: 10,
    perfurante: false,  
    invulneravel: 0,
    buffVel: 0,                 // tempo restante do power-up de velocidade (ms)
    balas: BALAS_MAX_DIFICIL, balasMax: BALAS_MAX_DIFICIL   // só usado no modo difícil
};

/* =====================================================
   ENTRADA
===================================================== */

const teclas = {};
document.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    teclas[k] = true;

    if (e.repeat) return;

    if (escolhendoUpgrade) {
        escolherArmaTeclado(e);
        return;
    }

    if (k === "1") trocarArma(0);
    if (k === "2") trocarArma(1);
    if (k === "3") trocarArma(2);

    if (k === "p" || k === "escape") alternarPausa();
    if (k === "m" && pausado) sairParaMenu();
});
document.addEventListener("keyup", (e) => { teclas[e.key.toLowerCase()] = false; });

const mouse = { x: canvas.width / 2, y: canvas.height / 2, pressionado: false };

canvas.addEventListener("mousemove", (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
    mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
});
canvas.addEventListener("mousedown", (e) => {if (escolhendoUpgrade) {if (e.button === 0) cliqueEscolhaArma(e);return;}if (pausado) {if (e.button === 0) cliqueNaPausa(e);return;}if (e.button === 0) mouse.pressionado = true;if (e.button === 2) usarAtaqueEspecial();});
canvas.addEventListener("mouseup", (e) => { if (e.button === 0) mouse.pressionado = false; });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

/* =====================================================
   MODO DE JOGO
===================================================== */

const DESCRICAO_MODO = {
    [MODO.NORMAL]: "Sobrevivência clássica: inimigos e boss aparecem com o tempo.",
    [MODO.DIFICIL]: "Munição limitada (recarrega ao matar). Inimigos em hordas: novo tipo a cada 3, boss a cada 5."
};

function selecionarModo(m) {
    modoJogo = m;
    modoNormalButton.classList.toggle("active", m === MODO.NORMAL);
    modoDificilButton.classList.toggle("active", m === MODO.DIFICIL);
    modeDesc.textContent = DESCRICAO_MODO[m];
}

modoNormalButton.addEventListener("click", () => selecionarModo(MODO.NORMAL));
modoDificilButton.addEventListener("click", () => selecionarModo(MODO.DIFICIL));

/* =====================================================
   TELAS
===================================================== */

function mostrarTela(tela) {
    [menu, instructions, gameScreen, gameOver].forEach((t) => t.classList.remove("active"));
    tela.classList.add("active");
}

function iniciarJogo() {
    score = 0; tempo = 0; dificuldade = 1; spawnTimer = 0;
    nivel = 1;
    proximoBoss = INTERVALO_BOSS; bossContador = 0; boss = null;
    pausado = false;
    aviso = { texto: "", tempo: 0 };
    tiposAvisados = new Set();
    ondas = []; tiros = []; tirosInimigos = []; inimigos = []; powerUps = []; particulas = [];

    horda = 0; hordaInimigosAlvo = 0; hordaInimigosGerados = 0;
    hordaEmAndamento = false; hordaSpawnTimer = 0;
    hordaAguardando = false; hordaPausaTimer = 0;
    hordaDesdeUltimoBoss = 0; municaoTimer = INTERVALO_MUNICAO / 2;
    tiposDesbloqueadosDificil = new Set(["normal"]);

    armaAtualId = "pistola";

    armasEquipadas = [{
    id: "pistola",
    nome: "Pistola",
    dano: jogador.danoBase,
    intervaloTiro: 180,
    tiros: 1,
    espalhamento: 0,
    velTiro: 10,
    perfurante: false,
    emoji: "🔫"
}];
    escolhendoUpgrade = false;
    opcoesUpgrade = [];

    especialDesbloqueado = false;
    golpes = [];

    jogador.ataqueEspecialTimer = 0;
    jogador.dano = jogador.danoBase;
    jogador.intervaloTiro = 180;
    jogador.tirosPorDisparo = 1;
    jogador.espalhamento = 0;
    jogador.velTiro = 10;
    jogador.perfurante = false;
    jogador.x = canvas.width / 2;
    jogador.y = canvas.height / 2;
    jogador.vida = VIDAS_MAX;
    jogador.cooldownTiro = 0; jogador.invulneravel = 0;
    jogador.buffVel = 0;
    jogador.balasMax = BALAS_MAX_DIFICIL;
    jogador.balas = BALAS_MAX_DIFICIL;

    jogoRodando = true;
    ultimoTempo = performance.now();
    mostrarTela(gameScreen);
    cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(loop);
}

function finalizarJogo() {
    jogoRodando = false;
    mouse.pressionado = false;

    if (score > highScore) {
        highScore = score;
        localStorage.setItem("sobrevivaHighScore", highScore);
    }
    finalScore.textContent = score;
    finalTime.textContent = Math.floor(tempo);
    finalHighScore.textContent = highScore;
    menuHighScore.textContent = highScore;
    mostrarTela(gameOver);
}

function mostrarAviso(texto, ms = 3000, acumular = false) {
    if (acumular && aviso.tempo > 0) texto = aviso.texto + "\n" + texto;
    aviso = { texto, tempo: ms };
}

/* =====================================================
   JOGADOR
===================================================== */

function atualizarJogador(delta) {
    const dt = delta * 16.67;

    let mx = ((teclas["d"] || teclas["arrowright"]) ? 1 : 0) -
             ((teclas["a"] || teclas["arrowleft"]) ? 1 : 0);
    let my = ((teclas["s"] || teclas["arrowdown"]) ? 1 : 0) -
             ((teclas["w"] || teclas["arrowup"]) ? 1 : 0);

    /* Power-ups temporários (sem setTimeout, não acumulam) */
    jogador.buffVel = Math.max(0, jogador.buffVel - dt);
    jogador.velocidade = jogador.velocidadeBase + (jogador.buffVel > 0 ? 1.5 : 0);

    if (mx !== 0 || my !== 0) {
    tempoAnimacaoPersonagem += dt;

    if (tempoAnimacaoPersonagem >= 120) {
        quadroPersonagem = (quadroPersonagem + 1) % 4;
        tempoAnimacaoPersonagem = 0;
    }

    const tam = Math.hypot(mx, my);
    jogador.x += (mx / tam) * jogador.velocidade * delta;
    jogador.y += (my / tam) * jogador.velocidade * delta;
} else {
    tempoAnimacaoPersonagem = 0;
    quadroPersonagem = 0;
}

    limitarJogador();

    if (jogador.invulneravel > 0) jogador.invulneravel -= dt;
    if (jogador.cooldownTiro > 0) jogador.cooldownTiro -= dt;

    // Cooldown do golpe especial
    if (jogador.ataqueEspecialTimer > 0) {
        jogador.ataqueEspecialTimer -= dt;
    }
}

function limitarJogador() {
    jogador.x = Math.max(jogador.largura / 2, Math.min(canvas.width - jogador.largura / 2, jogador.x));
    jogador.y = Math.max(jogador.altura / 2, Math.min(canvas.height - jogador.altura / 2, jogador.y));
}

/* Retorna true se realmente causou dano */
function causarDanoJogador(dano, invulnerabilidade = 1000) {
    if (jogador.invulneravel > 0) return false;

    jogador.vida -= dano;
    jogador.invulneravel = invulnerabilidade;
    criarParticulas(jogador.x, jogador.y, 10);

    if (jogador.vida <= 0) {
        jogador.vida = 0;
        finalizarJogo();
    }
    return true;
}

/* =====================================================
   TIROS
===================================================== */

function atirar() {
    if (jogador.cooldownTiro > 0) return;

    if (modoJogo === MODO.DIFICIL && jogador.balas <= 0) return;

    const dx = mouse.x - jogador.x;
    const dy = mouse.y - jogador.y;
    const dist = Math.hypot(dx, dy);

    if (dist === 0) return;

    const anguloBase = Math.atan2(dy, dx);

    const quantidade = Math.max(1, jogador.tirosPorDisparo);

    for (let i = 0; i < quantidade; i++) {

        const offset = quantidade === 1
            ? 0
            : (i - (quantidade - 1) / 2) * jogador.espalhamento;

        const angulo = anguloBase + offset;

        tiros.push({
            x: jogador.x,
            y: jogador.y,

            vx: Math.cos(angulo) * jogador.velTiro,
            vy: Math.sin(angulo) * jogador.velTiro,

            raio: 5,
            dano: jogador.dano,

            perfurante: jogador.perfurante,
            acertados: new Set()
        });
    }

    jogador.cooldownTiro = jogador.intervaloTiro;

    if (modoJogo === MODO.DIFICIL) {
        jogador.balas--;
    }
}

function atualizarTiros(delta) {
    for (let i = tiros.length - 1; i >= 0; i--) {
        const t = tiros[i];
        t.x += t.vx * delta;
        t.y += t.vy * delta;
        if (t.x < -20 || t.x > canvas.width + 20 || t.y < -20 || t.y > canvas.height + 20) {
            tiros.splice(i, 1);
        }
    }
}

/* =====================================================
   INIMIGOS
===================================================== */

function tipoLiberado(tipo, c) {
    if (modoJogo === MODO.DIFICIL) {
        return tiposDesbloqueadosDificil.has(tipo);
    }
    return c.desbloqueiaNivel ? nivel >= c.desbloqueiaNivel : tempo >= c.desbloqueia;
}

function escolherTipo() {
    const liberados = Object.entries(TIPOS_INIMIGO).filter(([tipo, t]) => tipoLiberado(tipo, t));
    const pesos = liberados.map(([, t]) => t.peso(tempo));
    let r = Math.random() * pesos.reduce((a, b) => a + b, 0);

    for (let i = 0; i < liberados.length; i++) {
        r -= pesos[i];
        if (r <= 0) return liberados[i][0];
    }
    return "normal";
}

function novoInimigo(tipo, x, y) {
    const c = TIPOS_INIMIGO[tipo];
    const cfg = configNivel();
    const vida = (c.vida + dificuldade * c.vidaEsc) * cfg.vida;

    return {
        tipo, x, y, raio: c.raio,
        velocidade: Math.min(Math.min(c.vel + dificuldade * c.velEsc, c.vel * 2.2) * cfg.vel, 4.5),
        vida, vidaMaxima: vida,
        dano: c.dano, pontos: c.pontos,
        fase: Math.random() * Math.PI * 2,
        recarga: 1200 + Math.random() * 1000    // tempo até o próximo tiro (atirador)
    };
}

function criarInimigo() {
    const lado = Math.floor(Math.random() * 4);
    let x, y;
    if (lado === 0) { x = Math.random() * canvas.width; y = -40; }
    else if (lado === 1) { x = canvas.width + 40; y = Math.random() * canvas.height; }
    else if (lado === 2) { x = Math.random() * canvas.width; y = canvas.height + 40; }
    else { x = -40; y = Math.random() * canvas.height; }

    inimigos.push(novoInimigo(escolherTipo(), x, y));
}

function atualizarInimigos(delta) {
    for (let i = inimigos.length - 1; i >= 0; i--) {
        const e = inimigos[i];
        const dx = jogador.x - e.x;
        const dy = jogador.y - e.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 0) {
            let vx = (dx / dist) * e.velocidade;
            let vy = (dy / dist) * e.velocidade;

            if (e.tipo === "atirador") {
                /* Mantém distância: chega perto, recua se o jogador encosta */
                const f = dist > 320 ? 1 : dist < 220 ? -1 : 0;
                vx *= f; vy *= f;
            }

            /* Quem tem "tiro" (Tanque e Atirador) atira no jogador */
            const tiro = TIPOS_INIMIGO[e.tipo].tiro;
            if (tiro) {
                e.recarga -= delta * 16.67;
                const naArena = e.x > 0 && e.x < canvas.width && e.y > 0 && e.y < canvas.height;
                if (e.recarga <= 0 && naArena) {
                    dispararInimigo(e.x, e.y, Math.atan2(dy, dx), tiro.vel, tiro.raio, "#ff5555");
                    e.recarga = tiro.intervalo * configNivel().spawn;
                }
            }

            if (e.tipo === "zigzag") {
                e.fase += 0.1 * delta;
                const lateral = Math.sin(e.fase) * e.velocidade * 1.6;
                vx += (-dy / dist) * lateral;
                vy += (dx / dist) * lateral;
            }

            e.x += vx * delta;
            e.y += vy * delta;
        }

        if (dist < e.raio + jogador.largura / 2) {
            causarDanoJogador(e.dano);
            criarParticulas(e.x, e.y, 8);
            inimigos.splice(i, 1);
        }
    }
}

function dispararInimigo(x, y, angulo, vel, raio, cor) {
    tirosInimigos.push({
        x, y, raio, cor,
        vx: Math.cos(angulo) * vel, vy: Math.sin(angulo) * vel
    });
}

function atualizarTirosInimigos(delta) {
    for (let i = tirosInimigos.length - 1; i >= 0; i--) {
        const t = tirosInimigos[i];
        t.x += t.vx * delta;
        t.y += t.vy * delta;

        if (Math.hypot(jogador.x - t.x, jogador.y - t.y) < t.raio + jogador.largura / 2) {
            causarDanoJogador(1);
            tirosInimigos.splice(i, 1);
        } else if (t.x < -20 || t.x > canvas.width + 20 || t.y < -20 || t.y > canvas.height + 20) {
            tirosInimigos.splice(i, 1);
        }
    }
}

function controlarSpawn(delta) {
    spawnTimer -= delta * 16.67;
    if (spawnTimer > 0) return;

    criarInimigo();

    let intervalo = Math.max(300, 1000 - dificuldade * 30) * configNivel().spawn;
    if (boss) intervalo *= 2;   // menos inimigos durante o boss
    spawnTimer = intervalo;
}

/* Avisa quando um novo tipo de inimigo aparece pela primeira vez (modo normal) */
function verificarNovosTipos() {
    for (const [tipo, c] of Object.entries(TIPOS_INIMIGO)) {
        if (tipoLiberado(tipo, c) && !tiposAvisados.has(tipo)) {
            tiposAvisados.add(tipo);
            const eNovo = c.desbloqueiaNivel || c.desbloqueia > 0;
            if (eNovo && !boss) mostrarAviso(`NOVO INIMIGO: ${c.nome}!`, 2500, true);
        }
    }
}

/* =====================================================
   HORDAS (modo difícil)
===================================================== */

function iniciarProximaHorda() {
    horda++;
    hordaDesdeUltimoBoss++;
    dificuldade = Math.max(1, horda);

    /* A cada HORDAS_POR_NOVO_TIPO hordas, libera um novo tipo de inimigo */
    if (horda % HORDAS_POR_NOVO_TIPO === 0) {
        const proximoIndice = tiposDesbloqueadosDificil.size;
        if (proximoIndice < ORDEM_TIPOS_DIFICIL.length) {
            const novoTipo = ORDEM_TIPOS_DIFICIL[proximoIndice];
            tiposDesbloqueadosDificil.add(novoTipo);
            mostrarAviso(`NOVO INIMIGO: ${TIPOS_INIMIGO[novoTipo].nome}!`, 2500, true);
        }
    }

    /* Boss quando o número de hordas do nível atual é atingido
       (nível 1: a cada 5 hordas; nível 2: a cada 10; nível 3: a cada 15...) */
    if (hordaDesdeUltimoBoss >= hordasParaProximoBoss()) {
        hordaDesdeUltimoBoss = 0;
        hordaEmAndamento = false;
        criarBoss();
        return;
    }

    hordaEmAndamento = true;
    hordaInimigosGerados = 0;
    hordaInimigosAlvo = 10 + (horda - 1) * 10;   // 10, 20, 30, 40... (a cada horda, +10 inimigos)
    hordaSpawnTimer = 0;
    mostrarAviso(`HORDA ${horda}`, 1600, true);
}

function atualizarHordas(delta) {
    if (boss) return;   // durante o boss não inicia nova horda

    if (!hordaEmAndamento) {
        if (inimigos.length !== 0) return;

        /* Espera um pouco antes de liberar a próxima horda */
        if (!hordaAguardando) {
            hordaAguardando = true;
            hordaPausaTimer = PAUSA_ENTRE_HORDAS;
            if (horda > 0) mostrarAviso("Próxima horda chegando...", PAUSA_ENTRE_HORDAS - 200, false);
            return;
        }

        hordaPausaTimer -= delta * 16.67;
        if (hordaPausaTimer <= 0) {
            hordaAguardando = false;
            iniciarProximaHorda();
        }
        return;
    }

    if (hordaInimigosGerados >= hordaInimigosAlvo) {
        if (inimigos.length === 0) hordaEmAndamento = false;   // horda concluída
        return;
    }

    hordaSpawnTimer -= delta * 16.67;
    if (hordaSpawnTimer <= 0) {
        criarInimigo();
        hordaInimigosGerados++;
        hordaSpawnTimer = Math.max(250, 600 - horda * 15);
    }
}

/* =====================================================
   BOSS
===================================================== */

function criarBoss() {
    bossContador++;
    const n = bossContador;
    const vida = 2500 * (1 + (n - 1) * 0.8);

    boss = {
        x: canvas.width / 2, y: -100,
        raio: 55 + n * 5,
        velocidade: Math.min(0.7 + n * 0.1, 1.6),
        vida, vidaMaxima: vida,
        dano: Math.min(1 + n, 3),      // 2 corações no 1º boss, até 3
        pontos: 1000 * n,
        nivel: n,
        entrouNaArena: false,
        pausa: 0,
        recarga: 2500,      // tempo até o próximo ataque (ms)
        ataques: 0
    };
    mostrarAviso("⚠ BOSS INCOMING! ⚠", 3000, true);
}

/* Alterna: leque de 3 tiros mirados no jogador / anel de tiros */
function bossAtirar() {
    boss.ataques++;
    const mirar = Math.atan2(jogador.y - boss.y, jogador.x - boss.x);

    if (boss.ataques % 2 === 1) {
        for (const desvio of [-0.25, 0, 0.25]) {
            dispararInimigo(boss.x, boss.y, mirar + desvio, 3.5, 8, "#ff9f43");
        }
    } else {
        const qtd = Math.min(8 + boss.nivel * 2, 16);
        const giro = Math.random() * Math.PI;
        for (let i = 0; i < qtd; i++) {
            dispararInimigo(boss.x, boss.y, giro + (i / qtd) * Math.PI * 2, 3, 8, "#ff9f43");
        }
    }
}

function atualizarBoss(delta) {
    if (!boss) return;

    if (!boss.entrouNaArena) {
        boss.y += boss.velocidade * 2 * delta;
        if (boss.y >= 100) boss.entrouNaArena = true;
        return;
    }

    boss.recarga -= delta * 16.67;
    if (boss.recarga <= 0) {
        bossAtirar();
        boss.recarga = Math.max(1800, 3500 - 250 * (boss.nivel - 1));
    }

    if (boss.pausa > 0) { boss.pausa -= delta * 16.67; return; }

    const dx = jogador.x - boss.x;
    const dy = jogador.y - boss.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 0) {
        boss.x += (dx / dist) * boss.velocidade * delta;
        boss.y += (dy / dist) * boss.velocidade * delta;
    }

    if (dist < boss.raio + jogador.largura / 2) {
        /* Dá dano, empurra o jogador e o boss fica parado um instante */
        if (causarDanoJogador(boss.dano, 1500) && jogoRodando) {
            jogador.x += (dx / dist) * 140;
            jogador.y += (dy / dist) * 140;
            limitarJogador();
            boss.pausa = 700;
        }
    }
}

function verificarDesbloqueioEspecial() {
    if (especialDesbloqueado || !boss || !boss.entrouNaArena) return;

    const dist = Math.hypot(
        boss.x - jogador.x,
        boss.y - jogador.y
    );

    if (dist <= boss.raio + RAIO_ATAQUE_ESPECIAL) {
        especialDesbloqueado = true;

        mostrarAviso(
            "⚡ GOLPE ESPECIAL DESBLOQUEADO!\nBotão direito perto do Boss",
            3500,
            true
        );
    }
}

function usarAtaqueEspecial() {
    if (!jogoRodando || pausado) return;
    if (!especialDesbloqueado) return;
    if (jogador.ataqueEspecialTimer > 0) return;
    if (!boss || !boss.entrouNaArena) return;

    const dist = Math.hypot(
        boss.x - jogador.x,
        boss.y - jogador.y
    );

    if (dist > boss.raio + RAIO_ATAQUE_ESPECIAL) return;

    const dano = boss.vidaMaxima * ATAQUE_ESPECIAL_DANO_PCT;

    boss.vida -= dano;

    jogador.invulneravel = Math.max(
        jogador.invulneravel,
        ATAQUE_ESPECIAL_INVULN
    );

    jogador.ataqueEspecialTimer = ATAQUE_ESPECIAL_COOLDOWN;

    golpes.push({
        x1: jogador.x,
        y1: jogador.y,
        x2: boss.x,
        y2: boss.y,
        tempo: 300
    });

    criarParticulas(boss.x, boss.y, 30);

    mostrarAviso(
        "⚡ GOLPE DEVASTADOR! ⚡",
        1500,
        true
    );

    if (boss.vida <= 0) {
        derrotarBoss();
    }
}

/* =====================================================
   COLISÕES TIRO × ALVOS
===================================================== */

function matarInimigo(j) {
    const e = inimigos[j];
    score += e.pontos;
    criarParticulas(e.x, e.y, 15);
    if (Math.random() < (modoJogo === MODO.DIFICIL ? 0.18 : 0.1)) criarPowerUp(e.x, e.y);
    if (e.tipo === "divisor") {
        for (const lado of [-1, 1]) inimigos.push(novoInimigo("mini", e.x + lado * 15, e.y));
    }
    if (modoJogo === MODO.DIFICIL) {
        jogador.balas = Math.min(jogador.balasMax, jogador.balas + 1);   // mata e recarrega
    }
    inimigos.splice(j, 1);
}

function derrotarBoss() {
    score += boss.pontos;
    criarParticulas(boss.x, boss.y, 50);
    criarPowerUp(boss.x, boss.y, "vida");   // boss sempre solta coração
    boss = null;
    tirosInimigos = [];

    if (modoJogo === MODO.DIFICIL) jogador.balas = jogador.balasMax;   // recarrega tudo

    nivel++;
    mostrarAviso(`BOSS DERROTADO! NÍVEL ${nivel}\nDIFICULDADE AUMENTOU!`, 3000);

    abrirEscolhaDeArma();
}

function abrirEscolhaDeArma() {
    opcoesUpgrade = sortearUpgrades();
    escolhendoUpgrade = true;
    mouse.pressionado = false;
    cancelAnimationFrame(frameId);
    desenharEscolhaArma();
}

function cliqueEscolhaArma(e) {
    const rect = canvas.getBoundingClientRect();

    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);

    for (let i = 0; i < cartasUpgrade.length; i++) {
        const carta = cartasUpgrade[i];

        if (
            mouseX >= carta.x &&
            mouseX <= carta.x + carta.w &&
            mouseY >= carta.y &&
            mouseY <= carta.y + carta.h
        ) {
            equiparArma(opcoesUpgrade[i]);
            return;
        }
    }
}

// ADICIONE ESTA FUNÇÃO ABAIXO:
function escolherArmaTeclado(e) {
    if (!escolhendoUpgrade) return;

    let indice = -1;

    if (e.key === "1") indice = 0;
    if (e.key === "2") indice = 1;
    if (e.key === "3") indice = 2;

    if (indice >= 0 && opcoesUpgrade[indice]) {
        e.preventDefault();
        equiparArma(opcoesUpgrade[indice]);
    }
}

function equiparArma(arma) {
    if (!arma) return;

    // Verifica se a arma já está no inventário
    const jaPossui = armasEquipadas.some(a => a.id === arma.id);

    // Se for nova, só adiciona se houver espaço
    if (!jaPossui) {
        if (armasEquipadas.length >= MAX_ARMAS) {
        mostrarAviso("INVENTÁRIO CHEIO! Escolha uma arma para substituir.", 2000);

        // Fecha a tela de escolha e continua o jogo
        escolhendoUpgrade = false;
        mouse.pressionado = false;

        ultimoTempo = performance.now();
        frameId = requestAnimationFrame(loop);
        return;
    }

        armasEquipadas.push(arma);
    }

    // Equipa a arma selecionada
    armaAtualId = arma.id;

    jogador.dano = arma.dano;
    jogador.intervaloTiro = arma.intervaloTiro;
    jogador.tirosPorDisparo = arma.tiros;
    jogador.espalhamento = arma.espalhamento;
    jogador.velTiro = arma.velTiro;
    jogador.perfurante = arma.perfurante;

    escolhendoUpgrade = false;
    mouse.pressionado = false;

    mostrarAviso(`ARMA EQUIPADA: ${arma.nome}`, 1500);

    ultimoTempo = performance.now();
    frameId = requestAnimationFrame(loop);
}

function trocarArma(indice) {
    if (escolhendoUpgrade || pausado) return;

    const arma = armasEquipadas[indice];

    if (!arma) {
        mostrarAviso("Você ainda não possui essa arma!", 1500);
        console.log("Inventário atual:", armasEquipadas);
        console.log("Índice solicitado:", indice);
        return;
    }

    armaAtualId = arma.id;

    jogador.dano = arma.dano;
    jogador.intervaloTiro = arma.intervaloTiro;
    jogador.tirosPorDisparo = arma.tiros;
    jogador.espalhamento = arma.espalhamento;
    jogador.velTiro = arma.velTiro;
    jogador.perfurante = arma.perfurante;

    mostrarAviso(`ARMA: ${arma.nome}`, 1000);
}

function desenharEscolhaArma() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 32px Arial";
    ctx.textAlign = "center";
    ctx.fillText("ESCOLHA SUA ARMA", canvas.width / 2, 70);

    const largura = 260;
    const altura = 220;
    const espacamento = 20;

    const totalLargura = largura * 3 + espacamento * 2;
    const inicioX = (canvas.width - totalLargura) / 2;

    for (let i = 0; i < 3; i++) {
        const x = inicioX + i * (largura + espacamento);
        const y = 120;

        cartasUpgrade[i].x = x;
        cartasUpgrade[i].y = y;
        cartasUpgrade[i].w = largura;
        cartasUpgrade[i].h = altura;

        ctx.fillStyle = "#222";
        ctx.fillRect(x, y, largura, altura);

        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, largura, altura);

        const arma = opcoesUpgrade[i];

        ctx.fillStyle = "#fff";
        ctx.font = "bold 24px Arial";
        ctx.fillText(arma.nome, x + largura / 2, y + 50);

        ctx.font = "18px Arial";
        ctx.fillText(
            arma.desc,
            x + largura / 2,
            y + 100
        );

        ctx.font = "16px Arial";
        ctx.fillText(
            "Clique para escolher",
            x + largura / 2,
            y + 180
        );
    }

    ctx.textAlign = "left";
}

function verificarColisoes() {
    for (let i = tiros.length - 1; i >= 0; i--) {

        const t = tiros[i];
        let acertou = false;

        // Colisão com inimigos
        for (let j = inimigos.length - 1; j >= 0; j--) {

            const e = inimigos[j];

            // Se esse tiro já acertou esse inimigo, ignora
            if (t.acertados.has(e)) continue;

            if (
                Math.hypot(t.x - e.x, t.y - e.y)
                < t.raio + e.raio
            ) {

                e.vida -= t.dano;

                t.acertados.add(e);

                criarParticulas(t.x, t.y, 4);

                acertou = true;

                if (e.vida <= 0) {
                    matarInimigo(j);
                }

                // Tiro normal para depois do primeiro inimigo
                if (!t.perfurante) {
                    break;
                }
            }
        }

        // Colisão com o Boss
        if (
            !acertou &&
            boss &&
            !t.acertados.has(boss) &&
            Math.hypot(t.x - boss.x, t.y - boss.y)
            < t.raio + boss.raio
        ) {

            boss.vida -= t.dano;

            t.acertados.add(boss);

            criarParticulas(t.x, t.y, 5);

            acertou = true;

            if (boss.vida <= 0) {
                derrotarBoss();
            }
        }

        // Tiro normal desaparece ao acertar.
        // Tiro perfurante continua.
        if (acertou && !t.perfurante) {
            tiros.splice(i, 1);
        }
    }
}

/* =====================================================
   POWER-UPS
===================================================== */

function criarPowerUp(x, y, tipoForcado) {
    let tipo = tipoForcado;
    if (!tipo) {
        const r = Math.random();
        if (modoJogo === MODO.DIFICIL) {
            /* No modo difícil também pode sair munição */
            tipo = r < 0.3 ? "vida" : r < 0.55 ? "velocidade" : r < 0.8 ? "bomba" : "bala";
        } else {
            tipo = r < 0.4 ? "vida" : r < 0.75 ? "velocidade" : "bomba";
        }
    }
    powerUps.push({ x, y, raio: 14, tipo, tempo: 8000 });
}

function atualizarPowerUps(delta) {
    for (let i = powerUps.length - 1; i >= 0; i--) {
        const p = powerUps[i];
        p.tempo -= delta * 16.67;

        if (p.tempo <= 0) { powerUps.splice(i, 1); continue; }

        if (Math.hypot(jogador.x - p.x, jogador.y - p.y) < p.raio + jogador.largura / 2) {
            aplicarPowerUp(p.tipo);
            criarParticulas(p.x, p.y, 20);
            powerUps.splice(i, 1);
        }
    }
}

const RAIO_EXPLOSAO = 280;

/* Explosão: machuca tudo em volta do jogador e apaga os tiros inimigos */
function explosaoEspecial() {
    ondas.push({ x: jogador.x, y: jogador.y, tempo: 450 });

    for (let i = inimigos.length - 1; i >= 0; i--) {
        const e = inimigos[i];
        if (Math.hypot(e.x - jogador.x, e.y - jogador.y) < RAIO_EXPLOSAO + e.raio) {
            e.vida -= 150;
            criarParticulas(e.x, e.y, 6);
            if (e.vida <= 0) matarInimigo(i);
        }
    }

    if (boss && Math.hypot(boss.x - jogador.x, boss.y - jogador.y) < RAIO_EXPLOSAO + boss.raio) {
        boss.vida -= 300;
        criarParticulas(boss.x, boss.y, 15);
        if (boss.vida <= 0) derrotarBoss();
    }

    tirosInimigos = [];
}

function aplicarPowerUp(tipo) {
    if (tipo === "vida") jogador.vida = Math.min(VIDAS_MAX, jogador.vida + 1);
    if (tipo === "velocidade") jogador.buffVel = 6000;
    if (tipo === "bomba") explosaoEspecial();
    if (tipo === "bala") jogador.balas = jogador.balasMax;   // recarrega a munição toda
}

/* =====================================================
   PARTÍCULAS
===================================================== */

function criarParticulas(x, y, quantidade) {
    for (let i = 0; i < quantidade; i++) {
        const ang = Math.random() * Math.PI * 2;
        const vel = Math.random() * 4 + 1;
        particulas.push({
            x, y,
            vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel,
            vida: 500, tamanho: Math.random() * 4 + 2
        });
    }
}

function atualizarParticulas(delta) {
    for (let i = particulas.length - 1; i >= 0; i--) {
        const p = particulas[i];
        p.x += p.vx * delta;
        p.y += p.vy * delta;
        p.vida -= delta * 16.67;
        if (p.vida <= 0) particulas.splice(i, 1);
    }
}

/* =====================================================
   ATUALIZAÇÃO GERAL
===================================================== */

function atualizar(delta) {
    tempo += delta / 60;

    // Animação dos zumbis
    contadorFrameZombie += delta;

    if (contadorFrameZombie >= 100) {
        contadorFrameZombie = 0;
        frameZombie++;

        if (frameZombie >= 8) {
            frameZombie = 0;
        }
    }

    if (modoJogo === MODO.DIFICIL) {
        atualizarHordas(delta);

        /* Garante que munição apareça no mapa de tempos em tempos, já que acaba rápido */
        municaoTimer -= delta * 16.67;
        if (municaoTimer <= 0) {
            criarPowerUp(
                30 + Math.random() * (canvas.width - 60),
                30 + Math.random() * (canvas.height - 60),
                "bala"
            );
            municaoTimer = INTERVALO_MUNICAO;
        }
    } else {
        dificuldade = 1 + Math.floor(tempo / 40);
        verificarNovosTipos();

        /* Boss a cada 5 minutos (espera o boss atual morrer, se ainda vivo) */
        if (tempo >= proximoBoss && !boss) {
            criarBoss();
            proximoBoss += INTERVALO_BOSS;
        }

        controlarSpawn(delta);
    }

    if (aviso.tempo > 0) aviso.tempo -= delta * 16.67;

    atualizarPowerUps(delta);
    atualizarJogador(delta);
    if (mouse.pressionado) atirar();
    atualizarTiros(delta);
    atualizarInimigos(delta);
    atualizarTirosInimigos(delta);
    atualizarBoss(delta);
    verificarDesbloqueioEspecial();
    verificarColisoes();
    atualizarParticulas(delta);
    for (let i = ondas.length - 1; i >= 0; i--) {
        ondas[i].tempo -= delta * 16.67;
        if (ondas[i].tempo <= 0) ondas.splice(i, 1);
    }
    
    for (let i = golpes.length - 1; i >= 0; i--) {
    golpes[i].tempo -= delta * 16.67;

    if (golpes[i].tempo <= 0) {
        golpes.splice(i, 1);
    }
}
}

/* =====================================================
   DESENHO
===================================================== */

function circulo(x, y, r, cor) {
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
}

function barraVida(x, y, largura, altura, pct, cor) {
    ctx.fillStyle = "#333";
    ctx.fillRect(x, y, largura, altura);
    ctx.fillStyle = cor;
    ctx.fillRect(x, y, largura * Math.max(0, pct), altura);
}

function desenharFundo() {
    ctx.fillStyle = "#101010";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += 50) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += 50) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
}

function desenharJogador() {
    ctx.save();

    if (
        jogador.invulneravel > 0 &&
        Math.floor(jogador.invulneravel / 100) % 2 === 0
    ) {
        ctx.globalAlpha = 0.4;
    }

    // Desenha o personagem
    if (personagemImg.complete && personagemImg.naturalWidth > 0) {
    const dx = mouse.x - jogador.x;
    const dy = mouse.y - jogador.y;

    let linhaPersonagem;

    if (Math.abs(dx) > Math.abs(dy)) {
        linhaPersonagem = 1; // De lado
    } else if (dy < 0) {
        linhaPersonagem = 3; // De costas
    } else {
        linhaPersonagem = 0; // De frente
    }

    ctx.save();
    ctx.translate(jogador.x, jogador.y);

    // Espelha o personagem para olhar para a direita
    if (linhaPersonagem === 1 && dx > 0) {
        ctx.scale(-1, 1);
    }

    ctx.drawImage(
        personagemImg,
        quadroPersonagem * 96,
        linhaPersonagem * 96,
        96, 96,
        -20, -28,
        40, 56
    );

    ctx.restore();
}

    // Anel do poder de velocidade
    ctx.lineWidth = 2;

    if (jogador.buffVel > 0) {
        ctx.strokeStyle = "#3498db";
        ctx.beginPath();
        ctx.arc(jogador.x, jogador.y, 22, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Direção da arma: acompanha o mouse
    const dx = mouse.x - jogador.x;
    const dy = mouse.y - jogador.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 0) {
        const angulo = Math.atan2(dy, dx);

        ctx.save();
        ctx.translate(jogador.x, jogador.y);
        ctx.rotate(angulo + Math.PI / 2);

        if (
            imagemArmas.complete &&
            imagemArmas.naturalWidth > 0
        ) {
            // Mantém o tamanho e a posição que você ajustou.
            // Os recortes abaixo são provisórios até conferirmos
            // a posição real de cada arma na sprite sheet.
            const armasSprites = {
            pistola: {
                x: 105, y: 240, largura: 90, altura: 220
            },
            escopeta: {
            x: 110, y: 140, largura: 65, altura: 375
            },
            rifle: {
                x: 320, y: 65, largura: 100, altura: 445
            },
            canhao: {
                x: 535, y: 65, largura: 120, altura: 445
            },
            metralhadora: {
                x: 780, y: 100, largura: 140, altura: 410
            },
            fuzil: {
                x: 1030, y: 100, largura: 120, altura: 410
            },
            canhaoduplo: {
                x: 1280, y: 150, largura: 170, altura: 365
            }
        };

        const sprite = armasSprites[armaAtualId];

console.log("Arma atual:", armaAtualId);
console.log("Sprite encontrado:", sprite);

if (sprite) {
    // Desenha as armas da sprite sheet
    ctx.drawImage(
        imagemArmas,
        sprite.x,
        sprite.y,
        sprite.largura,
        sprite.altura,
        -7, -30, 12, 30
    );
} else if (armaAtualId === "pistola") {
    // Desenho provisório da pistola
    ctx.strokeStyle = "#d6d6d6";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -25);
    ctx.stroke();

    ctx.fillStyle = "#555";
    ctx.fillRect(-4, -15, 8, 12);
}
    }
        ctx.restore();
    }

    ctx.restore();
}

function desenharInimigos() {
    for (const e of inimigos) {

       
        let imagem;
        let filtro = "none";

switch (e.tipo) {
    case "normal":
        imagem = zombie2Img;
        filtro = "none";
        break;

    case "rapido":
        imagem = zombie1Img;
        filtro = "hue-rotate(60deg)";
        break;

    case "tanque":
        imagem = zombie1Img;
        filtro = "hue-rotate(120deg)";
        break;

    case "zigzag":
        imagem = zombie2Img;
        filtro = "hue-rotate(180deg)";
        break;

    case "divisor":
        imagem = zombie1Img;
        filtro = "hue-rotate(240deg)";
        break;

    case "atirador":
        imagem = zombie2Img;
        filtro = "hue-rotate(300deg)";
        break;

    case "mini":
        imagem = zombie1Img;
        filtro = "hue-rotate(30deg)";
        break;

    default:
        imagem = zombie1Img;
        filtro = "none";
}

        
        const tamanhoFrame = 32;

        ctx.filter = filtro;

        ctx.drawImage(
            imagem,

            frameZombie * tamanhoFrame, 
            0,                           
            tamanhoFrame,                
            tamanhoFrame,               

            e.x - e.raio,                
            e.y - e.raio,
            e.raio * 2,
            e.raio * 2
        );

        ctx.filter = "none";
        
        barraVida(
            e.x - e.raio,
            e.y - e.raio - 10,
            e.raio * 2,
            5,
            e.vida / e.vidaMaxima,
            "#2ecc71"
        );
    }
}

function desenharPowerUps() {
    const cores = { vida: "#2ecc71", velocidade: "#3498db", bomba: "#e67e22", bala: "#f39c12" };
    const simbolos = { vida: "❤", velocidade: "⚡", bomba: "💥", bala: "🔫" };

    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const p of powerUps) {
        /* Pisca nos últimos 2 segundos */
        if (p.tempo < 2000 && Math.floor(p.tempo / 150) % 2 === 0) continue;
        circulo(p.x, p.y, p.raio, cores[p.tipo]);
        ctx.fillStyle = "white";
        ctx.fillText(simbolos[p.tipo], p.x, p.y);
    }
}

function desenharBoss() {
    if (!boss) return;

    circulo(boss.x, boss.y, boss.raio, "#d35400");
    ctx.strokeStyle = "#f1c40f";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, boss.raio, 0, Math.PI * 2);
    ctx.stroke();

    const largura = 300, x = canvas.width / 2 - largura / 2, y = 30;
    barraVida(x, y, largura, 20, boss.vida / boss.vidaMaxima, "#e74c3c");
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, largura, 20);

    ctx.fillStyle = "white";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`👑 BOSS ${boss.nivel}`, canvas.width / 2, y - 6);
}

function desenharOndas() {
    ctx.lineWidth = 6;
    for (const o of ondas) {
        const p = 1 - o.tempo / 450;
        ctx.strokeStyle = `rgba(230, 126, 34, ${1 - p})`;
        ctx.beginPath();
        ctx.arc(o.x, o.y, RAIO_EXPLOSAO * p, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function desenharTiros() {
    for (const t of tiros) circulo(t.x, t.y, t.raio, "#ffff00");
    for (const t of tirosInimigos) circulo(t.x, t.y, t.raio, t.cor);
}

function desenharParticulas() {
    for (const p of particulas) {
        circulo(p.x, p.y, p.tamanho, `rgba(255, 200, 50, ${p.vida / 500})`);
    }
}

function desenharGolpes() {
    for (const golpe of golpes) {
        ctx.save();

        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 8;
        ctx.globalAlpha = golpe.tempo / 300;

        ctx.beginPath();
        ctx.moveTo(golpe.x1, golpe.y1);
        ctx.lineTo(golpe.x2, golpe.y2);
        ctx.stroke();

        ctx.restore();
    }
}

function desenharAviso() {
    if (aviso.tempo <= 0) return;

    ctx.save();
    ctx.globalAlpha = Math.min(1, aviso.tempo / 500);
    ctx.fillStyle = "#ffd700";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 5;
    ctx.font = "bold 40px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    aviso.texto.split("\n").forEach((linha, i) => {
        const y = canvas.height / 2 - 120 + i * 50;
        ctx.strokeText(linha, canvas.width / 2, y);
        ctx.fillText(linha, canvas.width / 2, y);
    });
    ctx.restore();
}

function desenharNivel() {
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`NÍVEL ${nivel}`, 15, 12);
}

function desenharPausa() {
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 60px Arial";
    ctx.fillText("PAUSADO", canvas.width / 2, canvas.height / 2 - 30);
    ctx.font = "20px Arial";
    ctx.fillText("P ou ESC: continuar", canvas.width / 2, canvas.height / 2 + 30);
    ctx.fillText("M: voltar ao menu", canvas.width / 2, canvas.height / 2 + 60);
}

function desenhar() {
    desenharFundo();
    desenharPowerUps();
    desenharTiros();
    desenharInimigos();
    desenharBoss();
    desenharParticulas();
    desenharGolpes();
    desenharOndas();
    desenharJogador();
    desenharNivel();
    desenharAviso();
}

/* =====================================================
   HUD
===================================================== */

function atualizarHUD() {
    const cheios = Math.max(0, jogador.vida);
    healthText.textContent = "❤️".repeat(cheios) + "🖤".repeat(VIDAS_MAX - cheios);
    scoreText.textContent = score;
    timeText.textContent = Math.floor(tempo);
    enemyText.textContent = inimigos.length;

    if (modoJogo === MODO.DIFICIL) {
        ammoHud.style.display = "block";
        hordaHud.style.display = "block";
        ammoText.textContent = `${jogador.balas}/${jogador.balasMax}`;
        hordaText.textContent = horda;
    } else {
        ammoHud.style.display = "none";
        hordaHud.style.display = "none";
    }
}

/* =====================================================
   LOOP
===================================================== */

function loop(agora) {
    if (!jogoRodando || pausado) return;

    const delta = Math.min((agora - ultimoTempo) / 16.67, 3);
    ultimoTempo = agora;

    atualizar(delta);
    desenhar();
    atualizarHUD();

    if (jogoRodando && !pausado) frameId = requestAnimationFrame(loop);
}

/* =====================================================
   PAUSA
===================================================== */

function alternarPausa() {
    if (!jogoRodando) return;

    pausado = !pausado;

    if (pausado) {
        cancelAnimationFrame(frameId);
        mouse.pressionado = false;
        for (const k in teclas) teclas[k] = false;   // evita tecla "presa"
        desenharPausa();
    } else {
        ultimoTempo = performance.now();             // sem salto de tempo
        frameId = requestAnimationFrame(loop);
    }
}

function sairParaMenu() {
    cancelAnimationFrame(frameId);
    jogoRodando = false;
    pausado = false;

    if (score > highScore) {
        highScore = score;
        localStorage.setItem("sobrevivaHighScore", highScore);
    }
    menuHighScore.textContent = highScore;
    mostrarTela(menu);
}

/* Pausa sozinho se a aba/janela perder o foco */
window.addEventListener("blur", () => { if (jogoRodando && !pausado) alternarPausa(); });
document.addEventListener("visibilitychange", () => {
    if (document.hidden && jogoRodando && !pausado) alternarPausa();
});

/* =====================================================
   BOTÕES
===================================================== */

startButton.addEventListener("click", iniciarJogo);
instructionsButton.addEventListener("click", () => mostrarTela(instructions));
backButton.addEventListener("click", () => mostrarTela(menu));
restartButton.addEventListener("click", iniciarJogo);
menuButton.addEventListener("click", () => {
    menuHighScore.textContent = highScore;
    mostrarTela(menu);
});
