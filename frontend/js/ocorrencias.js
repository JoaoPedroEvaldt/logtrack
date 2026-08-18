checarAuth();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';

let veiculosCompletos = [];
let entregasCompletas = [];
let ocorrenciasCarregadas = [];
let ocorrenciaEditandoId = null;

const TIPOS_OCORRENCIA = {
  atraso: 'Atraso',
  acidente: 'Acidente',
  cliente_ausente: 'Cliente Ausente',
  problema_mecanico: 'Problema Mecânico',
  extravio: 'Extravio',
  outro: 'Outro'
};

function veiculoDaEntrega(entregaId) {
  const entrega = entregasCompletas.find(e => e.id === entregaId);
  if (!entrega) return null;
  return veiculosCompletos.find(v => v.id === entrega.veiculo_id) || null;
}

async function carregarOcorrencias() {
  const data = await get('/ocorrencias') || [];
  ocorrenciasCarregadas = data;
  const tbody = document.getElementById('tabela-ocorrencias');

  if (data.length === 0) {
    tbody.innerHTML = estadoVazio(7, 'Nenhuma ocorrência registrada', 'Ótimo sinal — nenhum problema reportado até agora.', 'check');
    return;
  }

  tbody.innerHTML = data.map(o => {
    const veiculo = veiculoDaEntrega(o.entrega_id);
    return `
    <tr>
      <td>#${o.id}</td>
      <td>${veiculo ? escapeHtml(veiculo.placa) : '—'}</td>
      <td>Entrega #${o.entrega_id}</td>
      <td><span class="badge badge-atrasado">${TIPOS_OCORRENCIA[o.tipo] || escapeHtml(o.tipo)}</span></td>
      <td>${escapeHtml(o.descricao)}</td>
      <td>${formatarDataHora(o.criado_em)}</td>
      <td style="display:flex;gap:6px;">
        <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;" onclick="editarOcorrencia(${o.id})">${svgIcone('editar', 12)} Editar</button>
        <button class="btn btn-danger" style="font-size:11px;padding:4px 10px;" onclick="excluirOcorrencia(${o.id})">${svgIcone('excluir', 12)} Excluir</button>
      </td>
    </tr>
  `;
  }).join('');
}

async function carregarVeiculosEEntregas() {
  [veiculosCompletos, entregasCompletas] = await Promise.all([
    get('/veiculos'),
    get('/entregas')
  ]);
  veiculosCompletos = veiculosCompletos || [];
  entregasCompletas = entregasCompletas || [];

  const selVeiculo = document.getElementById('veiculo-filtro');
  selVeiculo.innerHTML = '<option value="">Selecionar veículo</option>' + veiculosCompletos
    .map(v => `<option value="${v.id}">${escapeHtml(v.placa)} — ${escapeHtml(v.modelo)}</option>`)
    .join('');
}

function atualizarEntregasDoVeiculo() {
  const veiculoId = parseInt(document.getElementById('veiculo-filtro').value) || null;
  const selEntrega = document.getElementById('entrega-id');

  if (!veiculoId) {
    selEntrega.innerHTML = '<option value="">Selecione um veículo primeiro</option>';
    selEntrega.disabled = true;
    return;
  }

  const entregasVeiculo = entregasCompletas
    .filter(e => e.veiculo_id === veiculoId)
    .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));

  if (entregasVeiculo.length === 0) {
    selEntrega.innerHTML = '<option value="">Nenhuma entrega encontrada para este veículo</option>';
    selEntrega.disabled = true;
    return;
  }

  selEntrega.disabled = false;
  selEntrega.innerHTML = entregasVeiculo
    .map(e => `<option value="${e.id}">#${e.id} — ${escapeHtml(e.cliente)} (${escapeHtml(e.status)})</option>`)
    .join('');
}

function abrirModal() {
  ocorrenciaEditandoId = null;
  document.getElementById('modal-titulo').textContent = 'Nova Ocorrência';
  document.getElementById('veiculo-filtro').value = '';
  document.getElementById('veiculo-filtro').disabled = false;
  document.getElementById('entrega-id').innerHTML = '<option value="">Selecione um veículo primeiro</option>';
  document.getElementById('entrega-id').disabled = true;
  document.getElementById('tipo').value = '';
  document.getElementById('descricao').value = '';
  document.getElementById('modal').classList.add('aberto');
}

function editarOcorrencia(id) {
  const o = ocorrenciasCarregadas.find(o => o.id === id);
  if (!o) return;
  const entrega = entregasCompletas.find(e => e.id === o.entrega_id);

  ocorrenciaEditandoId = id;
  document.getElementById('modal-titulo').textContent = 'Editar Ocorrência';

  const selVeiculo = document.getElementById('veiculo-filtro');
  selVeiculo.value = entrega ? entrega.veiculo_id : '';
  atualizarEntregasDoVeiculo();
  document.getElementById('entrega-id').value = o.entrega_id;

  selVeiculo.disabled = true;
  document.getElementById('entrega-id').disabled = true;

  document.getElementById('tipo').value = o.tipo;
  document.getElementById('descricao').value = o.descricao;
  document.getElementById('modal').classList.add('aberto');
}

function fecharModal() {
  document.getElementById('modal').classList.remove('aberto');
}

async function excluirOcorrencia(id) {
  if (!(await confirmarAcao('Deseja excluir esta ocorrência? A entrega associada deixará de ficar marcada como "Ocorrência" caso não haja outra pendente.'))) return;
  await del(`/ocorrencias/${id}`);
  carregarOcorrencias();
}

async function salvarOcorrencia() {
  const tipo = document.getElementById('tipo').value;
  const descricao = document.getElementById('descricao').value;

  if (ocorrenciaEditandoId) {
    if (!tipo || !descricao) {
      toastAviso('Preencha todos os campos obrigatórios!');
      return;
    }
    const res = await put(`/ocorrencias/${ocorrenciaEditandoId}`, { tipo, descricao });
    if (res && res.detail) {
      toastErro('Erro: ' + res.detail);
      return;
    }
    fecharModal();
    carregarOcorrencias();
    return;
  }

  const dados = {
    entrega_id: parseInt(document.getElementById('entrega-id').value),
    tipo,
    descricao,
  };

  if (!document.getElementById('veiculo-filtro').value || !dados.entrega_id || !dados.tipo || !dados.descricao) {
    toastAviso('Preencha todos os campos obrigatórios!');
    return;
  }

  const res = await post('/ocorrencias', dados);

  if (res.detail) {
    toastErro('Erro: ' + res.detail);
    return;
  }

  fecharModal();
  carregarOcorrencias();
}

carregarVeiculosEEntregas().then(carregarOcorrencias);