checarAuth();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';

let todasEntregas = [];
let graficoStatus = null;
let graficoMotoristas = null;

async function carregarDados() {
  todasEntregas = await get('/entregas') || [];
  renderizar(todasEntregas);
  carregarGraficos(todasEntregas);
}

function renderizar(lista) {
  const tbody = document.getElementById('tabela-body');
  document.getElementById('total-label').textContent = `${lista.length} registro(s)`;

  document.getElementById('total-entregas').textContent = lista.length;
  document.getElementById('total-entregues').textContent = lista.filter(e => e.status === 'entregue').length;
  document.getElementById('total-atrasadas').textContent = lista.filter(e => e.status === 'atrasado').length;
  document.getElementById('total-ocorrencias').textContent = lista.filter(e => e.status === 'ocorrencia').length;

  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;">Nenhuma entrega encontrada</td></tr>';
    return;
  }

  tbody.innerHTML = lista.map(e => `
    <tr>
      <td>#${e.id}</td>
      <td>${e.cliente}</td>
      <td>${e.origem}</td>
      <td>${e.destino}</td>
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

  const labels = Object.keys(statusCount).map(s => ({
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
        backgroundColor: ['#2E75B6','#27AE60','#1E4D78','#C0392B','#E67E22','#95A5A6'],
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

  doc.save(`logtrack-relatorio-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`);
}

carregarDados();