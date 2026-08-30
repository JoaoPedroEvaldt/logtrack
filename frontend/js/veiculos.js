checarAuth();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';

let veiculoEditandoId = null;
let veiculosCarregados = [];

function atualizarSubtipo() {
  const tipo = document.getElementById('tipo').value;
  const grupoSubtipo = document.getElementById('grupo-subtipo');
  const grupoEixos = document.getElementById('grupo-eixos');
  const grupoTipoEixo = document.getElementById('grupo-tipo-eixo');

  if (tipo === 'semirreboque') {
    grupoSubtipo.style.display = 'block';
    grupoEixos.style.display = 'block';
  } else {
    grupoSubtipo.style.display = 'none';
    grupoEixos.style.display = 'none';
    grupoTipoEixo.style.display = 'none';
  }
}

function atualizarTipoEixo() {
  const eixos = document.getElementById('eixos').value;
  const grupoTipoEixo = document.getElementById('grupo-tipo-eixo');
  grupoTipoEixo.style.display = eixos === '3' ? 'block' : 'none';
}

function diasParaVencer(dataStr) {
  if (!dataStr) return null;
  const validade = new Date(dataStr);
  const hoje = new Date();
  return Math.ceil((validade - hoje) / (1000 * 60 * 60 * 24));
}

let veiculosEmRota = new Set();
let veiculosEmManutencao = new Set();

/* O cadastro de veículo só guarda "disponivel"/"inativo" — "em uso" e "manutenção"
   não são campos salvos, são derivados de ter (ou não) uma entrega/manutenção ativa agora. */
function statusEfetivoVeiculo(v) {
  if (veiculosEmManutencao.has(v.id)) return 'em_manutencao';
  if (veiculosEmRota.has(v.id)) return 'em_rota';
  return v.status;
}

async function carregarVeiculos() {
  const [veiculos, entregas, manutencoes] = await Promise.all([get('/veiculos'), get('/entregas'), get('/manutencoes')]);
  veiculosCarregados = veiculos || [];
  veiculosEmRota = new Set((entregas || []).filter(e => e.status === 'em_rota' && e.veiculo_id).map(e => e.veiculo_id));
  veiculosEmManutencao = new Set((manutencoes || []).filter(m => m.status !== 'concluida').map(m => m.veiculo_id));
  filtrarVeiculos();
}

function filtrarVeiculos() {
  const busca = document.getElementById('busca-veiculo').value.toLowerCase();
  const tipo = document.getElementById('filtro-tipo-veiculo').value;
  const status = document.getElementById('filtro-status-veiculo').value;

  const filtrados = veiculosCarregados.filter(v => {
    if (tipo && v.tipo !== tipo) return false;
    if (status && statusEfetivoVeiculo(v) !== status) return false;
    if (busca && !`${v.placa} ${v.modelo} ${v.marca}`.toLowerCase().includes(busca)) return false;
    return true;
  });

  renderizarVeiculos(filtrados);
}

function renderizarVeiculos(data) {
  const grid = document.getElementById('grid-veiculos');

  if (data.length === 0) {
    grid.innerHTML = estadoVazio(null, 'Nenhum veículo encontrado', 'Ajuste a busca ou clique em "Novo Veículo" para adicionar.', 'caminhao');
    return;
  }

  const statusBadge = {
    disponivel: 'entregue',
    em_rota: 'em_rota',
    em_manutencao: 'atrasado',
    inativo: 'cancelado'
  };

  const statusLabel = {
    disponivel: 'Disponível',
    em_rota: 'Em uso',
    em_manutencao: 'Manutenção',
    inativo: 'Inativo'
  };

  const tipoLabel = {
    cavalo: 'Cavalo-mecânico',
    semirreboque: 'Semirreboque'
  };

  grid.innerHTML = data.map(v => {
    const detalhes = [
      v.subtipo,
      v.eixos ? `${v.eixos} eixos${v.tipo_eixo ? ' (' + v.tipo_eixo.toUpperCase() + ')' : ''}` : null
    ].filter(Boolean).join(' · ');

    const diasCrlv = diasParaVencer(v.crlv_validade);
    const diasSeguro = diasParaVencer(v.seguro_validade);
    const alertaDocs = (diasCrlv !== null && diasCrlv <= 30) || (diasSeguro !== null && diasSeguro <= 30);
    const iconeAlerta = alertaDocs ? `<span style="color:var(--warning);display:inline-flex;vertical-align:-3px;margin-right:3px;" title="CRLV ou seguro vencendo">${svgIcone('alerta', 13)}</span>` : '';

    return `
      <div class="vehicle-card">
        <div class="vehicle-topo">
          <span class="vehicle-tipo-pill">${tipoLabel[v.tipo] || escapeHtml(v.tipo)}</span>
          <span class="badge badge-${statusBadge[statusEfetivoVeiculo(v)] || 'aguardando'}">${statusLabel[statusEfetivoVeiculo(v)] || escapeHtml(v.status)}</span>
        </div>
        <div class="vehicle-imagem">${svgIcone('caminhao', 34)}</div>
        <div class="vehicle-placa">${iconeAlerta}${escapeHtml(v.placa)}</div>
        <div class="vehicle-modelo">${escapeHtml(v.marca)} ${escapeHtml(v.modelo)} · ${v.ano}</div>
        ${detalhes ? `<div class="vehicle-modelo">${escapeHtml(detalhes)}</div>` : ''}
        <div class="vehicle-modelo">${v.capacidade_kg} kg</div>
        <div class="vehicle-acoes">
          <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;" onclick="editarVeiculo(${v.id})">${svgIcone('editar', 12)} Editar</button>
          <button class="btn btn-danger" style="font-size:11px;padding:4px 10px;" onclick="excluirVeiculo(${v.id})">${svgIcone('excluir', 12)} Excluir</button>
        </div>
      </div>
    `;
  }).join('');
}

function abrirModal() {
  veiculoEditandoId = null;
  document.getElementById('modal-titulo').textContent = 'Novo Veículo';
  document.getElementById('placa').value = '';
  document.getElementById('modelo').value = '';
  document.getElementById('marca').value = '';
  document.getElementById('ano').value = '';
  document.getElementById('tipo').value = '';
  document.getElementById('subtipo').value = '';
  document.getElementById('eixos').value = '';
  document.getElementById('tipo-eixo').value = '';
  document.getElementById('capacidade').value = '';
  document.getElementById('cor').value = '';
  document.getElementById('crlv-validade').value = '';
  document.getElementById('seguro-validade').value = '';
  document.getElementById('grupo-subtipo').style.display = 'none';
  document.getElementById('grupo-eixos').style.display = 'none';
  document.getElementById('grupo-tipo-eixo').style.display = 'none';
  document.getElementById('modal').classList.add('aberto');
}

function fecharModal() {
  document.getElementById('modal').classList.remove('aberto');
}

function editarVeiculo(id) {
  const v = veiculosCarregados.find(v => v.id === id);
  if (!v) return;
  veiculoEditandoId = id;
  document.getElementById('modal-titulo').textContent = 'Editar Veículo';
  document.getElementById('placa').value = v.placa;
  document.getElementById('modelo').value = v.modelo;
  document.getElementById('marca').value = v.marca;
  document.getElementById('ano').value = v.ano;
  document.getElementById('tipo').value = v.tipo;
  document.getElementById('capacidade').value = v.capacidade_kg;
  document.getElementById('cor').value = v.cor || '';
  document.getElementById('subtipo').value = v.subtipo || '';
  document.getElementById('eixos').value = v.eixos || '';
  document.getElementById('tipo-eixo').value = v.tipo_eixo || '';

  const tipo = v.tipo;
  const eixos = String(v.eixos || '');
  if (tipo === 'semirreboque') {
    document.getElementById('grupo-subtipo').style.display = 'block';
    document.getElementById('grupo-eixos').style.display = 'block';
    document.getElementById('grupo-tipo-eixo').style.display = eixos === '3' ? 'block' : 'none';
  } else {
    document.getElementById('grupo-subtipo').style.display = 'none';
    document.getElementById('grupo-eixos').style.display = 'none';
    document.getElementById('grupo-tipo-eixo').style.display = 'none';
  }

  document.getElementById('modal').classList.add('aberto');
}

async function excluirVeiculo(id) {
  if (!(await confirmarAcao('Deseja desativar este veículo?'))) return;
  await del(`/veiculos/${id}`);
  carregarVeiculos();
}

async function salvarVeiculo() {
  const tipo = document.getElementById('tipo').value;
  const dados = {
    placa: document.getElementById('placa').value,
    modelo: document.getElementById('modelo').value,
    marca: document.getElementById('marca').value,
    ano: parseInt(document.getElementById('ano').value),
    tipo: tipo,
    capacidade_kg: parseFloat(document.getElementById('capacidade').value),
    cor: document.getElementById('cor').value || null,
    subtipo: tipo === 'semirreboque' ? document.getElementById('subtipo').value || null : null,
    eixos: tipo === 'semirreboque' ? parseInt(document.getElementById('eixos').value) || null : null,
    tipo_eixo: tipo === 'semirreboque' && document.getElementById('eixos').value === '3' ? document.getElementById('tipo-eixo').value || null : null,
    crlv_validade: document.getElementById('crlv-validade').value || null,
    seguro_validade: document.getElementById('seguro-validade').value || null,
  };

  if (!dados.placa || !dados.modelo || !dados.marca || !dados.ano || !dados.tipo || !dados.capacidade_kg) {
    toastAviso('Preencha todos os campos obrigatórios!');
    return;
  }

  let res;
  if (veiculoEditandoId) {
    res = await put(`/veiculos/${veiculoEditandoId}`, dados);
  } else {
    res = await post('/veiculos', dados);
  }

  if (res.detail) {
    toastErro('Erro: ' + res.detail);
    return;
  }

  fecharModal();
  carregarVeiculos();
}

carregarVeiculos();