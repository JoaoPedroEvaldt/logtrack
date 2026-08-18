checarAuth();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';

let todasEntregas = [];
let todosVeiculos = [];
let todasManutencoes = [];
let desempenhoVeiculosAtual = [];
let graficoStatus = null;
let graficoMotoristas = null;

function definirPeriodoPadrao() {
  const hoje = new Date();
  const seisMesesAtras = new Date();
  seisMesesAtras.setMonth(hoje.getMonth() - 6);
  document.getElementById('data-fim').value = hoje.toISOString().slice(0, 10);
  document.getElementById('data-inicio').value = seisMesesAtras.toISOString().slice(0, 10);
}

function preencherFiltroVeiculos() {
  const sel = document.getElementById('filtro-veiculo');
  todosVeiculos.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = `${v.placa} — ${v.modelo}`;
    sel.appendChild(opt);
  });
}

async function carregarDados() {
  [todasEntregas, todosVeiculos, todasManutencoes] = await Promise.all([
    get('/entregas'), get('/veiculos'), get('/manutencoes')
  ]);
  todasEntregas = todasEntregas || [];
  todosVeiculos = todosVeiculos || [];
  todasManutencoes = todasManutencoes || [];
  preencherFiltroVeiculos();
  filtrar();
}

function renderizar(lista) {
  const tbody = document.getElementById('tabela-body');
  document.getElementById('total-label').textContent = `${lista.length} registro(s)`;

  document.getElementById('total-entregas').textContent = lista.length;
  document.getElementById('total-entregues').textContent = lista.filter(e => e.status === 'entregue').length;
  document.getElementById('total-atrasadas').textContent = lista.filter(e => e.status === 'atrasado').length;
  document.getElementById('total-ocorrencias').textContent = lista.filter(e => e.status === 'ocorrencia').length;

  if (lista.length === 0) {
    tbody.innerHTML = estadoVazio(7, 'Nenhuma entrega encontrada', 'Ajuste os filtros de período ou status para ver resultados.', 'vazio');
    return;
  }

  tbody.innerHTML = lista.map(e => `
    <tr>
      <td>#${e.id}</td>
      <td>${escapeHtml(e.cliente)}</td>
      <td>${escapeHtml(e.origem)}</td>
      <td>${escapeHtml(e.destino)}</td>
      <td>${badgeStatus(e.status)}</td>
      <td>${formatarDataHora(e.previsao)}</td>
      <td>${formatarDataHora(e.concluido_em)}</td>
    </tr>
  `).join('');
}

function carregarGraficos(lista) {
  const statusCount = {};
  lista.forEach(e => {
    statusCount[e.status] = (statusCount[e.status] || 0) + 1;
  });

  const statusKeys = Object.keys(statusCount);
  const labels = statusKeys.map(s => ({
    aguardando: 'Aguardando', em_rota: 'Em Rota', entregue: 'Entregue',
    atrasado: 'Atrasado', ocorrencia: 'Ocorrência', cancelado: 'Cancelado'
  }[s] || s));

  if (graficoStatus) graficoStatus.destroy();
  graficoStatus = new Chart(document.getElementById('grafico-status'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: Object.values(statusCount),
        backgroundColor: statusKeys.map(s => corPorStatus(s)),
        borderWidth: 0
      }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });

  const motoristasCount = {};
  lista.forEach(e => {
    if (e.motorista_id) {
      const key = `Motorista #${e.motorista_id}`;
      motoristasCount[key] = (motoristasCount[key] || 0) + 1;
    }
  });

  if (graficoMotoristas) graficoMotoristas.destroy();
  graficoMotoristas = new Chart(document.getElementById('grafico-motoristas'), {
    type: 'bar',
    data: {
      labels: Object.keys(motoristasCount),
      datasets: [{
        label: 'Entregas',
        data: Object.values(motoristasCount),
        backgroundColor: '#2E75B6',
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function filtrar() {
  const inicio = document.getElementById('data-inicio').value;
  const fim = document.getElementById('data-fim').value;
  const status = document.getElementById('filtro-status').value;

  let filtradas = todasEntregas;

  if (inicio) filtradas = filtradas.filter(e => new Date(e.criado_em) >= new Date(inicio));
  if (fim) filtradas = filtradas.filter(e => new Date(e.criado_em) <= new Date(fim + 'T23:59:59'));
  if (status) filtradas = filtradas.filter(e => e.status === status);

  renderizar(filtradas);
  carregarGraficos(filtradas);
  renderizarDesempenhoVeiculos(inicio, fim);
}

function diasManutencaoNoPeriodo(m, periodoInicio, periodoFim) {
  const inicioM = new Date(m.data_manutencao + 'T00:00:00');
  const fimM = m.data_fim ? new Date(m.data_fim + 'T00:00:00') : new Date();
  const inicio = periodoInicio && periodoInicio > inicioM ? periodoInicio : inicioM;
  const fim = periodoFim && periodoFim < fimM ? periodoFim : fimM;
  const dias = Math.round((fim - inicio) / 86400000);
  return dias > 0 ? dias : 0;
}

function renderizarDesempenhoVeiculos(inicioStr, fimStr) {
  const tbody = document.getElementById('tabela-veiculos-body');
  if (!tbody) return;

  const veiculoFiltro = document.getElementById('filtro-veiculo').value;
  const periodoInicio = inicioStr ? new Date(inicioStr + 'T00:00:00') : null;
  const periodoFim = fimStr ? new Date(fimStr + 'T23:59:59') : null;

  let veiculos = todosVeiculos;
  if (veiculoFiltro) veiculos = veiculos.filter(v => String(v.id) === veiculoFiltro);

  document.getElementById('total-label-veiculos').textContent = `${veiculos.length} veículo(s)`;

  if (veiculos.length === 0) {
    tbody.innerHTML = estadoVazio(4, 'Nenhum veículo encontrado', null, 'caminhao');
    return;
  }

  const linhas = veiculos.map(v => {
    const entregasVeiculo = todasEntregas.filter(e =>
      e.veiculo_id === v.id && e.status === 'entregue' && e.concluido_em &&
      (!periodoInicio || new Date(e.concluido_em) >= periodoInicio) &&
      (!periodoFim || new Date(e.concluido_em) <= periodoFim)
    );

    const viagens = entregasVeiculo.length;
    const faturamento = entregasVeiculo.reduce((soma, e) => soma + (parseFloat(e.valor_frete) || 0), 0);

    const diasManutencao = todasManutencoes
      .filter(m => m.veiculo_id === v.id)
      .reduce((soma, m) => soma + diasManutencaoNoPeriodo(m, periodoInicio, periodoFim), 0);

    return { v, viagens, faturamento, diasManutencao };
  }).sort((a, b) => b.faturamento - a.faturamento);

  desempenhoVeiculosAtual = linhas;

  tbody.innerHTML = linhas.map(({ v, viagens, faturamento, diasManutencao }) => `
    <tr>
      <td><strong>${escapeHtml(v.placa)}</strong><br><small style="color:var(--text-light);">${escapeHtml(v.modelo)} ${escapeHtml(v.marca)}</small></td>
      <td>${viagens}</td>
      <td>R$ ${faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
      <td>${diasManutencao} dia(s)</td>
    </tr>
  `).join('');
}

async function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.setTextColor(30, 77, 120);
  doc.text('LogTrack — Relatório de Entregas', 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);

  const tbody = document.getElementById('tabela-body');
  const linhas = Array.from(tbody.querySelectorAll('tr')).map(tr =>
    Array.from(tr.querySelectorAll('td')).map((td, i) => {
      if (i === 4) return td.querySelector('.badge')?.textContent || td.textContent;
      return td.textContent.trim();
    })
  );

  doc.autoTable({
    startY: 35,
    head: [['#', 'Cliente', 'Origem', 'Destino', 'Status', 'Previsão', 'Concluído em']],
    body: linhas,
    headStyles: { fillColor: [30, 77, 120], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [240, 244, 250] },
    margin: { left: 14, right: 14 }
  });

  const linhasVeiculos = desempenhoVeiculosAtual.map(({ v, viagens, faturamento, diasManutencao }) => [
    `${v.placa} — ${v.modelo} ${v.marca}`,
    viagens,
    'R$ ' + faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
    `${diasManutencao} dia(s)`
  ]);

  doc.addPage();
  doc.setFontSize(18);
  doc.setTextColor(30, 77, 120);
  doc.text('LogTrack — Desempenho por Veículo', 14, 20);

  doc.autoTable({
    startY: 30,
    head: [['Veículo', 'Viagens concluídas', 'Faturamento', 'Dias em manutenção']],
    body: linhasVeiculos,
    headStyles: { fillColor: [30, 77, 120], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [240, 244, 250] },
    margin: { left: 14, right: 14 }
  });

  doc.save(`logtrack-relatorio-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`);
}

definirPeriodoPadrao();
carregarDados();