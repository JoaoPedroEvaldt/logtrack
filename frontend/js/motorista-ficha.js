/* Ficha do motorista (motorista-ficha.html?id=N): dados cadastrais, conjunto
   atual, resumo do período (viagens, km, frete, comissão de 13%,
   pontualidade), gráfico dos últimos 12 meses, viagens e ocorrências do
   período e a ficha em PDF. Tudo calculado aqui em cima das listas que a API
   já devolve — a regra de comissão é a mesma do painel (COMISSAO_MOTORISTA
   em app/routers/dashboard.py): 13% do frete de cada entrega concluída,
   sem descontar abastecimento. O acerto da empresa fecha a cada 30 dias,
   por isso o período padrão é o mês corrente. */
checarAuth();
checarStaff();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';

const COMISSAO_MOTORISTA = 0.13;
const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const TIPO_OCORRENCIA_LABEL = {
  atraso: 'Atraso', acidente: 'Acidente', cliente_ausente: 'Cliente ausente',
  problema_mecanico: 'Problema mecânico', extravio: 'Extravio', outro: 'Outro'
};
const PALETA_AVATAR_FICHA = ['#5B6478', '#8B5CF6', '#10B981', '#EC4899', '#64748B', '#0EA5A4', '#3B82F6', '#F59E0B'];

const motoristaId = parseInt(new URLSearchParams(location.search).get('id'), 10);
let ficha = null;      // { motorista, conjunto, entregas, ocorrencias, veiculos }
let graficoFicha = null;

function reais(v) {
  return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatarKm(km) {
  return `${Math.round(km || 0).toLocaleString('pt-BR')} km`;
}

function formatarCpfFicha(cpf) {
  const d = (cpf || '').replace(/\D/g, '');
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (cpf || '—');
}

function iniciaisFicha(nome) {
  const partes = (nome || '').trim().split(/\s+/);
  return ((partes[0] ? partes[0][0] : '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase() || '?';
}

/* Data que posiciona a viagem no período: a conclusão (é ela que gera a
   comissão), ou a previsão de chegada se ainda não foi concluída. */
function dataDaViagem(e) {
  return e.status === 'entregue' && e.concluido_em ? dataUtc(e.concluido_em) : new Date(e.previsao);
}

function chaveMes(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function rotuloMes(chave) {
  const [ano, mes] = chave.split('-').map(Number);
  return `${NOMES_MES[mes - 1]} de ${ano}`;
}

function noPrazo(e) {
  return e.status === 'entregue' && e.concluido_em && dataUtc(e.concluido_em) <= new Date(e.previsao);
}

function diasParaVencer(dataISO) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((new Date(dataISO + 'T00:00:00') - hoje) / 86400000);
}

async function carregarFicha() {
  if (!motoristaId) {
    window.location.href = 'motoristas.html';
    return;
  }
  const [motorista, entregas, conjuntos, ocorrencias, veiculos] = await Promise.all([
    get(`/motoristas/${motoristaId}`), get('/entregas'), get('/conjuntos'), get('/ocorrencias'), get('/veiculos')
  ]);
  if (!motorista || motorista.detail) {
    document.getElementById('ficha-perfil').innerHTML = estadoVazio(null, 'Motorista não encontrado', 'Volte para a lista de motoristas.', 'usuario');
    return;
  }

  const entregasDele = (entregas || []).filter(e => e.motorista_id === motoristaId && e.status !== 'cancelado');
  const idsEntregas = new Set(entregasDele.map(e => e.id));
  ficha = {
    motorista,
    conjunto: (conjuntos || []).find(c => c.motorista_id === motoristaId) || null,
    entregas: entregasDele,
    ocorrencias: (ocorrencias || []).filter(o => idsEntregas.has(o.entrega_id)),
    veiculos: new Map((veiculos || []).map(v => [v.id, v])),
  };

  document.title = `LogTrack — ${motorista.nome}`;
  document.getElementById('ficha-titulo').textContent = motorista.nome;
  renderizarPerfil();
  preencherPeriodos();
  renderizarPeriodo();
  renderizarGrafico();
}

/* ===================== PERFIL ===================== */
function renderizarPerfil() {
  const { motorista: m, conjunto, entregas } = ficha;
  const emViagem = entregas.some(e => e.status === 'em_rota');
  const statusTexto = m.status === 'inativo' ? 'Inativo' : (emViagem ? 'Em viagem' : 'Disponível');
  const statusBadge = m.status === 'inativo' ? 'cancelado' : (emViagem ? 'em_rota' : 'entregue');

  const dias = diasParaVencer(m.cnh_validade);
  const cnhBadge = dias < 0
    ? `<span class="badge badge-ocorrencia">Vencida há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? '' : 's'}</span>`
    : dias <= 30
      ? `<span class="badge badge-atrasado">Vence em ${dias} dia${dias === 1 ? '' : 's'}</span>`
      : `<span class="badge badge-entregue">Em dia</span>`;

  const placas = conjunto
    ? [conjunto.cavalo, conjunto.semirreboque1, conjunto.semirreboque2].filter(Boolean).map(v => v.placa).join(' / ')
    : '';
  const concluidas = entregas.filter(e => e.status === 'entregue');
  const freteTotal = concluidas.reduce((s, e) => s + (parseFloat(e.valor_frete) || 0), 0);
  const primeiraViagem = concluidas.length ? new Date(Math.min(...concluidas.map(e => dataUtc(e.concluido_em) || new Date(e.previsao)))) : null;

  const info = (rotulo, valor) => `<div class="ficha-info"><span>${rotulo}</span><strong>${valor}</strong></div>`;

  document.getElementById('ficha-perfil').innerHTML = `
    <div class="ficha-perfil-topo">
      <div class="ficha-avatar" style="background:${PALETA_AVATAR_FICHA[m.id % PALETA_AVATAR_FICHA.length]};">${escapeHtml(iniciaisFicha(m.nome))}</div>
      <div class="ficha-identidade">
        <h2>${escapeHtml(m.nome)}</h2>
        <div class="ficha-tags">
          <span class="badge badge-${statusBadge}">${statusTexto}</span>
          ${conjunto
            ? `<span class="ficha-tag">${svgIcone('caminhao', 13)} ${escapeHtml(conjunto.nome)}${placas ? ' · ' + escapeHtml(placas) : ''}</span>`
            : '<span class="ficha-tag">Sem conjunto fixo</span>'}
          ${m.telefone ? `<span class="ficha-tag">${escapeHtml(m.telefone)}</span>` : ''}
        </div>
      </div>
      <div class="ficha-acoes">
        <a class="btn btn-outline" href="entregas.html?motorista=${m.id}">${svgIcone('local', 14)} Ver rotograma</a>
        <a class="btn btn-outline" href="motoristas.html?editar=${m.id}">${svgIcone('editar', 14)} Editar</a>
        <button class="btn btn-primary" onclick="exportarFichaPDF()">${svgIcone('download', 14)} Ficha em PDF</button>
      </div>
    </div>
    <div class="ficha-infos">
      ${info('CPF', escapeHtml(formatarCpfFicha(m.cpf)))}
      ${info('CNH', `${escapeHtml(m.cnh_numero)} · cat. ${escapeHtml(m.cnh_categoria)}`)}
      ${info('Validade da CNH', `${formatarData(m.cnh_validade)} ${cnhBadge}`)}
      ${info('Acesso ao sistema', m.possui_login ? escapeHtml(m.email || 'Sim') : 'Sem acesso')}
      ${info('Viagens concluídas', concluidas.length.toLocaleString('pt-BR'))}
      ${info('Frete total gerado', reais(freteTotal))}
      ${info('Comissão acumulada (13%)', reais(freteTotal * COMISSAO_MOTORISTA))}
      ${info('Primeira viagem', primeiraViagem ? primeiraViagem.toLocaleDateString('pt-BR') : '—')}
    </div>
  `;
}

/* ===================== PERÍODO ===================== */
function preencherPeriodos() {
  const meses = new Set([chaveMes(new Date())]);
  ficha.entregas.forEach(e => meses.add(chaveMes(dataDaViagem(e))));
  const ordenados = [...meses].sort().reverse();
  const sel = document.getElementById('ficha-periodo');
  sel.innerHTML = ordenados.map(c => `<option value="${c}">${rotuloMes(c)}</option>`).join('')
    + '<option value="tudo">Todo o histórico</option>';
  sel.value = chaveMes(new Date());
}

function resumoDoPeriodo(periodo) {
  const doPeriodo = ficha.entregas
    .filter(e => periodo === 'tudo' || chaveMes(dataDaViagem(e)) === periodo)
    .sort((a, b) => dataDaViagem(b) - dataDaViagem(a));
  const concluidas = doPeriodo.filter(e => e.status === 'entregue');
  const frete = concluidas.reduce((s, e) => s + (parseFloat(e.valor_frete) || 0), 0);
  const km = concluidas.reduce((s, e) => s + (parseFloat(e.distancia_km) || 0), 0);
  const pontuais = concluidas.filter(noPrazo).length;
  const ocorrencias = ficha.ocorrencias.filter(o => periodo === 'tudo' || chaveMes(dataUtc(o.criado_em)) === periodo);
  return {
    viagens: doPeriodo, concluidas, frete, km, comissao: frete * COMISSAO_MOTORISTA,
    pontualidade: concluidas.length ? Math.round(pontuais / concluidas.length * 100) : null,
    ocorrencias,
  };
}

function renderizarPeriodo() {
  const periodo = document.getElementById('ficha-periodo').value;
  const r = resumoDoPeriodo(periodo);
  const nomePeriodo = periodo === 'tudo' ? 'todo o histórico' : rotuloMes(periodo);
  document.getElementById('ficha-periodo-sub').textContent = `Viagens concluídas em ${nomePeriodo} e comissão de 13% sobre o frete`;

  const card = (cor, icone, valor, rotulo) => `
    <div class="card ${cor}">
      <div class="card-icon">${svgIcone(icone, 20)}</div>
      <div class="card-valor">${valor}</div>
      <div class="card-label">${rotulo}</div>
    </div>`;
  document.getElementById('ficha-kpis').innerHTML = [
    card('azul', 'caminhao', r.concluidas.length, 'Viagens concluídas'),
    card('azul', 'local', formatarKm(r.km), 'Km rodados (carregado)'),
    card('verde', 'dinheiro', reais(r.frete), 'Frete gerado'),
    card('laranja', 'usuario', reais(r.comissao), 'Comissão (13%)'),
    card('verde', 'relogio', r.pontualidade === null ? '—' : `${r.pontualidade}%`, 'Entregas no prazo'),
    card('vermelho', 'alerta', r.ocorrencias.length, 'Ocorrências'),
  ].join('');

  renderizarComissao(r, nomePeriodo);
  renderizarViagens(r, nomePeriodo);
  renderizarOcorrencias(r);
}

/* Quadro "como chegou na comissão": frete de cada viagem concluída × 13%. */
function renderizarComissao(r, nomePeriodo) {
  const linhas = r.concluidas.slice(0, 6).map(e => `
    <div class="ficha-comissao-linha">
      <span>#${e.id} · ${escapeHtml(e.destino)}</span>
      <span>${reais(parseFloat(e.valor_frete) || 0)}</span>
    </div>`).join('');
  const restantes = r.concluidas.length - 6;
  document.getElementById('ficha-comissao').innerHTML = `
    <div class="table-header"><h2>Comissão — ${escapeHtml(nomePeriodo)}</h2></div>
    <div class="ficha-comissao-corpo">
      ${r.concluidas.length ? linhas + (restantes > 0 ? `<div class="ficha-comissao-mais">+ ${restantes} viage${restantes === 1 ? 'm' : 'ns'}</div>` : '') : '<div class="ficha-comissao-mais">Nenhuma viagem concluída no período.</div>'}
      <div class="ficha-comissao-linha ficha-comissao-total">
        <span>Frete total (${r.concluidas.length} viage${r.concluidas.length === 1 ? 'm' : 'ns'})</span>
        <span>${reais(r.frete)}</span>
      </div>
      <div class="ficha-comissao-linha">
        <span>× 13% de comissão</span>
        <span></span>
      </div>
      <div class="ficha-comissao-resultado">
        <span>Comissão do motorista</span>
        <strong>${reais(r.comissao)}</strong>
      </div>
      <p class="ficha-nota">Sobre o frete bruto, sem descontar abastecimento. O acerto com o motorista fecha a cada 30 dias.</p>
    </div>`;
}

function renderizarViagens(r, nomePeriodo) {
  document.getElementById('ficha-viagens-sub').textContent =
    `${r.viagens.length} viage${r.viagens.length === 1 ? 'm' : 'ns'} em ${nomePeriodo} (canceladas não entram)`;
  const tbody = document.getElementById('ficha-viagens');
  if (!r.viagens.length) {
    tbody.innerHTML = estadoVazio(8, 'Nenhuma viagem no período', 'Escolha outro mês ou "Todo o histórico".', 'caminhao');
    return;
  }
  tbody.innerHTML = r.viagens.map(e => {
    const v = ficha.veiculos.get(e.veiculo_id);
    const frete = parseFloat(e.valor_frete) || 0;
    const concluida = e.status === 'entregue';
    return `
      <tr>
        <td>#${e.id}</td>
        <td>${dataDaViagem(e).toLocaleDateString('pt-BR')}${concluida && !noPrazo(e) ? ` <span title="Concluída depois da previsão" style="color:var(--warning);">${svgIcone('relogio', 12)}</span>` : ''}</td>
        <td>${escapeHtml(e.origem)} → ${escapeHtml(e.destino)}</td>
        <td>${v ? escapeHtml(v.placa) : '—'}</td>
        <td>${e.distancia_km ? formatarKm(parseFloat(e.distancia_km)) : '—'}</td>
        <td>${reais(frete)}</td>
        <td>${concluida ? reais(frete * COMISSAO_MOTORISTA) : '<span style="color:var(--text-light);">ao concluir</span>'}</td>
        <td>${badgeStatus(e.status)}</td>
      </tr>`;
  }).join('');
}

function renderizarOcorrencias(r) {
  const tbody = document.getElementById('ficha-ocorrencias');
  if (!r.ocorrencias.length) {
    tbody.innerHTML = estadoVazio(5, 'Nenhuma ocorrência no período', null, 'check');
    return;
  }
  tbody.innerHTML = [...r.ocorrencias]
    .sort((a, b) => dataUtc(b.criado_em) - dataUtc(a.criado_em))
    .map(o => `
      <tr>
        <td>${formatarDataHoraUtc(o.criado_em)}</td>
        <td>#${o.entrega_id}</td>
        <td>${escapeHtml(TIPO_OCORRENCIA_LABEL[o.tipo] || o.tipo)}</td>
        <td>${escapeHtml(o.descricao)}</td>
        <td>${o.status === 'aberta' ? '<span class="badge badge-ocorrencia">Aberta</span>' : '<span class="badge badge-entregue">Finalizada</span>'}</td>
      </tr>`).join('');
}

/* ===================== GRÁFICO ===================== */
function ultimos12Meses() {
  const hoje = new Date();
  return Array.from({ length: 12 }, (_, i) => chaveMes(new Date(hoje.getFullYear(), hoje.getMonth() - 11 + i, 1)));
}

function renderizarGrafico() {
  const meses = ultimos12Meses();
  const fretePorMes = Object.fromEntries(meses.map(m => [m, 0]));
  ficha.entregas.filter(e => e.status === 'entregue').forEach(e => {
    const chave = chaveMes(dataDaViagem(e));
    if (chave in fretePorMes) fretePorMes[chave] += parseFloat(e.valor_frete) || 0;
  });
  const escuro = document.body.classList.contains('dark');
  const corTexto = escuro ? '#9CA3AF' : '#7C8598';
  const corGrade = escuro ? '#374151' : '#E7E9F0';

  if (graficoFicha) graficoFicha.destroy();
  graficoFicha = new Chart(document.getElementById('ficha-grafico'), {
    type: 'bar',
    data: {
      labels: meses.map(m => NOMES_MES[parseInt(m.slice(5), 10) - 1].slice(0, 3).replace(/^./, c => c.toUpperCase())),
      datasets: [
        { type: 'bar', label: 'Frete', data: meses.map(m => fretePorMes[m]), backgroundColor: escuro ? '#4A6FA5' : '#2E3E60', borderRadius: 6, order: 2 },
        { type: 'line', label: 'Comissão (13%)', data: meses.map(m => fretePorMes[m] * COMISSAO_MOTORISTA), borderColor: '#F2A93B', backgroundColor: '#F2A93B', tension: 0.3, pointRadius: 3, order: 1, yAxisID: 'y1' },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: corTexto, usePointStyle: true } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${reais(ctx.parsed.y)}` } },
      },
      scales: {
        x: { ticks: { color: corTexto }, grid: { display: false } },
        y: { ticks: { color: corTexto, callback: v => 'R$ ' + (v / 1000).toLocaleString('pt-BR') + ' mil' }, grid: { color: corGrade }, beginAtZero: true },
        y1: { position: 'right', ticks: { color: '#DC922A', callback: v => 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' }, grid: { display: false }, beginAtZero: true },
      },
    },
  });
}

/* ===================== PDF ===================== */
/* As rotas usam "»" no PDF: a fonte padrão do jsPDF (WinAnsi) não tem "→" e
   embaralhava o texto da célula. */
function exportarFichaPDF() {
  if (!ficha) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const m = ficha.motorista;
  const periodo = document.getElementById('ficha-periodo').value;
  const nomePeriodo = periodo === 'tudo' ? 'Todo o histórico' : rotuloMes(periodo).replace(/^./, c => c.toUpperCase());
  const r = resumoDoPeriodo(periodo);
  const geradoEm = new Date().toLocaleString('pt-BR');
  const largura = doc.internal.pageSize.getWidth() - 28;
  const cabecalho = pdfCabecalhoRodape(doc, 'Ficha do motorista', geradoEm);
  cabecalho();

  let y = 34;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...PDF_COR_PRIMARIA);
  doc.text(m.nome, 14, y);
  y += 6;
  pdfPilula(doc, 14, y, `Período: ${nomePeriodo}`);
  y += 16;

  pdfTituloSecao(doc, 14, y, 'Dados cadastrais', 11);
  y += 4;
  const conjunto = ficha.conjunto;
  const placas = conjunto ? [conjunto.cavalo, conjunto.semirreboque1, conjunto.semirreboque2].filter(Boolean).map(v => v.placa).join(' / ') : '';
  doc.autoTable({
    ...PDF_ESTILO_TABELA,
    startY: y,
    theme: 'plain',
    body: [
      ['CPF', formatarCpfFicha(m.cpf), 'Telefone', m.telefone || '—'],
      ['CNH', `${m.cnh_numero} (cat. ${m.cnh_categoria})`, 'Validade da CNH', formatarData(m.cnh_validade)],
      ['Conjunto', conjunto ? conjunto.nome : 'Sem conjunto fixo', 'Placas', placas || '—'],
    ],
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 26 }, 2: { fontStyle: 'bold', cellWidth: 32 } },
    didDrawPage: cabecalho,
  });
  y = doc.lastAutoTable.finalY + 10;

  pdfTituloSecao(doc, 14, y, 'Resumo do período', 11);
  y += 5;
  y += pdfCardsKPI(doc, 14, y, largura, [
    { valor: String(r.concluidas.length), label: 'Viagens concluídas' },
    { valor: formatarKm(r.km), label: 'Km rodados' },
    { valor: reais(r.frete), label: 'Frete gerado' },
    { valor: reais(r.comissao), label: 'Comissão (13%)' },
  ]) + 4;
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COR_TEXTO_CLARO);
  doc.text(`Entregas no prazo: ${r.pontualidade === null ? '—' : r.pontualidade + '%'}  ·  Ocorrências: ${r.ocorrencias.length}  ·  Comissão = 13% do frete bruto, sem descontar abastecimento.`, 14, y);
  y += 10;

  pdfTituloSecao(doc, 14, y, 'Viagens do período', 11);
  const statusLabel = { aguardando: 'Aguardando', em_rota: 'Em rota', entregue: 'Entregue', atrasado: 'Atrasado', ocorrencia: 'Ocorrência' };
  doc.autoTable({
    ...PDF_ESTILO_TABELA,
    startY: y + 4,
    head: [['#', 'Data', 'Rota', 'Veículo', 'Frete', 'Comissão', 'Status']],
    body: r.viagens.length ? r.viagens.map(e => {
      const v = ficha.veiculos.get(e.veiculo_id);
      const frete = parseFloat(e.valor_frete) || 0;
      return [`#${e.id}`, dataDaViagem(e).toLocaleDateString('pt-BR'), `${e.origem} » ${e.destino}`, v ? v.placa : '—',
        reais(frete), e.status === 'entregue' ? reais(frete * COMISSAO_MOTORISTA) : '—', statusLabel[e.status] || e.status];
    }) : [['', '', 'Nenhuma viagem no período', '', '', '', '']],
    foot: r.viagens.length ? [['', '', 'Total das concluídas', '', reais(r.frete), reais(r.comissao), '']] : undefined,
    footStyles: { fillColor: PDF_COR_FUNDO, textColor: PDF_COR_PRIMARIA, fontStyle: 'bold', fontSize: 8 },
    columnStyles: { 2: { cellWidth: 58 }, 6: { cellWidth: 24 } },
    ...(r.viagens.length ? pdfColunaBadgeStatus(6, i => r.viagens[i].status, i => statusLabel[r.viagens[i].status] || r.viagens[i].status) : {}),
    didDrawPage: cabecalho,
  });

  pdfFinalizarPaginas(doc);
  const nomeArquivo = m.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
  doc.save(`ficha-${nomeArquivo}-${periodo}.pdf`);
}

carregarFicha();
