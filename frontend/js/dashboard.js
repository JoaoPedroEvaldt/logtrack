checarAuth();

document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || 'Usuário';
document.getElementById('data-hoje').textContent = new Date().toLocaleDateString('pt-BR', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

async function carregarResumo() {
  const data = await get('/dashboard/resumo');
  if (!data) return;

  document.getElementById('entregas-hoje').textContent = data.entregas_hoje;
  document.getElementById('concluidas-hoje').textContent = data.concluidas_hoje;
  document.getElementById('em-rota').textContent = data.em_rota;
  document.getElementById('atrasadas').textContent = data.atrasadas;
  document.getElementById('ocorrencias').textContent = data.ocorrencias_abertas;
  document.getElementById('veiculos').textContent = data.veiculos_disponiveis;
  document.getElementById('motoristas-disponiveis').textContent = data.motoristas_disponiveis;
}

async function carregarGraficoStatus() {
  const data = await get('/dashboard/entregas-por-status');
  if (!data) return;

  const labels = data.map(d => {
    const nomes = {
      aguardando: 'Aguardando', em_rota: 'Em Rota',
      entregue: 'Entregue', atrasado: 'Atrasado',
      ocorrencia: 'Ocorrência', cancelado: 'Cancelado'
    };
    return nomes[d.status] || d.status;
  });

  new Chart(document.getElementById('grafico-status'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: data.map(d => d.total),
        backgroundColor: data.map(d => corPorStatus(d.status)),
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

async function carregarGraficoDias() {
  const data = await get('/dashboard/entregas-por-dia');
  if (!data) return;

  new Chart(document.getElementById('grafico-dias'), {
    type: 'line',
    data: {
      labels: data.map(d => d.dia),
      datasets: [{
        label: 'Entregas',
        data: data.map(d => d.total),
        borderColor: '#2E75B6',
        backgroundColor: 'rgba(46,117,182,0.1)',
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

async function carregarEntregas() {
  const data = await get('/entregas');
  if (!data) return;

  const tbody = document.getElementById('tabela-entregas');

  if (data.length === 0) {
    tbody.innerHTML = estadoVazio(6, 'Nenhuma entrega cadastrada', 'Cadastre a primeira entrega para ver o painel ganhar vida.', 'vazio');
    return;
  }

  const recentes = data.slice(-10).reverse();
  tbody.innerHTML = recentes.map(e => `
    <tr>
      <td>#${e.id}</td>
      <td>${escapeHtml(e.cliente)}</td>
      <td>${escapeHtml(e.origem)}</td>
      <td>${escapeHtml(e.destino)}</td>
      <td>${badgeStatus(e.status)}</td>
      <td>${formatarDataHora(e.previsao)}</td>
    </tr>
  `).join('');

  calcularFaturamentoMes(data);
}

function calcularFaturamentoMes(entregas) {
  const hoje = new Date();
  const total = entregas
    .filter(e => {
      if (e.status !== 'entregue' || !e.concluido_em) return false;
      const data = new Date(e.concluido_em);
      return data.getMonth() === hoje.getMonth() && data.getFullYear() === hoje.getFullYear();
    })
    .reduce((soma, e) => soma + (parseFloat(e.valor_frete) || 0), 0);

  document.getElementById('faturamento-mes').textContent =
    'R$ ' + total.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

async function carregarTopMotoristas() {
  const data = await get('/dashboard/desempenho-motoristas');
  const container = document.getElementById('top-motoristas');
  if (!container) return;

  const comFaturamento = (data || []).filter(m => m.faturamento > 0);

  if (comFaturamento.length === 0) {
    container.innerHTML = estadoVazio(null, 'Sem dados ainda', 'O ranking aparece assim que houver entregas concluídas com valor de frete.', 'usuario');
    return;
  }

  const top5 = comFaturamento.slice(0, 5);
  const max = Math.max(...top5.map(m => m.faturamento), 1);

  container.innerHTML = top5.map((m, i) => `
    <div class="ranking-item">
      <span class="ranking-pos">${i + 1}º</span>
      <div class="ranking-info">
        <div class="ranking-nome">${escapeHtml(m.motorista || 'Motorista')}</div>
        <div class="ranking-bar-track"><div class="ranking-bar-fill" style="width:${(m.faturamento / max * 100)}%;"></div></div>
      </div>
      <span class="ranking-valor">R$ ${m.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
    </div>
  `).join('');
}

carregarResumo();
carregarGraficoStatus();
carregarGraficoDias();
carregarEntregas();
carregarTopMotoristas();

setInterval(() => {
  carregarResumo();
  carregarEntregas();
  carregarTopMotoristas();
}, 30000);