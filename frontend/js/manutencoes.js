checarAuth();
checarStaff();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';
aplicarMascaraMoeda(document.getElementById('custo'));

const TIPO_LABEL = { preventiva: 'Preventiva', corretiva: 'Corretiva', revisao: 'Revisão', pneus: 'Pneus', eletrica: 'Elétrica', freios: 'Freios', outro: 'Outro' };

let manutencoes = [];
let manutencoesFiltradas = [];
let manutencaoEditandoId = null;
// tipo (cavalo/semirreboque) e motorista atual de cada veículo, para os filtros
let tipoPorVeiculo = {};
let motoristaPorVeiculo = {};

async function carregarManutencoes() {
  manutencoes = await get('/manutencoes') || [];
  filtrar();
}

// Motorista atual = o do conjunto ativo em que o veículo (cavalo ou carreta) está engatado.
async function carregarConjuntos() {
  const conjuntos = await get('/conjuntos') || [];
  motoristaPorVeiculo = {};
  conjuntos.filter(c => c.status === 'ativo' && c.motorista).forEach(c => {
    [c.cavalo_id, c.semirreboque1_id, c.semirreboque2_id].forEach(id => {
      if (id) motoristaPorVeiculo[id] = c.motorista.nome || '';
    });
  });
}

async function carregarVeiculos() {
  const data = await get('/veiculos') || [];
  tipoPorVeiculo = {};
  data.forEach(v => { tipoPorVeiculo[v.id] = v.tipo; });
  const sel = document.getElementById('veiculo-id');
  while (sel.options.length > 1) sel.remove(1);
  data.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = `${v.placa} — ${v.modelo} ${v.marca}`;
    sel.appendChild(opt);
  });
}

function atualizarCards(lista) {
  document.getElementById('total-manutencoes').textContent = lista.length;
  document.getElementById('total-concluidas').textContent = lista.filter(m => m.status === 'concluida').length;
  document.getElementById('total-andamento').textContent = lista.filter(m => m.status === 'em_andamento').length;
  document.getElementById('total-agendadas').textContent = lista.filter(m => m.status === 'agendada').length;
  document.getElementById('custo-periodo').textContent = formatarReais(somarCusto(lista));
}

function somarCusto(lista) {
  return lista.reduce((s, m) => s + (parseFloat(m.custo) || 0), 0);
}

function formatarReais(valor) {
  return 'R$ ' + valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderizar(lista) {
  const tbody = document.getElementById('tabela-manutencoes');

  if (lista.length === 0) {
    tbody.innerHTML = estadoVazio(11, 'Nenhuma manutenção registrada', 'O histórico de manutenções da frota aparecerá aqui.', 'check');
    return;
  }

  const tipoBadge = { preventiva: 1, corretiva: 2, revisao: 3, pneus: 4, eletrica: 5, freios: 6, outro: 7 };

  const statusBadge = {
    concluida: 'badge-entregue',
    em_andamento: 'badge-em_rota',
    agendada: 'badge-aguardando'
  };

  const statusLabel = {
    concluida: 'Concluída',
    em_andamento: 'Em andamento',
    agendada: 'Agendada'
  };

  tbody.innerHTML = lista.map(m => `
    <tr>
      <td>#${m.id}</td>
      <td>${m.veiculo ? `<strong>${escapeHtml(m.veiculo.placa)}</strong><br><small>${escapeHtml(m.veiculo.modelo)} ${escapeHtml(m.veiculo.marca)}</small>${motoristaPorVeiculo[m.veiculo_id] ? `<br><small style="color:var(--text-light);">${escapeHtml(motoristaPorVeiculo[m.veiculo_id])}</small>` : ''}` : '—'}</td>
      <td>${formatarData(m.data_manutencao)}${m.data_fim ? ' → ' + formatarData(m.data_fim) : ''}</td>
      <td><span class="badge badge-tipo-${tipoBadge[m.tipo] || 7}">${TIPO_LABEL[m.tipo] || escapeHtml(m.tipo)}</span></td>
      <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(m.descricao)}</td>
      <td>${escapeHtml(m.mecanico) || '—'}</td>
      <td>${m.quilometragem != null ? m.quilometragem.toLocaleString('pt-BR') + ' km' : '—'}</td>
      <td>${m.custo != null ? 'R$ ' + parseFloat(m.custo).toLocaleString('pt-BR', {minimumFractionDigits:2}) : '—'}</td>
      <td><span class="badge ${statusBadge[m.status]}">${statusLabel[m.status] || m.status}</span></td>
      <td>${m.proxima_revisao ? formatarData(m.proxima_revisao) : '—'}</td>
      <td style="display:flex;gap:6px;">
        <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;" onclick="editarManutencao(${m.id})">${svgIcone('editar', 12)} Editar</button>
        <button class="btn btn-danger" style="font-size:11px;padding:4px 10px;" onclick="excluirManutencao(${m.id})">${svgIcone('excluir', 12)} Excluir</button>
      </td>
    </tr>
  `).join('');
}

function filtrar() {
  const tipo = document.getElementById('filtro-tipo').value;
  const status = document.getElementById('filtro-status').value;
  const categoria = document.getElementById('filtro-categoria').value;
  const busca = document.getElementById('filtro-veiculo').value.trim().toLowerCase();
  const inicio = document.getElementById('filtro-data-inicio').value;
  const fim = document.getElementById('filtro-data-fim').value;

  manutencoesFiltradas = manutencoes.filter(m => {
    const texto = m.veiculo
      ? `${m.veiculo.placa} ${m.veiculo.modelo} ${m.veiculo.marca} ${motoristaPorVeiculo[m.veiculo_id] || ''}`.toLowerCase()
      : '';
    return (!tipo || m.tipo === tipo) &&
           (!status || m.status === status) &&
           (!categoria || tipoPorVeiculo[m.veiculo_id] === categoria) &&
           (!busca || texto.includes(busca)) &&
           (!inicio || m.data_manutencao >= inicio) &&
           (!fim || m.data_manutencao <= fim);
  });

  renderizar(manutencoesFiltradas);
  atualizarCards(manutencoesFiltradas);
}

function limparFiltros() {
  ['filtro-tipo', 'filtro-status', 'filtro-categoria', 'filtro-veiculo', 'filtro-data-inicio', 'filtro-data-fim']
    .forEach(id => { document.getElementById(id).value = ''; });
  filtrar();
}

// Filtros ativos, um por pílula no topo do PDF.
function descreverFiltros() {
  const partes = [];
  const inicio = document.getElementById('filtro-data-inicio').value;
  const fim = document.getElementById('filtro-data-fim').value;
  if (inicio && fim) partes.push(`Período: ${formatarData(inicio)} a ${formatarData(fim)}`);
  else if (inicio) partes.push(`A partir de ${formatarData(inicio)}`);
  else if (fim) partes.push(`Até ${formatarData(fim)}`);
  ['filtro-categoria', 'filtro-tipo', 'filtro-status'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel.value) partes.push(sel.options[sel.selectedIndex].text);
  });
  const busca = document.getElementById('filtro-veiculo').value.trim();
  if (busca) partes.push(`Busca: "${busca}"`);
  return partes.length ? partes : ['Todas as manutenções registradas'];
}

function abrirModal() {
  manutencaoEditandoId = null;
  document.getElementById('modal-titulo').textContent = 'Nova Manutenção';
  document.getElementById('veiculo-id').value = '';
  document.getElementById('data-manutencao').value = '';
  document.getElementById('data-fim').value = '';
  document.getElementById('tipo').value = '';
  document.getElementById('status').value = 'concluida';
  document.getElementById('mecanico').value = '';
  document.getElementById('quilometragem').value = '';
  document.getElementById('custo').value = '';
  document.getElementById('proxima-revisao').value = '';
  document.getElementById('descricao').value = '';
  document.getElementById('modal').classList.add('aberto');
}

function fecharModal() {
  document.getElementById('modal').classList.remove('aberto');
}

async function editarManutencao(id) {
  const m = manutencoes.find(m => m.id === id);
  if (!m) return;
  manutencaoEditandoId = id;
  document.getElementById('modal-titulo').textContent = 'Editar Manutenção';
  document.getElementById('veiculo-id').value = m.veiculo_id;
  document.getElementById('data-manutencao').value = m.data_manutencao;
  document.getElementById('data-fim').value = m.data_fim || '';
  document.getElementById('tipo').value = m.tipo;
  document.getElementById('status').value = m.status;
  document.getElementById('mecanico').value = m.mecanico || '';
  document.getElementById('quilometragem').value = m.quilometragem || '';
  document.getElementById('custo').value = numeroParaMoeda(m.custo);
  document.getElementById('proxima-revisao').value = m.proxima_revisao || '';
  document.getElementById('descricao').value = m.descricao;
  document.getElementById('modal').classList.add('aberto');
}

async function excluirManutencao(id) {
  if (!(await confirmarAcao('Deseja excluir esta manutenção?'))) return;
  await del(`/manutencoes/${id}`);
  carregarManutencoes();
}

async function salvarManutencao() {
  const dados = {
    veiculo_id: parseInt(document.getElementById('veiculo-id').value),
    data_manutencao: document.getElementById('data-manutencao').value,
    data_fim: document.getElementById('data-fim').value || null,
    tipo: document.getElementById('tipo').value,
    status: document.getElementById('status').value,
    mecanico: document.getElementById('mecanico').value || null,
    quilometragem: parseInt(document.getElementById('quilometragem').value) || null,
    custo: moedaParaNumero(document.getElementById('custo').value),
    proxima_revisao: document.getElementById('proxima-revisao').value || null,
    descricao: document.getElementById('descricao').value,
  };

  if (!dados.veiculo_id || !dados.data_manutencao || !dados.tipo || !dados.descricao) {
    toastAviso('Preencha todos os campos obrigatórios!');
    return;
  }

  let res;
  if (manutencaoEditandoId) {
    res = await put(`/manutencoes/${manutencaoEditandoId}`, dados);
  } else {
    res = await post('/manutencoes', dados);
  }

  if (res.detail) {
    toastErro('Erro: ' + extrairErro(res));
    return;
  }

  fecharModal();
  carregarManutencoes();
}

async function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const geradoEm = new Date().toLocaleString('pt-BR');

  const lista = manutencoesFiltradas;
  if (lista.length === 0) {
    toastAviso('Nenhuma manutenção nos filtros atuais para exportar.');
    return;
  }
  const kpis = [
    { valor: String(lista.length), label: 'Manutenções no relatório' },
    { valor: formatarReais(somarCusto(lista)), label: 'Custo no período' },
  ];

  let y = 30;
  pdfTituloSecao(doc, 14, y, 'Relatório de Manutenções');
  y += 5;
  let x = 14;
  descreverFiltros().forEach(texto => {
    doc.setFontSize(9);
    if (x > 14 && x + doc.getTextWidth(texto) + 10 > pageWidth - 14) { x = 14; y += 10; }
    x += pdfPilula(doc, x, y, texto) + 4;
  });
  y += 13;
  y += pdfCardsKPI(doc, 14, y, pageWidth - 28, kpis) + 12;

  const statusLabelPDF = { concluida: 'Concluída', em_andamento: 'Em andamento', agendada: 'Agendada' };
  const linhas = lista.map(m => [
    `#${m.id}`,
    m.veiculo ? `${m.veiculo.placa} — ${m.veiculo.modelo}` : '—',
    formatarData(m.data_manutencao),
    TIPO_LABEL[m.tipo] || m.tipo,
    m.mecanico || '—',
    m.quilometragem != null ? m.quilometragem.toLocaleString('pt-BR') + ' km' : '—',
    m.custo != null ? 'R$ ' + parseFloat(m.custo).toLocaleString('pt-BR', {minimumFractionDigits:2}) : '—',
    statusLabelPDF[m.status] || m.status,
  ]);

  const badgeStatusManutencao = pdfColunaBadgeStatus(
    7,
    (i) => lista[i].status,
    (i) => statusLabelPDF[lista[i].status] || lista[i].status
  );

  doc.autoTable({
    startY: y,
    head: [['#', 'Veículo', 'Data', 'Tipo', 'Mecânico', 'KM', 'Custo', 'Status']],
    body: linhas,
    ...PDF_ESTILO_TABELA,
    columnStyles: { 7: { cellWidth: 27 } },
    didDrawPage: pdfCabecalhoRodape(doc, 'Manutenções', geradoEm),
    didParseCell: badgeStatusManutencao.didParseCell,
    didDrawCell: badgeStatusManutencao.didDrawCell,
  });

  pdfFinalizarPaginas(doc);
  doc.save(`logtrack-manutencoes-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`);
}

// Veículos e conjuntos antes das manutenções: os filtros de categoria e motorista dependem deles.
Promise.all([carregarVeiculos(), carregarConjuntos()]).finally(carregarManutencoes);