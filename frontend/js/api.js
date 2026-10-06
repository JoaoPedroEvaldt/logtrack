// Em produção (servido pelo próprio FastAPI), API e frontend têm a mesma origem.
// Em desenvolvimento local (arquivo aberto direto, ou Live Server numa porta
// qualquer tipo 5500), o backend sempre roda separado na 8000.
const _ehLocal = location.hostname === '' || location.hostname === '127.0.0.1' || location.hostname === 'localhost';
const API = (_ehLocal && location.port !== '8000') ? 'http://127.0.0.1:8000' : location.origin;

function getToken() {
  return localStorage.getItem('token');
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('perfil');
  window.location.href = '../index.html';
}

function checarAuth() {
  if (!getToken()) {
    window.location.href = '../index.html';
  }
}

function checarAdmin() {
  if (localStorage.getItem('perfil') !== 'administrador') {
    window.location.href = 'dashboard.html';
  }
}

function checarStaff() {
  if (localStorage.getItem('perfil') === 'motorista') {
    window.location.href = 'dashboard.html';
  }
}

function obterIdUsuarioLogado() {
  const token = getToken();
  if (!token) return null;
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(atob(base64).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    return parseInt(JSON.parse(json).sub, 10);
  } catch (e) {
    return null;
  }
}

function aplicarVisibilidadePorPerfil() {
  const perfil = localStorage.getItem('perfil');
  document.querySelectorAll('[data-admin-only]').forEach(el => {
    if (perfil !== 'administrador') el.style.display = 'none';
  });
  document.querySelectorAll('[data-staff-only]').forEach(el => {
    if (perfil === 'motorista') el.style.display = 'none';
  });
}

async function get(endpoint) {
  const res = await fetch(`${API}${endpoint}`, {
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
  // return (undefined), não {}: quem chama faz `await get(...) || []` — {} é
  // truthy em JS e passaria batido no ||, quebrando o .filter()/.map() de quem
  // esperava um array. undefined cai certinho no fallback.
  if (res.status === 401) { logout(); return; }
  // Sem isso, o corpo de erro ({detail: "Acesso negado"}) volta como se fosse
  // dado de verdade — quem chamou faz .filter()/.map() nele e quebra a página
  // em vez de simplesmente ser redirecionado (checarStaff() já deveria ter
  // pego isso antes, mas essa é a segunda linha de defesa).
  if (res.status === 403) { window.location.href = 'dashboard.html'; return; }
  return res.json();
}

async function post(endpoint, dados) {
  const res = await fetch(`${API}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(dados)
  });
  // Mesmo tratamento de token expirado/inválido que get() já faz — sem isso,
  // salvar um formulário com o token vencido só mostrava um toast genérico
  // ("Token inválido ou expirado") em vez de mandar a pessoa logar de novo.
  // Retorna {} (não undefined, como em get()): quem chama post/put/del faz
  // `if (res.detail)` sem checar `res &&` antes — undefined quebraria com
  // TypeError bem na hora do redirect, {} só deixa o "if" cair em falso.
  if (res.status === 401) { logout(); return {}; }
  return res.json();
}

async function put(endpoint, dados) {
  const res = await fetch(`${API}${endpoint}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(dados)
  });
  if (res.status === 401) { logout(); return {}; }
  return res.json();
}

async function enviarArquivo(endpoint, formData, metodo = 'POST') {
  const res = await fetch(`${API}${endpoint}`, {
    method: metodo,
    headers: { 'Authorization': `Bearer ${getToken()}` },
    body: formData
  });
  if (res.status === 401) { logout(); return {}; }
  return res.json();
}

async function del(endpoint) {
  const res = await fetch(`${API}${endpoint}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
  if (res.status === 401) { logout(); return {}; }
  return res.json();
}

function escapeHtml(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* ===================== ESTADOS VAZIO / CARREGANDO ===================== */
function estadoVazio(colspan, titulo, subtitulo, icone) {
  const conteudo = `
    <div class="empty-state">
      ${svgIcone(icone || 'vazio', 38)}
      <div class="empty-titulo">${titulo}</div>
      ${subtitulo ? `<div class="empty-sub">${subtitulo}</div>` : ''}
    </div>`;
  return colspan ? `<tr><td colspan="${colspan}" style="padding:0;">${conteudo}</td></tr>` : conteudo;
}

function estadoCarregando(colspan) {
  const conteudo = `<div class="loading-state"><span class="spinner"></span> Carregando...</div>`;
  return colspan ? `<tr><td colspan="${colspan}" style="padding:0;">${conteudo}</td></tr>` : conteudo;
}

// "2026-10-01" sozinho o JS lê como meia-noite UTC, que no Brasil ainda é o
// dia 30/09 -- por isso data pura vira meia-noite local antes de formatar.
function formatarData(data) {
  if (!data) return '—';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(data) ? new Date(data + 'T00:00:00') : new Date(data);
  return d.toLocaleDateString('pt-BR');
}

// Para campos em hora local (previsao, saida_prevista -- vêm do formulário).
function formatarDataHora(data) {
  if (!data) return '—';
  return new Date(data).toLocaleString('pt-BR');
}

// O backend grava criado_em, iniciado_em, concluido_em, finalizado_em em UTC
// sem o "Z" no fim; sem ele o JS leria como hora local (3h adiantado).
function dataUtc(iso) {
  if (!iso) return null;
  return new Date(/Z$|[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + 'Z');
}

// "AAAA-MM-DD" do dia local (toISOString() daria o dia seguinte depois das 21h).
function dataLocalISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatarDataHoraUtc(iso) {
  if (!iso) return '—';
  return dataUtc(iso).toLocaleString('pt-BR');
}

/* ===================== MOEDA (R$) ===================== */
function aplicarMascaraMoeda(input) {
  input.addEventListener('input', () => {
    const digitos = input.value.replace(/\D/g, '');
    if (!digitos) { input.value = ''; return; }
    const numero = parseInt(digitos, 10) / 100;
    input.value = numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });
}

function moedaParaNumero(valor) {
  if (!valor) return null;
  const numero = parseFloat(valor.replace(/\./g, '').replace(',', '.'));
  return isNaN(numero) ? null : numero;
}

/* ===================== MÁSCARAS SOMENTE NÚMEROS ===================== */
function aplicarMascaraSomenteDigitos(input, maxLength) {
  input.addEventListener('input', () => {
    const digitosAntesDoCursor = input.value.slice(0, input.selectionStart).replace(/\D/g, '').length;
    input.value = input.value.replace(/\D/g, '').slice(0, maxLength);
    const novaPos = Math.min(digitosAntesDoCursor, input.value.length);
    input.setSelectionRange(novaPos, novaPos);
  });
}

function aplicarMascaraCPF(input) {
  input.addEventListener('input', () => {
    let digitos = input.value.replace(/\D/g, '').slice(0, 11);
    digitos = digitos.replace(/(\d{3})(\d)/, '$1.$2');
    digitos = digitos.replace(/(\d{3})(\d)/, '$1.$2');
    digitos = digitos.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    input.value = digitos;
  });
}

/* Extrai uma mensagem legível de um erro da API, seja ele
   {detail: "texto"} (HTTPException) ou {detail: [{msg: "..."}]} (validação do Pydantic). */
function extrairErro(res) {
  if (!res || !res.detail) return 'Erro desconhecido';
  if (typeof res.detail === 'string') return res.detail;
  if (Array.isArray(res.detail)) {
    // O Pydantic prefixa os erros dos validadores com "Value error, " (em inglês).
    return res.detail.map(e => (e.msg || JSON.stringify(e)).replace(/^Value error, /, '')).join('; ');
  }
  return 'Erro desconhecido';
}

function numeroParaMoeda(numero) {
  if (numero === null || numero === undefined || numero === '') return '';
  return parseFloat(numero).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function badgeStatus(status) {
  const labels = {
    aguardando: 'Aguardando',
    em_rota: 'Em Rota',
    entregue: 'Entregue',
    atrasado: 'Atrasado',
    ocorrencia: 'Ocorrência',
    cancelado: 'Cancelado'
  };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

/* Mesmas cores usadas nos badges de status (.badge-*) em style.css,
   para que os gráficos (Chart.js) fiquem sempre consistentes com o resto da interface. */
const CORES_STATUS = {
  aguardando: '#5B6478',
  em_rota: '#2E4F8F',
  entregue: '#1D8348',
  atrasado: '#B36A17',
  ocorrencia: '#A13E1F',
  cancelado: '#888888',
  // status de manutenção — mesmas cores dos badges equivalentes (badge-aguardando/em_rota/entregue)
  agendada: '#5B6478',
  em_andamento: '#2E4F8F',
  concluida: '#1D8348'
};

function corPorStatus(status) {
  return CORES_STATUS[status] || '#95A5A6';
}

/* ===================== TEMA ===================== */
function alternarTema() {
  const dark = document.body.classList.toggle('dark');
  localStorage.setItem('tema', dark ? 'dark' : 'light');
  atualizarBtnTema(dark);
}

const ICONE_LUA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const ICONE_SOL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

function atualizarBtnTema(dark) {
  const btn = document.getElementById('btn-tema');
  if (btn) btn.innerHTML = `${dark ? ICONE_SOL : ICONE_LUA} <span>${dark ? 'Tema Claro' : 'Tema Escuro'}</span>`;
}

function aplicarTema() {
  const dark = localStorage.getItem('tema') === 'dark';
  if (dark) document.body.classList.add('dark');
  atualizarBtnTema(dark);
}

/* ===================== TOPBAR ===================== */
function iniciais(nome) {
  if (!nome) return '?';
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0][0] || '';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}

function renderizarTopbar() {
  const nome = localStorage.getItem('nome');
  const perfil = localStorage.getItem('perfil') || '';
  const perfilLabel = perfil ? perfil.charAt(0).toUpperCase() + perfil.slice(1) : '';
  const nomeExibido = nome || perfilLabel || 'Usuário';

  const avatar = document.getElementById('topbar-avatar');
  const nomeEl = document.getElementById('topbar-nome');
  const perfilEl = document.getElementById('topbar-perfil');
  if (avatar) avatar.textContent = iniciais(nomeExibido);
  if (nomeEl) nomeEl.textContent = nomeExibido;
  if (perfilEl) perfilEl.textContent = perfilLabel;
}

/* ===================== SINO DE NOTIFICAÇÕES =====================
   O sino existe em todas as páginas mas era só decoração (nem tinha onclick,
   e o pontinho dourado ficava sempre aceso, tivesse alerta ou não). Aqui ele
   ganha um contador real — vencimentos de CNH/CRLV/seguro + ocorrências dos
   últimos 7 dias — sem precisar editar o HTML de cada página uma por uma:
   o badge e o dropdown são injetados por JS em cima do <div class="topbar-sino">
   que já existe. Motorista não vê nada aqui: os endpoints usados (vencimentos,
   ocorrências) são staff-only, e chamar get() sem essa checagem faria a página
   redirecionar sozinha pro dashboard por causa do tratamento de 403 em get(). */
const TIPO_LABEL_NOTIFICACAO = { cnh: 'CNH', crlv: 'CRLV', seguro: 'Seguro' };

function fecharNotificacoes(e) {
  const dropdown = document.getElementById('notificacoes-dropdown');
  const sino = document.querySelector('.topbar-sino');
  if (!dropdown || dropdown.hidden) return;
  if (sino && sino.contains(e.target)) return;
  dropdown.hidden = true;
}

function toggleNotificacoes(e) {
  e.stopPropagation();
  const dropdown = document.getElementById('notificacoes-dropdown');
  if (dropdown) dropdown.hidden = !dropdown.hidden;
}

async function carregarNotificacoes() {
  const sino = document.querySelector('.topbar-sino');
  if (!sino || localStorage.getItem('perfil') === 'motorista') return;

  const [vencimentos, ocorrencias] = await Promise.all([get('/dashboard/vencimentos'), get('/ocorrencias')]);
  const listaVencimentos = (vencimentos && !vencimentos.detail) ? vencimentos : [];
  const seteDiasAtras = Date.now() - 7 * 86400000;
  const ocorrenciasRecentes = (ocorrencias && !ocorrencias.detail ? ocorrencias : [])
    .filter(o => dataUtc(o.criado_em).getTime() >= seteDiasAtras)
    .sort((a, b) => dataUtc(b.criado_em) - dataUtc(a.criado_em));

  const itens = [
    ...listaVencimentos.map(v => ({
      titulo: `${TIPO_LABEL_NOTIFICACAO[v.tipo] || v.tipo} — ${v.referencia}`,
      sub: v.vencido ? `Vencido em ${formatarData(v.validade)}` : `Vence em ${formatarData(v.validade)}`,
      classe: v.vencido ? 'badge-ocorrencia' : 'badge-atrasado',
    })),
    ...ocorrenciasRecentes.map(o => ({
      titulo: 'Nova ocorrência registrada',
      sub: formatarDataHoraUtc(o.criado_em),
      classe: 'badge-em_rota',
    })),
  ];

  let contador = sino.querySelector('.sino-contador');
  if (!contador) {
    contador = document.createElement('span');
    contador.className = 'sino-contador';
    sino.appendChild(contador);
  }
  contador.textContent = itens.length > 9 ? '9+' : String(itens.length);
  contador.hidden = itens.length === 0;

  let dropdown = document.getElementById('notificacoes-dropdown');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.id = 'notificacoes-dropdown';
    dropdown.className = 'notificacoes-dropdown';
    dropdown.hidden = true;
    sino.appendChild(dropdown);
    sino.onclick = toggleNotificacoes;
    document.addEventListener('click', fecharNotificacoes);
  }

  dropdown.innerHTML = itens.length === 0
    ? '<div class="notificacoes-vazio">Nenhum alerta no momento</div>'
    : '<div class="notificacoes-cabecalho">Alertas</div>' +
      itens.slice(0, 8).map(i => `
        <div class="notificacao-item">
          <span class="badge ${i.classe}">!</span>
          <div>
            <div class="notificacao-titulo">${escapeHtml(i.titulo)}</div>
            <div class="notificacao-sub">${escapeHtml(i.sub)}</div>
          </div>
        </div>
      `).join('') +
      '<a href="dashboard.html" class="notificacoes-ver-tudo">Ver central de alertas</a>';
}

/* ===================== BUSCA GLOBAL DO TOPO =====================
   O campo de busca do topo vinha com disabled fixo no HTML em toda página.
   Ativa aqui e busca em entregas/motoristas/veículos já carregados (uma vez,
   sob demanda no primeiro uso — não a cada tecla), com resultados agrupados
   num dropdown que leva pra página de cadastro correspondente. Motorista só
   busca nas próprias entregas (motoristas/veículos são staff-only). */
let _buscaCache = null;
let _buscaPromise = null;

function normalizarBusca(s) {
  const semAcento = (s || '').toString().toLowerCase().normalize('NFD');
  let limpo = '';
  for (const ch of semAcento) {
    if (ch.codePointAt(0) < 0x0300 || ch.codePointAt(0) > 0x036f) limpo += ch;
  }
  return limpo;
}

async function carregarDadosBusca() {
  if (_buscaCache) return _buscaCache;
  if (_buscaPromise) return _buscaPromise;

  const ehMotorista = localStorage.getItem('perfil') === 'motorista';
  _buscaPromise = Promise.all([
    get('/entregas'),
    ehMotorista ? Promise.resolve([]) : get('/motoristas'),
    ehMotorista ? Promise.resolve([]) : get('/veiculos'),
  ]).then(([entregas, motoristas, veiculos]) => {
    _buscaCache = {
      entregas: (entregas && !entregas.detail) ? entregas : [],
      motoristas: (motoristas && !motoristas.detail) ? motoristas : [],
      veiculos: (veiculos && !veiculos.detail) ? veiculos : [],
    };
    return _buscaCache;
  });
  return _buscaPromise;
}

async function executarBuscaGlobal(termo) {
  const dropdown = document.getElementById('busca-dropdown');
  if (!dropdown) return;
  const q = normalizarBusca(termo.trim());
  if (q.length < 2) { dropdown.hidden = true; return; }

  const dados = await carregarDadosBusca();
  const entregas = dados.entregas.filter(e =>
    normalizarBusca(e.cliente).includes(q) || normalizarBusca(e.origem).includes(q) || normalizarBusca(e.destino).includes(q)
  ).slice(0, 5);
  const motoristas = dados.motoristas.filter(m => normalizarBusca(m.nome).includes(q)).slice(0, 5);
  const veiculos = dados.veiculos.filter(v => normalizarBusca(v.placa).includes(q) || normalizarBusca(v.modelo).includes(q)).slice(0, 5);

  if (entregas.length + motoristas.length + veiculos.length === 0) {
    dropdown.innerHTML = '<div class="busca-vazio">Nada encontrado</div>';
    dropdown.hidden = false;
    return;
  }

  const grupo = (titulo, lista, render) => lista.length
    ? `<div class="busca-grupo-titulo">${titulo}</div>` + lista.map(render).join('')
    : '';

  dropdown.innerHTML =
    grupo('Entregas', entregas, e => `<a class="busca-item" href="entregas.html"><strong>${escapeHtml(e.cliente)}</strong><span>${escapeHtml(e.origem)} → ${escapeHtml(e.destino)}</span></a>`) +
    grupo('Motoristas', motoristas, m => `<a class="busca-item" href="motoristas.html"><strong>${escapeHtml(m.nome || 'Sem nome')}</strong><span>CPF ${escapeHtml(m.cpf)}</span></a>`) +
    grupo('Veículos', veiculos, v => `<a class="busca-item" href="veiculos.html"><strong>${escapeHtml(v.placa)}</strong><span>${escapeHtml(v.modelo)}</span></a>`);
  dropdown.hidden = false;
}

function ativarBuscaGlobal() {
  const container = document.querySelector('.topbar-busca');
  const input = container && container.querySelector('input');
  if (!container || !input) return;

  input.disabled = false;
  input.placeholder = 'Buscar entregas, motoristas, veículos...';
  /* type="search" (em vez de "text") faz o Chrome/Edge nunca oferecer o
     autofill de login salvo nesse campo — em paginas com um formulario de
     criar acesso (motoristas/usuarios, que tem email+senha escondidos no
     modal), o navegador pode "vazar" o e-mail logado pra qualquer input de
     texto solto na pagina, mesmo com autocomplete="off". */
  input.type = 'search';
  input.autocomplete = 'off';

  let dropdown = document.getElementById('busca-dropdown');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.id = 'busca-dropdown';
    dropdown.className = 'busca-dropdown';
    dropdown.hidden = true;
    container.appendChild(dropdown);
  }

  let debounce = null;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => executarBuscaGlobal(input.value), 200);
  });
  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2) executarBuscaGlobal(input.value);
  });
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) dropdown.hidden = true;
  });
}

/* Grava no localStorage sem deixar uma falha (quota estourada, modo privado
   bloqueando storage, etc.) virar exceção não tratada — usado por todo cache
   client-side (IBGE, geocodificação, rotas do OSRM). */
function salvarCacheJSON(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* localStorage cheio/bloqueado — segue sem cache */ }
}

/* ===================== AUTOCOMPLETE DE CIDADE (IBGE) =====================
   Usado nos campos de Origem/Destino de Entregas. A lista de municípios do
   IBGE (~5.570 cidades, ~2,4MB) é pesada pra baixar toda vez — fica em cache
   no localStorage sem expiração, já que a lista de municípios do Brasil não
   muda (novos municípios são raríssimos, então não vale reforçar isso a
   cada visita). */
const IBGE_CACHE_CHAVE = 'ibge_cidades_v1';
let _cidadesIbgePromise = null;

async function carregarCidadesIBGE() {
  if (_cidadesIbgePromise) return _cidadesIbgePromise;

  const cacheado = localStorage.getItem(IBGE_CACHE_CHAVE);
  if (cacheado) {
    try {
      _cidadesIbgePromise = Promise.resolve(JSON.parse(cacheado));
      return _cidadesIbgePromise;
    } catch (e) { /* cache corrompido — ignora e busca de novo */ }
  }

  // Primeiro a base local (mesmos nomes oficiais do IBGE, ver
  // carregarMunicipios) — sem download externo de ~2,4MB e garantindo que
  // toda cidade escolhida no autocomplete seja localizável no mapa.
  const local = await carregarMunicipios();
  if (local) {
    _cidadesIbgePromise = Promise.resolve(local.lista.map(([nome, uf]) => `${nome} - ${uf}`).sort((a, b) => a.localeCompare(b, 'pt-BR')));
    return _cidadesIbgePromise;
  }

  _cidadesIbgePromise = fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios')
    .then(res => res.json())
    .then(dados => {
      const cidades = dados
        // `microrregiao` falta em pelo menos 1 dos 5571 municípios (ex.: Boa
        // Esperança do Norte/MT) — `regiao-imediata` vem preenchido em 100%.
        .map(m => `${m.nome} - ${m['regiao-imediata']['regiao-intermediaria'].UF.sigla}`)
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
      salvarCacheJSON(IBGE_CACHE_CHAVE, cidades);
      return cidades;
    })
    .catch(() => []);

  return _cidadesIbgePromise;
}

/* Coordenadas de cidade nunca mudam, então o cache de geocodificação (Nominatim/
   OpenStreetMap) fica no localStorage sem expiração — igual ao cache do IBGE. */
const GEOCODE_CACHE_CHAVE = 'geocode_cidades_v1';

/* Mantida em memória (não relida do localStorage a cada chamada) porque
   abrirModalRota() geocodifica origem e destino em paralelo (Promise.all) —
   se cada chamada lesse e regravasse sua própria cópia do objeto, a que
   terminasse primeiro seria sobrescrita pela outra ao salvar por último. */
let _geocodeCache = null;

function lerCacheGeocode() {
  if (_geocodeCache) return _geocodeCache;
  try { _geocodeCache = JSON.parse(localStorage.getItem(GEOCODE_CACHE_CHAVE)) || {}; }
  catch (e) { _geocodeCache = {}; }
  return _geocodeCache;
}

/* Coordenadas oficiais das sedes dos 5.570 municípios (base pública
   kelvins/municipios-brasileiros, licença MIT, compactada em
   frontend/data/municipios.json como [nome, UF, lat, lon]). Servida pelo
   próprio sistema: localizar "Cidade - UF" no mapa não depende de nenhum
   serviço externo nem de limite de requisições. */
const _URL_MUNICIPIOS = new URL('../data/municipios.json', (document.currentScript && document.currentScript.src) || location.href).href;
let _municipiosPromise = null;

function carregarMunicipios() {
  if (_municipiosPromise) return _municipiosPromise;
  _municipiosPromise = fetch(_URL_MUNICIPIOS)
    .then(res => res.json())
    .then(lista => {
      const porNome = new Map();
      const semUf = new Map(); // "viamao" -> ponto, só quando o nome existe em uma única UF
      lista.forEach(([nome, uf, lat, lon]) => {
        const ponto = { nome: `${nome} - ${uf}`, lat, lon };
        porNome.set(normalizarBusca(ponto.nome), ponto);
        const chave = normalizarBusca(nome);
        semUf.set(chave, semUf.has(chave) ? null : ponto);
      });
      // Entregas antigas foram digitadas só com o nome ("Viamão"): vale a
      // busca sem UF quando não há ambiguidade (não vale pra "Santa Luzia").
      semUf.forEach((ponto, chave) => { if (ponto && !porNome.has(chave)) porNome.set(chave, ponto); });
      return { lista, porNome };
    })
    .catch(() => { _municipiosPromise = null; return null; });
  return _municipiosPromise;
}

/* O Nominatim (OpenStreetMap) só entra como plano B, pra texto que não é um
   "Cidade - UF" da lista oficial. A política de uso dele é no máximo 1
   requisição por segundo — acima disso ele bloqueia o IP por um tempo —,
   então as chamadas saem enfileiradas com 1,1s de intervalo. */
let _filaNominatim = Promise.resolve();
function nominatimEnfileirado(url) {
  const chamada = _filaNominatim.then(() => fetch(url).then(r => (r.ok ? r.json() : null)));
  _filaNominatim = chamada.catch(() => null).then(() => new Promise(r => setTimeout(r, 1100)));
  return chamada;
}

async function geocodificarCidade(cidadeUf) {
  const chave = normalizarBusca(cidadeUf);
  const municipios = await carregarMunicipios();
  const oficial = municipios && municipios.porNome.get(chave);
  if (oficial) return { lat: oficial.lat, lon: oficial.lon };

  const cache = lerCacheGeocode();
  if (cache[chave]) return cache[chave];

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(cidadeUf + ', Brasil')}`;
    const dados = await nominatimEnfileirado(url);
    if (!dados || !dados[0]) return null;
    const ponto = { lat: parseFloat(dados[0].lat), lon: parseFloat(dados[0].lon) };
    cache[chave] = ponto;
    salvarCacheJSON(GEOCODE_CACHE_CHAVE, cache);
    return ponto;
  } catch (e) {
    return null; // sem rede/bloqueado: quem chama trata como "cidade não localizada"
  }
}

/* Rotas do OSRM ficam em cache (localStorage) igual à geocodificação — a
   estrada entre duas cidades não muda de um dia pro outro, e isso poupa o
   servidor público do OSRM em reaberturas do mesmo trajeto. Limitado a um
   número de entradas pra não inchar o localStorage com a geometria (às vezes
   milhares de pontos) de rotas muito longas. Compartilhado entre o modal de
   Rota (entregas.js) e o mapa de deslocamento vazio (relatorios.js) — mesma
   chave "cidadeA>cidadeB", mesmo formato de valor. */
const ROTA_CACHE_CHAVE = 'rotas_osrm_v1';
const ROTA_CACHE_MAX_ENTRADAS = 30;

// Mesmo motivo do _geocodeCache acima: evita reparsear o JSON inteiro (com a
// geometria completa das rotas) do localStorage a cada chamada.
let _rotaCache = null;

function lerCacheRotas() {
  if (_rotaCache) return _rotaCache;
  try { _rotaCache = JSON.parse(localStorage.getItem(ROTA_CACHE_CHAVE)) || {}; }
  catch (e) { _rotaCache = {}; }
  return _rotaCache;
}

function salvarRotaCache(chave, dadosRota) {
  const cache = lerCacheRotas();
  cache[chave] = { ...dadosRota, _em: Date.now() };
  const chaves = Object.keys(cache);
  if (chaves.length > ROTA_CACHE_MAX_ENTRADAS) {
    chaves.sort((a, b) => cache[a]._em - cache[b]._em);
    delete cache[chaves[0]];
  }
  salvarCacheJSON(ROTA_CACHE_CHAVE, cache);
}

/* Ícone de caminhão reaproveitando o mesmo path do ícone do menu (icons.js) —
   usado como marcador no mapa da rota de uma entrega e no mapa de
   deslocamento vazio (um por trecho, cada um na cor daquele trecho). */
function iconeCaminhaoMapa(corPreenchimento = '#2E75B6', corBorda = '#1E4D78') {
  return L.divIcon({
    className: 'icone-caminhao-mapa',
    html: `<svg viewBox="0 0 24 24" fill="${corPreenchimento}" stroke="${corBorda}" stroke-width="1" width="28" height="28">${svgIcone('caminhao', 24).replace(/<svg[^>]*>|<\/svg>/g, '')}</svg>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

/* Geocodifica as duas cidades e busca (ou reaproveita do cache) o trajeto
   rodoviário real entre elas via OSRM — usado tanto pro modal de Rota quanto
   pro mapa de deslocamento vazio, sempre com a geometria completa
   (overview=full) porque os dois consumidores dependem dela pra desenhar a
   linha no mapa. Retorna null se não conseguir geocodificar ou calcular a
   rota; { distanceKm: 0, durationSec: 0, coordinates: [] } se origem e
   destino forem a mesma cidade (e não houver pontos de passagem).

   `vias` (opcional) são pontos de passagem obrigatórios [{lat, lon}, ...] —
   o OSRM sempre devolve a rota mais rápida que passa por eles, na ordem. */
async function obterRotaRodoviaria(cidadeA, cidadeB, vias = []) {
  const normA = normalizarBusca(cidadeA);
  const normB = normalizarBusca(cidadeB);
  if (normA === normB && !vias.length) return { distanceKm: 0, durationSec: 0, coordinates: [] };

  const [a, b] = await Promise.all([geocodificarCidade(cidadeA), geocodificarCidade(cidadeB)]);
  if (!a || !b) return null;

  const chaveVias = vias.map(v => `${v.lat.toFixed(3)},${v.lon.toFixed(3)}`).join('|');
  const chave = chaveVias ? `${normA}>${chaveVias}>${normB}` : `${normA}>${normB}`;
  const cache = lerCacheRotas();
  if (cache[chave]) {
    const r = cache[chave];
    return { distanceKm: r.distance / 1000, durationSec: r.duration, coordinates: r.coordinates };
  }

  try {
    const rotas = await consultarOSRM([a, ...vias, b], false);
    const r = rotas[0];
    if (!r) return null;
    salvarRotaCache(chave, { distance: r.distanceKm * 1000, duration: r.durationSec, coordinates: r.coordinates });
    return r;
  } catch (e) {
    return null;
  }
}

/* Chamada crua ao OSRM público. `alternativas` só vale pra 2 pontos (limite
   do próprio OSRM) — com pontos de passagem ele devolve só a melhor rota. A
   primeira rota da lista é sempre a mais rápida. */
async function consultarOSRM(pontos, alternativas) {
  const coords = pontos.map(p => `${p.lon},${p.lat}`).join(';');
  const alt = alternativas && pontos.length === 2 ? '&alternatives=3' : '';
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson${alt}`);
  const dados = await res.json();
  return (dados.routes || []).map(r => ({
    distanceKm: r.distance / 1000,
    durationSec: r.duration,
    coordinates: r.geometry.coordinates,
  }));
}

/* Rotas alternativas entre duas cidades (sem cache — só é chamada quando o
   usuário pede pra ver outras opções no formulário de entrega). */
async function obterRotasAlternativas(cidadeA, cidadeB) {
  const [a, b] = await Promise.all([geocodificarCidade(cidadeA), geocodificarCidade(cidadeB)]);
  if (!a || !b) return [];
  try { return await consultarOSRM([a, b], true); } catch (e) { return []; }
}

/* Nome "Cidade - UF" do município (sede) mais próximo de um ponto do mapa —
   usado pra dar nome legível ao ponto de passagem de uma rota alternativa
   escolhida. Busca na base oficial local, sem serviço externo. */
async function nomeCidadeNoPonto(lat, lon) {
  const municipios = await carregarMunicipios();
  if (!municipios) return null;
  let melhor = null;
  let menor = Infinity;
  const cosLat = Math.cos(lat * Math.PI / 180);
  for (const [nome, uf, mLat, mLon] of municipios.lista) {
    const d = (mLat - lat) ** 2 + ((mLon - lon) * cosLat) ** 2; // só pra comparar, dispensa a fórmula completa
    if (d < menor) { menor = d; melhor = `${nome} - ${uf}`; }
  }
  return melhor;
}

/* ===================== ESTIMATIVA DE VIAGEM DE CAMINHÃO =====================
   Compartilhada entre Entregas (planejamento/modal de Rota) e a página de
   Deslocamento Vazio. */
/* "5410" -> "1h 30min" / "45" -> "45min" — duração em segundos. */
function formatarDuracao(segundos) {
  const totalMin = Math.round(segundos / 60);
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (h === 0) return `${min}min`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}min`;
}

/* O tempo de direção "puro" que o OSRM devolve não é o tempo real de viagem —
   a Lei do Motorista (Lei 13.103/2015, art. 235-C da CLT) obriga: parada de
   30min a cada 5h30 de direção contínua, e descanso de 11h consecutivas a
   cada 8h de direção acumulada no dia. Simula esses limites pra estimar
   quanto tempo de relógio a viagem realmente leva. É só uma estimativa de
   planejamento — não substitui o cronotacógrafo/registro real do motorista. */
const LEI_MOTORISTA = {
  direcaoContinuaMaxH: 5.5,
  paradaCurtaH: 0.5,
  jornadaDirecaoMaxH: 8,
  descansoDiarioH: 11,
};

function simularViagemComParadasLegais(duracaoSegundos) {
  const { direcaoContinuaMaxH, paradaCurtaH, jornadaDirecaoMaxH, descansoDiarioH } = LEI_MOTORISTA;
  let restante = duracaoSegundos / 3600;
  let decorridoH = 0;
  let continuaH = 0;
  let acumDiaH = 0;
  let paradasCurtas = 0;
  let descansosLongos = 0;

  while (restante > 1e-9) {
    const bloco = Math.min(restante, direcaoContinuaMaxH - continuaH, jornadaDirecaoMaxH - acumDiaH);
    decorridoH += bloco;
    restante -= bloco;
    continuaH += bloco;
    acumDiaH += bloco;

    if (restante <= 1e-9) break;

    if (acumDiaH >= jornadaDirecaoMaxH - 1e-9) {
      decorridoH += descansoDiarioH;
      descansosLongos++;
      acumDiaH = 0;
      continuaH = 0;
    } else if (continuaH >= direcaoContinuaMaxH - 1e-9) {
      decorridoH += paradaCurtaH;
      paradasCurtas++;
      continuaH = 0;
    }
  }

  return { horasTotais: decorridoH, paradasCurtas, descansosLongos };
}

/* O OSRM público calcula tempo de CARRO. Pra caminhão carregado:
   - velocidade limitada a 90 km/h (limite do CTB pra veículo de carga em
     rodovia), e mesmo abaixo disso um caminhão pesado roda ~15% mais devagar
     que um carro no mesmo trecho (subida, retomada, ultrapassagem);
   - abastecimento a cada ~700 km — quando cai perto de um descanso de 11h,
     o motorista abastece durante ele, então só conta o que sobra;
   - parada em posto fiscal a cada divisa estadual cruzada (contada pela
     malha de estados do IBGE, ver ufsAoLongoDaRota em api.js).
   Validado contra o trecho a trecho do OSRM (Sapucaia do Sul/RS → João
   Pessoa/PB): 62,2h pela fórmula abaixo x 62,3h somando cada trecho.
   Valores ajustáveis aqui se a prática da empresa for diferente. */
const PARAMETROS_CAMINHAO = {
  velocidadeMaxKmH: 90,
  fatorCarregado: 0.85,
  autonomiaKm: 700,
  abastecimentoMin: 45,
  postoFiscalMin: 30,
};

function estimarViagemCaminhao(rota, ufs) {
  const { velocidadeMaxKmH, fatorCarregado, autonomiaKm, abastecimentoMin, postoFiscalMin } = PARAMETROS_CAMINHAO;
  const km = rota.distanceKm;
  const direcaoH = Math.max(
    rota.durationSec / 3600 / fatorCarregado,
    km / (velocidadeMaxKmH * fatorCarregado)
  );
  const { horasTotais, paradasCurtas, descansosLongos } = simularViagemComParadasLegais(direcaoH * 3600);
  const abastecimentos = Math.max(0, Math.floor(km / autonomiaKm) - descansosLongos);
  const divisas = ufs && ufs.length > 1 ? ufs.length - 1 : 0;
  const totalH = horasTotais + abastecimentos * abastecimentoMin / 60 + divisas * postoFiscalMin / 60;
  return { km, direcaoH, totalH, paradasCurtas, descansosLongos, abastecimentos, divisas, ufs: ufs || [] };
}

/* "131.5" (horas) -> "5d 11h 30min"; abaixo de 1 dia cai no formatarDuracao. */
function formatarHorasLongas(horas) {
  if (horas < 24) return formatarDuracao(horas * 3600);
  const totalMin = Math.round(horas * 60);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const min = totalMin % 60;
  return [`${d}d`, h ? `${h}h` : '', min ? `${min}min` : ''].filter(Boolean).join(' ');
}

function descreverParadas(est) {
  const partes = [];
  if (est.descansosLongos) partes.push(`${est.descansosLongos} descanso${est.descansosLongos > 1 ? 's' : ''} de 11h`);
  if (est.paradasCurtas) partes.push(`${est.paradasCurtas} parada${est.paradasCurtas > 1 ? 's' : ''} de 30min`);
  if (est.abastecimentos) partes.push(`${est.abastecimentos} abastecimento${est.abastecimentos > 1 ? 's' : ''}`);
  if (est.divisas) partes.push(`${est.divisas} posto${est.divisas > 1 ? 's' : ''} fisca${est.divisas > 1 ? 'is' : 'l'}`);
  return partes;
}

/* ===================== MALHA DOS ESTADOS (IBGE) =====================
   Contorno simplificado das 27 UFs (~100KB), usado pra descobrir por quantas
   divisas estaduais (postos fiscais) uma rota passa. Fica em cache sem
   expiração, igual à lista de cidades. */
const UFS_CACHE_CHAVE = 'ibge_ufs_malha_v1';
const SIGLA_UF_POR_CODIGO = {
  11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO',
  21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA',
  31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP', 41: 'PR', 42: 'SC', 43: 'RS',
  50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF',
};
let _malhaUfsPromise = null;

function carregarMalhaUFs() {
  if (_malhaUfsPromise) return _malhaUfsPromise;
  _malhaUfsPromise = (async () => {
    let geo = null;
    try { geo = JSON.parse(localStorage.getItem(UFS_CACHE_CHAVE)); } catch (e) { /* refaz abaixo */ }
    if (!geo) {
      const res = await fetch('https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&intrarregiao=UF&qualidade=minima');
      geo = await res.json();
      salvarCacheJSON(UFS_CACHE_CHAVE, geo);
    }
    // Normaliza tudo pra lista de polígonos (anéis externos) + bbox, pra o
    // teste ponto-no-polígono descartar rápido os estados longe do ponto.
    return geo.features.map(f => {
      const poligonos = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      const aneis = poligonos.map(p => p[0]);
      const todos = aneis.flat();
      const lons = todos.map(c => c[0]);
      const lats = todos.map(c => c[1]);
      return {
        uf: SIGLA_UF_POR_CODIGO[f.properties.codarea] || f.properties.codarea,
        aneis,
        bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
      };
    });
  })().catch(() => { _malhaUfsPromise = null; return null; });
  return _malhaUfsPromise;
}

function pontoNoAnel(lon, lat, anel) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/* Distância aproximada (km) entre dois pontos [lon, lat] próximos — basta pra
   medir o comprimento dos trechos da rota em cada estado. */
function kmEntrePontos([lon1, lat1], [lon2, lat2]) {
  const kmPorGrau = 111.32;
  const dx = (lon2 - lon1) * kmPorGrau * Math.cos((lat1 + lat2) / 2 * Math.PI / 180);
  const dy = (lat2 - lat1) * kmPorGrau;
  return Math.hypot(dx, dy);
}

/* Trecho mínimo pra contar como passagem por um estado. Rodovia que corre
   colada na divisa (BR-153 em Porto União/União da Vitória, região do rio
   Uruguai) cruza a linha várias vezes em poucos km, e a malha simplificada
   do IBGE erra a borda em alguns km — sem esse filtro a rota virava
   "RS → SC → RS → SC → PR → SC → PR", contando posto fiscal a cada vaivém. */
const UF_TRECHO_MINIMO_KM = 30;

/* Sequência de UFs por onde a rota passa (["RS", "SC", "PR", ...]), a partir
   de pontos amostrados da geometria ([lon, lat] do OSRM). Pontos que caem
   fora de todos os polígonos (malha simplificada, borda/litoral) são
   ignorados. Trechos intermediários mais curtos que UF_TRECHO_MINIMO_KM são
   absorvidos pelos vizinhos (o estado de origem e o de destino sempre
   ficam). Retorna null se a malha do IBGE não carregar. */
async function ufsAoLongoDaRota(coordenadas) {
  const malha = await carregarMalhaUFs();
  if (!malha || !coordenadas.length) return null;
  const passo = Math.max(1, Math.floor(coordenadas.length / 400));
  const trechos = [];
  let anterior = null;
  for (let i = 0; i < coordenadas.length; i += passo) {
    const [lon, lat] = coordenadas[i];
    const km = anterior ? kmEntrePontos(anterior, coordenadas[i]) : 0;
    anterior = coordenadas[i];
    const estado = malha.find(e => lon >= e.bbox[0] && lon <= e.bbox[2] && lat >= e.bbox[1] && lat <= e.bbox[3]
      && e.aneis.some(a => pontoNoAnel(lon, lat, a)));
    const ultimo = trechos[trechos.length - 1];
    if (!estado || (ultimo && ultimo.uf === estado.uf)) {
      if (ultimo) ultimo.km += km;
    } else {
      trechos.push({ uf: estado.uf, km });
    }
  }

  // Remove sempre o trecho curto mais curto primeiro e junta os vizinhos se
  // forem o mesmo estado (SC → RS curto → SC vira um SC só).
  for (;;) {
    let menor = -1;
    for (let i = 1; i < trechos.length - 1; i++) {
      if (trechos[i].km < UF_TRECHO_MINIMO_KM && (menor < 0 || trechos[i].km < trechos[menor].km)) menor = i;
    }
    if (menor < 0) break;
    const [curto] = trechos.splice(menor, 1);
    const antes = trechos[menor - 1];
    const depois = trechos[menor];
    antes.km += curto.km;
    if (antes.uf === depois.uf) {
      antes.km += depois.km;
      trechos.splice(menor, 1);
    }
  }
  return trechos.map(t => t.uf);
}

/* Liga o autocomplete num <input> — dropdown de sugestões, navegação por
   seta/Enter/Esc, filtra a lista do IBGE já em cache (sem tecla nenhuma
   pesquisa de novo na API, só filtra em memória). */
function ativarAutocompleteCidade(input) {
  if (!input) return;
  const container = input.parentElement;
  container.style.position = 'relative';

  const dropdown = document.createElement('div');
  dropdown.className = 'cidade-dropdown';
  dropdown.hidden = true;
  container.appendChild(dropdown);

  let itens = [];
  let indiceAtivo = -1;
  let debounce = null;

  function marcarAtivo() {
    [...dropdown.children].forEach((el, i) => el.classList.toggle('ativo', i === indiceAtivo));
  }

  function escolher(cidade) {
    input.value = cidade;
    dropdown.hidden = true;
    // Avisa quem estiver ouvindo (ex.: recálculo da rota no formulário de
    // entrega) — mudar .value por código não dispara "change" sozinho.
    input.dispatchEvent(new Event('change'));
  }

  function renderizar(lista) {
    itens = lista;
    indiceAtivo = -1;
    if (lista.length === 0) { dropdown.hidden = true; return; }
    dropdown.innerHTML = lista.map(c => `<div class="cidade-item">${escapeHtml(c)}</div>`).join('');
    dropdown.hidden = false;
  }

  async function filtrar(termo) {
    const q = normalizarBusca(termo.trim());
    if (q.length < 2) { dropdown.hidden = true; return; }
    const cidades = await carregarCidadesIBGE();
    renderizar(cidades.filter(c => normalizarBusca(c).includes(q)).slice(0, 8));
  }

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => filtrar(input.value), 200);
  });
  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2) filtrar(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (dropdown.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); indiceAtivo = Math.min(indiceAtivo + 1, itens.length - 1); marcarAtivo(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); indiceAtivo = Math.max(indiceAtivo - 1, 0); marcarAtivo(); }
    else if (e.key === 'Enter' && indiceAtivo >= 0) { e.preventDefault(); escolher(itens[indiceAtivo]); }
    else if (e.key === 'Escape') { dropdown.hidden = true; }
  });
  dropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.cidade-item');
    if (item) escolher(itens[[...dropdown.children].indexOf(item)]);
  });
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) dropdown.hidden = true;
  });
}

/* ===================== FOTOS (upload + visualização em tela cheia) ===================== */
/* A rota /uploads exige autenticação (como o resto da API), mas uma <img> não
   manda o header Authorization — por isso o token vai na querystring aqui. */
function urlFoto(fotoPath) {
  return `${API}${fotoPath}?token=${encodeURIComponent(getToken())}`;
}

function acionarUploadFoto(el) {
  const container = el.closest('[data-upload-foto]');
  const input = container && container.querySelector('input[type="file"]');
  if (input) input.click();
}

function abrirFotoTelaCheia(url) {
  let overlay = document.getElementById('lightbox-foto');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'lightbox-foto';
    overlay.className = 'lightbox-foto';
    overlay.innerHTML = '<img />';
    overlay.addEventListener('click', () => overlay.classList.remove('aberto'));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') overlay.classList.remove('aberto');
    });
    document.body.appendChild(overlay);
  }
  overlay.querySelector('img').src = url;
  overlay.classList.add('aberto');
}

/* ===================== PDF (identidade visual LogTrack) =====================
   Reaproveita as cores da interface (--primary, --accent etc. em style.css)
   pra dar aos relatórios exportados a mesma cara do sistema, em vez de texto
   solto em preto e branco. Usado por relatorios.js e manutencoes.js. */
const PDF_COR_PRIMARIA = [30, 42, 68];
const PDF_COR_ACCENT = [242, 169, 59];
const PDF_COR_TEXTO_CLARO = [124, 133, 152];
const PDF_COR_FUNDO = [245, 246, 250];
const PDF_COR_BORDA = [231, 233, 240];

/* Ícone do caminhão (mesmo desenho do logo da sidebar, em icons.js) desenhado
   com as primitivas do jsPDF, em contorno branco — fica à esquerda do "LogTrack". */
function pdfLogoCaminhao(doc, x, y, tamanho) {
  const s = tamanho / 22;
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.9 * s);
  doc.roundedRect(x + 1 * s, y + 3 * s, 15 * s, 13 * s, 0.8 * s, 0.8 * s, 'S');
  doc.lines([[4 * s, 0], [3 * s, 3 * s], [0, 5 * s], [-7 * s, 0]], x + 16 * s, y + 8 * s, [1, 1], 'S', true);
  doc.circle(x + 5.5 * s, y + 18.5 * s, 2.5 * s, 'S');
  doc.circle(x + 18.5 * s, y + 18.5 * s, 2.5 * s, 'S');
}

/* Retorna um callback pronto pra passar em autoTable({ didDrawPage }) — desenha
   a faixa azul do topo com o logo, "LogTrack" + título da seção, e o rodapé com a
   data de geração. Roda em toda página que a tabela criar (inclusive por estouro de linhas). */
function pdfCabecalhoRodape(doc, tituloSecao, geradoEm) {
  return function () {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setFillColor(...PDF_COR_PRIMARIA);
    doc.rect(0, 0, pageWidth, 20, 'F');
    pdfLogoCaminhao(doc, 14, 5.5, 9);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text('LogTrack', 27, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(210, 216, 230);
    doc.text(tituloSecao, pageWidth - 14, 13, { align: 'right' });
    doc.setFillColor(...PDF_COR_ACCENT);
    doc.rect(0, 20, pageWidth, 0.8, 'F');

    doc.setDrawColor(...PDF_COR_BORDA);
    doc.setLineWidth(0.2);
    doc.line(14, pageHeight - 16, pageWidth - 14, pageHeight - 16);
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COR_TEXTO_CLARO);
    doc.text(`LogTrack · Gerado em ${geradoEm}`, 14, pageHeight - 10);
  };
}

/* Título de seção com barrinha de destaque dourada, tipo os títulos de cards na tela. */
function pdfTituloSecao(doc, x, y, texto, tamanho = 13) {
  doc.setFillColor(...PDF_COR_ACCENT);
  doc.rect(x, y - (tamanho >= 13 ? 5.5 : 4.5), 3, tamanho >= 13 ? 7 : 5.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(tamanho);
  doc.setTextColor(...PDF_COR_PRIMARIA);
  doc.text(texto, x + 6, y);
  doc.setFont('helvetica', 'normal');
}

/* "Pílula" com fundo cinza claro, usada pra mostrar período/filtros no topo do relatório. */
function pdfPilula(doc, x, y, texto) {
  doc.setFontSize(9);
  const largura = doc.getTextWidth(texto) + 10;
  doc.setFillColor(...PDF_COR_FUNDO);
  doc.roundedRect(x, y, largura, 8, 4, 4, 'F');
  doc.setTextColor(...PDF_COR_PRIMARIA);
  doc.text(texto, x + 5, y + 5.5);
  return largura;
}

/* Linha de cards de indicadores (tipo os "cards-grid" da tela), divididos em partes
   iguais na largura disponível. Retorna a altura ocupada pra continuar o layout. */
function pdfCardsKPI(doc, x, y, largura, kpis) {
  const gap = 6;
  const larguraCard = (largura - gap * (kpis.length - 1)) / kpis.length;
  const altura = 22;
  kpis.forEach((k, i) => {
    const cx = x + i * (larguraCard + gap);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...PDF_COR_BORDA);
    doc.roundedRect(cx, y, larguraCard, altura, 3, 3, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...PDF_COR_PRIMARIA);
    doc.text(k.valor, cx + larguraCard / 2, y + 11, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COR_TEXTO_CLARO);
    doc.text(k.label, cx + larguraCard / 2, y + 17, { align: 'center' });
  });
  return altura;
}

/* Converte uma cor hex ("#1D8348") em array [r,g,b] pro setFillColor/setDrawColor do jsPDF. */
function pdfHexParaRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* Barra horizontal empilhada mostrando a proporção de cada status (mesmas cores dos
   badges da tela, via CORES_STATUS/corPorStatus), com legenda embaixo. Retorna a
   altura ocupada (barra + legenda) pra continuar o layout. */
function pdfBarraStatus(doc, x, y, largura, itens) {
  const total = itens.reduce((s, it) => s + it.valor, 0) || 1;
  const altura = 6;
  doc.setFillColor(...PDF_COR_FUNDO);
  doc.roundedRect(x, y, largura, altura, altura / 2, altura / 2, 'F');
  let cursorX = x;
  itens.forEach(it => {
    if (!it.valor) return;
    const w = (largura * it.valor) / total;
    doc.setFillColor(...pdfHexParaRgb(it.cor));
    doc.rect(cursorX, y, w, altura, 'F');
    cursorX += w;
  });

  let lx = x, ly = y + altura + 7;
  doc.setFontSize(8);
  itens.forEach(it => {
    if (!it.valor) return;
    doc.setFillColor(...pdfHexParaRgb(it.cor));
    doc.circle(lx + 1.3, ly - 1.3, 1.3, 'F');
    doc.setTextColor(...PDF_COR_PRIMARIA);
    const texto = `${it.label} (${it.valor})`;
    doc.text(texto, lx + 4.5, ly);
    lx += doc.getTextWidth(texto) + 10;
    if (lx > x + largura - 20) { lx = x; ly += 6; }
  });
  return (ly - y) + 4;
}

/* Pra usar em autoTable({ didParseCell, didDrawCell }) numa coluna de status: troca o
   texto simples por um selo colorido, igual aos badges da tela. `obterStatus`/`obterLabel`
   recebem o índice da linha (data.row.index) e devolvem a chave de CORES_STATUS / o rótulo. */
function pdfColunaBadgeStatus(colunaIndex, obterStatus, obterLabel) {
  return {
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === colunaIndex) {
        data.cell.text = [''];
      }
    },
    didDrawCell(data) {
      if (data.section !== 'body' || data.column.index !== colunaIndex) return;
      // Linha mais alta que a página é quebrada pelo autoTable e o pedaço da
      // página seguinte pode chegar com um índice fora da lista — sem selo nele.
      let status, label;
      try {
        status = obterStatus(data.row.index);
        label = obterLabel(data.row.index);
      } catch (e) {
        return;
      }
      if (!status || !label) return;
      const cor = pdfHexParaRgb(corPorStatus(status));
      const cellDoc = data.doc;
      cellDoc.setFont('helvetica', 'normal');
      cellDoc.setFontSize(7.5);
      const padX = 2.2, altura = 5.2;
      const largura = cellDoc.getTextWidth(label) + padX * 2;
      const cy = data.cell.y + (data.cell.height - altura) / 2;
      const cx = data.cell.x + 2;
      cellDoc.setFillColor(...cor);
      cellDoc.roundedRect(cx, cy, largura, altura, altura / 2, altura / 2, 'F');
      cellDoc.setTextColor(255, 255, 255);
      cellDoc.text(label, cx + largura / 2, cy + altura / 2 + 1.5, { align: 'center' });
    }
  };
}

/* Estilo padrão de autoTable com as cores do sistema — usar via spread: {...PDF_ESTILO_TABELA} */
const PDF_ESTILO_TABELA = {
  headStyles: { fillColor: PDF_COR_PRIMARIA, textColor: 255, fontSize: 9 },
  bodyStyles: { fontSize: 8, textColor: PDF_COR_PRIMARIA },
  alternateRowStyles: { fillColor: PDF_COR_FUNDO },
  styles: { lineColor: PDF_COR_BORDA, lineWidth: 0.1, cellPadding: 3 },
  margin: { left: 14, right: 14, top: 26, bottom: 22 },
};

/* Escreve "Página X de N" em todas as páginas — só dá pra saber o total depois
   que o documento inteiro foi montado, por isso roda por último, antes do doc.save(). */
function pdfFinalizarPaginas(doc) {
  const total = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COR_TEXTO_CLARO);
    doc.text(`Página ${i} de ${total}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
  }
}

/* ===================== MENU MOBILE ===================== */
function toggleMenu() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  sidebar.classList.toggle('aberta');
  overlay.classList.toggle('ativo');
}

function fecharMenu() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  sidebar.classList.remove('aberta');
  overlay.classList.remove('ativo');
}

aplicarTema();
aplicarVisibilidadePorPerfil();
renderizarTopbar();
carregarNotificacoes();
ativarBuscaGlobal();

document.addEventListener('DOMContentLoaded', () => {
  aplicarTema();
  aplicarVisibilidadePorPerfil();
  renderizarTopbar();
});