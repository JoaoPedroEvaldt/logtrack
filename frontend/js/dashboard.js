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
        backgroundColor: ['#2E75B6','#1E4D78','#27AE60','#C0392B','#E67E22','#95A5A6'],
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
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;">Nenhuma entrega cadastrada</td></tr>';
    return;
  }

  const recentes = data.slice(-10).reverse();
  tbody.innerHTML = recentes.map(e => `
    <tr>
      <td>#${e.id}</td>
      <td>${e.cliente}</td>
      <td>${e.origem}</td>
      <td>${e.destino}</td>
      <td>${badgeStatus(e.status)}</td>
      <td>${formatarDataHora(e.previsao)}</td>
    </tr>
  `).join('');
}

carregarResumo();
carregarGraficoStatus();
carregarGraficoDias();
carregarEntregas();

setInterval(() => {
  carregarResumo();
  carregarEntregas();
}, 30000);