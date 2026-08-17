checarAuth();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';
aplicarMascaraMoeda(document.getElementById('custo'));

let manutencoes = [];
let manutencaoEditandoId = null;

async function carregarManutencoes() {
  manutencoes = await get('/manutencoes') || [];
  renderizar(manutencoes);
  atualizarCards(manutencoes);
}

async function carregarVeiculos() {
  const data = await get('/veiculos') || [];
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
}

function renderizar(lista) {
  const tbody = document.getElementById('tabela-manutencoes');

  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#888;">Nenhuma manutenção registrada</td></tr>';
    return;
  }

  const tipoLabel = { preventiva: 'Preventiva', corretiva: 'Corretiva', revisao: 'Revisão', pneus: 'Pneus', eletrica: 'Elétrica', freios: 'Freios', outro: 'Outro' };
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
      <td>${m.veiculo ? `<strong>${m.veiculo.placa}</strong><br><small>${m.veiculo.modelo} ${m.veiculo.marca}</small>` : '—'}</td>
      <td>${formatarData(m.data_manutencao)}${m.data_fim ? ' → ' + formatarData(m.data_fim) : ''}</td>
      <td><span class="badge badge-tipo-${tipoBadge[m.tipo] || 7}">${tipoLabel[m.tipo] || m.tipo}</span></td>
      <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.descricao}</td>
      <td>${m.mecanico || '—'}</td>
      <td>${m.quilometragem ? m.quilometragem.toLocaleString('pt-BR') + ' km' : '—'}</td>
      <td>${m.custo ? 'R$ ' + parseFloat(m.custo).toLocaleString('pt-BR', {minimumFractionDigits:2}) : '—'}</td>
      <td><span class="badge ${statusBadge[m.status]}">${statusLabel[m.status] || m.status}</span></td>
      <td>${m.proxima_revisao ? formatarData(m.proxima_revisao) : '—'}</td>
      <td style="display:flex;gap:6px;">
        <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;" onclick="editarManutencao(${m.id})" aria-label="Editar">${svgIcone('editar', 14)}</button>
        <button class="btn btn-danger" style="font-size:11px;padding:4px 10px;" onclick="excluirManutencao(${m.id})" aria-label="Excluir">${svgIcone('excluir', 14)}</button>
      </td>
    </tr>
  `).join('');
}

function filtrar() {
  const tipo = document.getElementById('filtro-tipo').value;
  const status = document.getElementById('filtro-status').value;
  const veiculo = document.getElementById('filtro-veiculo').value.toLowerCase();

  const filtradas = manutencoes.filter(m => {
    const placaModelo = m.veiculo ? `${m.veiculo.placa} ${m.veiculo.modelo} ${m.veiculo.marca}`.toLowerCase() : '';
    return (!tipo || m.tipo === tipo) &&
           (!status || m.status === status) &&
           (!veiculo || placaModelo.includes(veiculo));
  });

  renderizar(filtradas);
  atualizarCards(filtradas);
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
    toastErro('Erro: ' + res.detail);
    return;
  }

  fecharModal();
  carregarManutencoes();
}

async function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.setTextColor(30, 77, 120);
  doc.text('LogTrack — Relatório de Manutenções', 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);

  const linhas = manutencoes.map(m => [
    `#${m.id}`,
    m.veiculo ? `${m.veiculo.placa} — ${m.veiculo.modelo}` : '—',
    formatarData(m.data_manutencao),
    m.tipo,
    m.mecanico || '—',
    m.quilometragem ? m.quilometragem.toLocaleString('pt-BR') + ' km' : '—',
    m.custo ? 'R$ ' + parseFloat(m.custo).toLocaleString('pt-BR', {minimumFractionDigits:2}) : '—',
    m.status,
  ]);

  doc.autoTable({
    startY: 35,
    head: [['#', 'Veículo', 'Data', 'Tipo', 'Mecânico', 'KM', 'Custo', 'Status']],
    body: linhas,
    headStyles: { fillColor: [30, 77, 120], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [240, 244, 250] },
    margin: { left: 14, right: 14 }
  });

  doc.save(`logtrack-manutencoes-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`);
}

carregarManutencoes();
carregarVeiculos();