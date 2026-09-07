checarAuth();
checarStaff();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';

let todasEntregas = [], todosVeiculos = [], todasManutencoes = [], todasOcorrencias = [], todosConjuntos = [];
let graficoMensal = null;

const NOMES_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const LABEL_STATUS = { aguardando: 'Aguardando', em_rota: 'Em Rota', entregue: 'Entregue', atrasado: 'Atrasado', ocorrencia: 'Ocorrência', cancelado: 'Cancelado' };
const LABEL_TIPO_OCORRENCIA = { atraso: 'Atraso', acidente: 'Acidente', cliente_ausente: 'Cliente Ausente', problema_mecanico: 'Problema Mecânico', extravio: 'Extravio', outro: 'Outro' };

function definirPeriodoPadrao() {
  const hoje = new Date();
  const seisMesesAtras = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);
  document.getElementById('data-fim').value = hoje.toISOString().slice(0, 10);
  document.getElementById('data-inicio').value = seisMesesAtras.toISOString().slice(0, 10);
}

function preencherFiltroConjunto() {
  const sel = document.getElementById('filtro-conjunto');
  todosConjuntos.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.nome;
    sel.appendChild(opt);
  });
}

function conjuntoDaEntrega(entrega) {
  return todosConjuntos.find(c =>
    (entrega.motorista_id && c.motorista_id === entrega.motorista_id) ||
    (entrega.veiculo_id && (c.cavalo_id === entrega.veiculo_id || c.semirreboque1_id === entrega.veiculo_id || c.semirreboque2_id === entrega.veiculo_id))
  );
}

function veiculosDoConjunto(conjunto) {
  return [conjunto.cavalo_id, conjunto.semirreboque1_id, conjunto.semirreboque2_id].filter(Boolean);
}

function periodoSelecionado() {
  const inicioStr = document.getElementById('data-inicio').value;
  const fimStr = document.getElementById('data-fim').value;
  const conjuntoId = document.getElementById('filtro-conjunto').value;
  return {
    inicioStr, fimStr,
    inicio: inicioStr ? new Date(inicioStr + 'T00:00:00') : null,
    fim: fimStr ? new Date(fimStr + 'T23:59:59') : null,
    conjunto: conjuntoId ? todosConjuntos.find(c => String(c.id) === conjuntoId) : null
  };
}

function entregasNoPeriodo({ inicio, fim, conjunto }) {
  return todasEntregas.filter(e => {
    const dataRef = e.concluido_em ? new Date(e.concluido_em) : new Date(e.criado_em);
    if (inicio && dataRef < inicio) return false;
    if (fim && dataRef > fim) return false;
    if (conjunto) {
      const c = conjuntoDaEntrega(e);
      if (!c || c.id !== conjunto.id) return false;
    }
    return true;
  });
}

function ocorrenciasNoPeriodo({ inicio, fim, conjunto }) {
  return todasOcorrencias.filter(o => {
    const d = new Date(o.criado_em);
    if (inicio && d < inicio) return false;
    if (fim && d > fim) return false;
    if (conjunto) {
      const entrega = todasEntregas.find(e => e.id === o.entrega_id);
      const c = entrega ? conjuntoDaEntrega(entrega) : null;
      if (!c || c.id !== conjunto.id) return false;
    }
    return true;
  });
}

function manutencoesNoPeriodo({ inicio, fim, conjunto }) {
  const veiculosPermitidos = conjunto ? veiculosDoConjunto(conjunto) : null;
  return todasManutencoes.filter(m => {
    const d = new Date(m.data_manutencao + 'T00:00:00');
    if (inicio && d < inicio) return false;
    if (fim && d > fim) return false;
    if (veiculosPermitidos && !veiculosPermitidos.includes(m.veiculo_id)) return false;
    return true;
  });
}

function mesesDoPeriodo(inicio, fim) {
  const meses = [];
  const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  const limite = new Date(fim.getFullYear(), fim.getMonth(), 1);
  while (cursor <= limite && meses.length < 12) {
    meses.push({ ano: cursor.getFullYear(), mes: cursor.getMonth(), label: NOMES_MES[cursor.getMonth()] });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return meses;
}

function renderizarGraficoMensal(entregas, inicio, fim) {
  const hoje = new Date();
  const meses = mesesDoPeriodo(inicio || new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1), fim || hoje);
  const dados = meses.map(m => entregas.filter(e => {
    if (e.status !== 'entregue' || !e.concluido_em) return false;
    const d = new Date(e.concluido_em);
    return d.getFullYear() === m.ano && d.getMonth() === m.mes;
  }).length);

  if (graficoMensal) graficoMensal.destroy();
  graficoMensal = new Chart(document.getElementById('grafico-mensal'), {
    type: 'bar',
    data: { labels: meses.map(m => m.label), datasets: [{ data: dados, backgroundColor: '#2E3E60', borderRadius: 6, maxBarThickness: 42 }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

function atualizarRelatorio() {
  const periodo = periodoSelecionado();
  const incluirOcorrencias = document.getElementById('modulo-ocorrencias').checked;
  const incluirManutencoes = document.getElementById('modulo-manutencoes').checked;

  const entregasFiltradas = entregasNoPeriodo(periodo);
  const entregues = entregasFiltradas.filter(e => e.status === 'entregue');
  document.getElementById('stat-entregues').textContent = entregues.length;

  document.getElementById('tile-ocorrencias').style.display = incluirOcorrencias ? '' : 'none';
  if (incluirOcorrencias) {
    document.getElementById('stat-ocorrencias').textContent = ocorrenciasNoPeriodo(periodo).length;
  }

  document.getElementById('tile-manutencao').style.display = incluirManutencoes ? '' : 'none';
  if (incluirManutencoes) {
    const custoTotal = manutencoesNoPeriodo(periodo).reduce((soma, m) => soma + (parseFloat(m.custo) || 0), 0);
    document.getElementById('stat-custo-manutencao').textContent = 'R$ ' + custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }

  renderizarGraficoMensal(entregasFiltradas, periodo.inicio, periodo.fim);

  const fmt = d => d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  document.getElementById('preview-sub').textContent =
    `${fmt(periodo.inicio)} – ${fmt(periodo.fim)} · ${periodo.conjunto ? periodo.conjunto.nome : 'Todos os conjuntos'}`;

  const modulos = ['as entregas'];
  if (incluirOcorrencias) modulos.push('ocorrências');
  if (incluirManutencoes) modulos.push('manutenções');
  document.getElementById('preview-nota').textContent =
    `Pré-visualização — o PDF final inclui ${modulos.join(', ')} do período.`;
}

async function carregarDados() {
  [todasEntregas, todosVeiculos, todasManutencoes, todasOcorrencias, todosConjuntos] = await Promise.all([
    get('/entregas'), get('/veiculos'), get('/manutencoes'), get('/ocorrencias'), get('/conjuntos')
  ]);
  todasEntregas = todasEntregas || [];
  todosVeiculos = todosVeiculos || [];
  todasManutencoes = todasManutencoes || [];
  todasOcorrencias = todasOcorrencias || [];
  todosConjuntos = todosConjuntos || [];
  preencherFiltroConjunto();
  atualizarRelatorio();
}

async function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const geradoEm = new Date().toLocaleString('pt-BR');

  const periodo = periodoSelecionado();
  const entregasFiltradas = entregasNoPeriodo(periodo);
  const incluirOcorrencias = document.getElementById('modulo-ocorrencias').checked;
  const incluirManutencoes = document.getElementById('modulo-manutencoes').checked;
  const incluirDesempenho = document.getElementById('modulo-motoristas-veiculos').checked;

  const entregues = entregasFiltradas.filter(e => e.status === 'entregue');

  /* ---- Capa: pílulas de filtro + título + cards de indicadores ---- */
  let y = 30;
  let x = 14;
  x += pdfPilula(doc, x, y, `Período: ${periodo.inicioStr || '—'} a ${periodo.fimStr || '—'}`) + 4;
  pdfPilula(doc, x, y, `Conjunto: ${periodo.conjunto ? periodo.conjunto.nome : 'Todos'}`);
  y += 16;

  pdfTituloSecao(doc, 14, y, 'Relatório de Desempenho Operacional');
  y += 10;

  const kpis = [
    { valor: String(entregues.length), label: 'Entregas concluídas' },
  ];
  if (incluirOcorrencias) kpis.push({ valor: String(ocorrenciasNoPeriodo(periodo).length), label: 'Ocorrências' });
  if (incluirManutencoes) {
    const custoTotal = manutencoesNoPeriodo(periodo).reduce((s, m) => s + (parseFloat(m.custo) || 0), 0);
    kpis.push({ valor: 'R$ ' + custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), label: 'Custo com manutenção' });
  }
  y += pdfCardsKPI(doc, 14, y, pageWidth - 28, kpis) + 12;

  const contagemPorStatus = {};
  entregasFiltradas.forEach(e => { contagemPorStatus[e.status] = (contagemPorStatus[e.status] || 0) + 1; });
  const itensBarraStatus = Object.keys(LABEL_STATUS)
    .map(s => ({ status: s, label: LABEL_STATUS[s], valor: contagemPorStatus[s] || 0, cor: corPorStatus(s) }));
  if (entregasFiltradas.length) {
    y += pdfBarraStatus(doc, 14, y, pageWidth - 28, itensBarraStatus) + 6;
  }

  pdfTituloSecao(doc, 14, y, 'Entregas do período', 12);
  y += 6;

  const badgeStatusEntregas = pdfColunaBadgeStatus(
    3,
    (i) => entregasFiltradas[i].status,
    (i) => LABEL_STATUS[entregasFiltradas[i].status] || entregasFiltradas[i].status
  );

  doc.autoTable({
    startY: y,
    head: [['Cliente', 'Origem', 'Destino', 'Status', 'Previsão', 'Concluído em']],
    body: entregasFiltradas.map(e => [
      e.cliente, e.origem, e.destino,
      LABEL_STATUS[e.status] || e.status,
      formatarDataHora(e.previsao), formatarDataHora(e.concluido_em)
    ]),
    ...PDF_ESTILO_TABELA,
    columnStyles: { 3: { cellWidth: 27 } },
    didDrawPage: pdfCabecalhoRodape(doc, 'Entregas do período', geradoEm),
    didParseCell: badgeStatusEntregas.didParseCell,
    didDrawCell: badgeStatusEntregas.didDrawCell,
  });

  if (incluirOcorrencias) {
    const lista = ocorrenciasNoPeriodo(periodo);
    doc.addPage();
    pdfTituloSecao(doc, 14, 32, 'Ocorrências do período');
    doc.autoTable({
      startY: 40,
      head: [['Veículo', 'Tipo', 'Descrição', 'Data']],
      body: lista.map(o => {
        const entrega = todasEntregas.find(e => e.id === o.entrega_id);
        const veiculo = entrega ? todosVeiculos.find(v => v.id === entrega.veiculo_id) : null;
        return [
          veiculo ? veiculo.placa : '—',
          LABEL_TIPO_OCORRENCIA[o.tipo] || o.tipo,
          o.descricao,
          formatarDataHora(o.criado_em)
        ];
      }),
      ...PDF_ESTILO_TABELA,
      didDrawPage: pdfCabecalhoRodape(doc, 'Ocorrências do período', geradoEm),
    });
  }

  if (incluirManutencoes) {
    const lista = manutencoesNoPeriodo(periodo);
    doc.addPage();
    pdfTituloSecao(doc, 14, 32, 'Manutenções do período');
    doc.autoTable({
      startY: 40,
      head: [['Veículo', 'Data', 'Tipo', 'Custo']],
      body: lista.map(m => {
        const v = todosVeiculos.find(v => v.id === m.veiculo_id);
        return [
          v ? v.placa : `#${m.veiculo_id}`,
          formatarData(m.data_manutencao),
          m.tipo,
          m.custo != null ? 'R$ ' + parseFloat(m.custo).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'
        ];
      }),
      ...PDF_ESTILO_TABELA,
      didDrawPage: pdfCabecalhoRodape(doc, 'Manutenções do período', geradoEm),
    });
  }

  if (incluirDesempenho) {
    const desempenho = todosVeiculos.map(v => {
      const viagens = entregasFiltradas.filter(e => e.veiculo_id === v.id && e.status === 'entregue');
      const faturamento = viagens.reduce((s, e) => s + (parseFloat(e.valor_frete) || 0), 0);
      return { v, viagens: viagens.length, faturamento };
    }).filter(d => d.viagens > 0).sort((a, b) => b.faturamento - a.faturamento);

    doc.addPage();
    pdfTituloSecao(doc, 14, 32, 'Desempenho por veículo');
    doc.autoTable({
      startY: 40,
      head: [['Veículo', 'Viagens concluídas', 'Faturamento']],
      body: desempenho.map(({ v, viagens, faturamento }) => [
        `${v.placa} — ${v.modelo}`, viagens, 'R$ ' + faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      ]),
      ...PDF_ESTILO_TABELA,
      didDrawPage: pdfCabecalhoRodape(doc, 'Desempenho por veículo', geradoEm),
    });
  }

  pdfFinalizarPaginas(doc);
  doc.save(`logtrack-relatorio-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`);
}

definirPeriodoPadrao();
carregarDados();
