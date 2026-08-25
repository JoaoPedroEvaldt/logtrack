checarAuth();
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

function formatarDuracaoMedia(msMedio) {
  if (!msMedio || isNaN(msMedio)) return '—';
  const totalMin = Math.round(msMedio / 60000);
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return `${h}h ${String(min).padStart(2, '0')}min`;
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

  const duracoes = entregues
    .filter(e => e.iniciado_em && e.concluido_em)
    .map(e => new Date(e.concluido_em) - new Date(e.iniciado_em));
  const mediaDuracao = duracoes.length ? duracoes.reduce((a, b) => a + b, 0) / duracoes.length : null;
  document.getElementById('stat-tempo-medio').textContent = formatarDuracaoMedia(mediaDuracao);

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
  const periodo = periodoSelecionado();
  const entregasFiltradas = entregasNoPeriodo(periodo);

  doc.setFontSize(18);
  doc.setTextColor(30, 42, 68);
  doc.text('LogTrack — Relatório de Desempenho Operacional', 14, 20);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Período: ${periodo.inicioStr || '—'} a ${periodo.fimStr || '—'} · Conjunto: ${periodo.conjunto ? periodo.conjunto.nome : 'Todos'}`, 14, 27);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 33);

  doc.autoTable({
    startY: 40,
    head: [['Código', 'Cliente', 'Origem', 'Destino', 'Status', 'Previsão', 'Concluído em']],
    body: entregasFiltradas.map(e => [
      `#E-${e.id}`, e.cliente, e.origem, e.destino,
      LABEL_STATUS[e.status] || e.status,
      formatarDataHora(e.previsao), formatarDataHora(e.concluido_em)
    ]),
    headStyles: { fillColor: [30, 42, 68], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [245, 246, 250] },
    margin: { left: 14, right: 14 }
  });

  if (document.getElementById('modulo-ocorrencias').checked) {
    const lista = ocorrenciasNoPeriodo(periodo);
    doc.addPage();
    doc.setFontSize(16); doc.setTextColor(30, 42, 68);
    doc.text('Ocorrências do período', 14, 20);
    doc.autoTable({
      startY: 28,
      head: [['Entrega', 'Tipo', 'Descrição', 'Data']],
      body: lista.map(o => [`#E-${o.entrega_id}`, LABEL_TIPO_OCORRENCIA[o.tipo] || o.tipo, o.descricao, formatarDataHora(o.criado_em)]),
      headStyles: { fillColor: [30, 42, 68], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 14, right: 14 }
    });
  }

  if (document.getElementById('modulo-manutencoes').checked) {
    const lista = manutencoesNoPeriodo(periodo);
    doc.addPage();
    doc.setFontSize(16); doc.setTextColor(30, 42, 68);
    doc.text('Manutenções do período', 14, 20);
    doc.autoTable({
      startY: 28,
      head: [['Veículo', 'Data', 'Tipo', 'Custo']],
      body: lista.map(m => {
        const v = todosVeiculos.find(v => v.id === m.veiculo_id);
        return [
          v ? v.placa : `#${m.veiculo_id}`,
          formatarData(m.data_manutencao),
          m.tipo,
          m.custo ? 'R$ ' + parseFloat(m.custo).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'
        ];
      }),
      headStyles: { fillColor: [30, 42, 68], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 14, right: 14 }
    });
  }

  if (document.getElementById('modulo-motoristas-veiculos').checked) {
    const desempenho = todosVeiculos.map(v => {
      const viagens = entregasFiltradas.filter(e => e.veiculo_id === v.id && e.status === 'entregue');
      const faturamento = viagens.reduce((s, e) => s + (parseFloat(e.valor_frete) || 0), 0);
      return { v, viagens: viagens.length, faturamento };
    }).filter(d => d.viagens > 0).sort((a, b) => b.faturamento - a.faturamento);

    doc.addPage();
    doc.setFontSize(16); doc.setTextColor(30, 42, 68);
    doc.text('Desempenho por veículo', 14, 20);
    doc.autoTable({
      startY: 28,
      head: [['Veículo', 'Viagens concluídas', 'Faturamento']],
      body: desempenho.map(({ v, viagens, faturamento }) => [
        `${v.placa} — ${v.modelo}`, viagens, 'R$ ' + faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      ]),
      headStyles: { fillColor: [30, 42, 68], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 14, right: 14 }
    });
  }

  doc.save(`logtrack-relatorio-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`);
}

definirPeriodoPadrao();
carregarDados();
