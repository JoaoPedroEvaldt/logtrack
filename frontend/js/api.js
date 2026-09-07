const API = 'http://127.0.0.1:8000';

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
  return res.json();
}

async function enviarArquivo(endpoint, formData, metodo = 'POST') {
  const res = await fetch(`${API}${endpoint}`, {
    method: metodo,
    headers: { 'Authorization': `Bearer ${getToken()}` },
    body: formData
  });
  return res.json();
}

async function del(endpoint) {
  const res = await fetch(`${API}${endpoint}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
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

function formatarData(data) {
  if (!data) return '—';
  return new Date(data).toLocaleDateString('pt-BR');
}

function formatarDataHora(data) {
  if (!data) return '—';
  return new Date(data).toLocaleString('pt-BR');
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
    return res.detail.map(e => e.msg || JSON.stringify(e)).join('; ');
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
    .filter(o => new Date(o.criado_em).getTime() >= seteDiasAtras)
    .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));

  const itens = [
    ...listaVencimentos.map(v => ({
      titulo: `${TIPO_LABEL_NOTIFICACAO[v.tipo] || v.tipo} — ${v.referencia}`,
      sub: v.vencido ? `Vencido em ${formatarData(v.validade)}` : `Vence em ${formatarData(v.validade)}`,
      classe: v.vencido ? 'badge-ocorrencia' : 'badge-atrasado',
    })),
    ...ocorrenciasRecentes.map(o => ({
      titulo: 'Nova ocorrência registrada',
      sub: formatarDataHora(o.criado_em),
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
      const status = obterStatus(data.row.index);
      const label = obterLabel(data.row.index);
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