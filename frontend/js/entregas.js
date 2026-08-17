checarAuth();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';
aplicarMascaraMoeda(document.getElementById('valor-frete'));

let entregas = [];
let entregaIdSelecionada = null;
let entregaEditandoId = null;
let veiculosCompletos = [];
let motoristasCompletos = [];
let mapaConjuntoPorMotorista = {};

async function carregarEntregas() {
  entregas = await get('/entregas') || [];
  filtrar();
}

async function carregarMotoristas() {
  motoristasCompletos = await get('/motoristas') || [];

  const sel = document.getElementById('motorista-id');
  const selFiltro = document.getElementById('filtro-motorista');
  motoristasCompletos.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.nome || `Motorista #${m.id}`;
    sel.appendChild(opt);

    const optFiltro = opt.cloneNode(true);
    selFiltro.appendChild(optFiltro);
  });
}

async function carregarVeiculos() {
  veiculosCompletos = await get('/veiculos') || [];
  preencherOpcoesVeiculo(veiculosCompletos);

  const selFiltro = document.getElementById('filtro-veiculo');
  veiculosCompletos.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = `${v.placa} — ${v.modelo}`;
    selFiltro.appendChild(opt);
  });
}

function definirPeriodoPadrao() {
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  document.getElementById('filtro-data-inicio').value = inicioMes.toISOString().slice(0, 10);
  document.getElementById('filtro-data-fim').value = fimMes.toISOString().slice(0, 10);
}

function preencherOpcoesVeiculo(lista) {
  const sel = document.getElementById('veiculo-id');
  const valorAtual = sel.value;
  sel.innerHTML = '<option value="">Selecionar veículo</option>';
  lista.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = `${v.placa} — ${v.modelo}`;
    sel.appendChild(opt);
  });
  if (lista.some(v => String(v.id) === valorAtual)) {
    sel.value = valorAtual;
  }
}

async function carregarConjuntosMotoristas() {
  const conjuntos = await get('/conjuntos') || [];
  mapaConjuntoPorMotorista = {};
  conjuntos.forEach(c => {
    if (c.motorista_id && c.cavalo_id) {
      mapaConjuntoPorMotorista[c.motorista_id] = {
        veiculoId: c.cavalo_id,
        conjuntoNome: c.nome
      };
    }
  });
}

function atualizarVeiculoPorMotorista() {
  const motoristaId = document.getElementById('motorista-id').value;
  const selVeiculo = document.getElementById('veiculo-id');
  const info = document.getElementById('conjunto-info');
  const vinculo = mapaConjuntoPorMotorista[motoristaId];

  if (vinculo) {
    preencherOpcoesVeiculo(veiculosCompletos.filter(v => v.id === vinculo.veiculoId));
    selVeiculo.value = vinculo.veiculoId;
    selVeiculo.disabled = true;
    if (info) info.innerHTML = `${svgIcone('link', 12)} Vinculado ao conjunto "${vinculo.conjuntoNome}". Para trocar o veículo, altere o conjunto na aba Conjuntos.`;
  } else {
    preencherOpcoesVeiculo(veiculosCompletos);
    selVeiculo.disabled = false;
    if (info) info.textContent = '';
  }
}

const COLUNAS_STATUS = [
  { status: 'aguardando', label: 'Aguardando' },
  { status: 'em_rota', label: 'Em Rota' },
  { status: 'entregue', label: 'Entregue' },
  { status: 'atrasado', label: 'Atrasado' },
  { status: 'ocorrencia', label: 'Ocorrência' },
  { status: 'cancelado', label: 'Cancelado' },
];

function veiculoLabel(veiculoId) {
  if (!veiculoId) return null;
  const v = veiculosCompletos.find(v => v.id === veiculoId);
  return v ? `${v.placa} — ${v.modelo}` : `Veículo #${veiculoId}`;
}

function renderizarKanban(lista) {
  const board = document.getElementById('kanban-board');

  if (lista.length === 0) {
    board.innerHTML = '<div style="text-align:center;color:#888;padding:40px;width:100%;">Nenhuma entrega encontrada</div>';
    return;
  }

  board.innerHTML = COLUNAS_STATUS.map(col => {
    const itens = lista.filter(e => e.status === col.status);
    return `
      <div class="kanban-column">
        <div class="kanban-column-header">
          <span>${col.label}</span>
          <span class="badge badge-${col.status}">${itens.length}</span>
        </div>
        <div class="kanban-cards">
          ${itens.length === 0
            ? '<div style="text-align:center;color:var(--text-light);font-size:12px;padding:12px;">Vazio</div>'
            : itens.map(e => `
              <div class="kanban-card kanban-card-${col.status}">
                <div style="font-weight:600;color:var(--text);font-size:13px;">#${e.id} ${e.cliente}</div>
                <div style="font-size:12px;color:var(--text-light);margin-top:4px;display:flex;align-items:center;gap:5px;">${svgIcone('local', 13)} ${e.destino}</div>
                <div style="font-size:12px;color:var(--text-light);margin-top:2px;display:flex;align-items:center;gap:5px;">${svgIcone('relogio', 13)} ${formatarDataHora(e.previsao)}</div>
                <div style="font-size:12px;color:var(--text-light);margin-top:2px;display:flex;align-items:center;gap:5px;">${svgIcone('caminhao', 13)} ${veiculoLabel(e.veiculo_id) || 'Sem veículo definido'}</div>
                ${e.valor_frete ? `<div style="font-size:12px;color:var(--text-light);margin-top:2px;display:flex;align-items:center;gap:5px;">${svgIcone('dinheiro', 13)} R$ ${parseFloat(e.valor_frete).toLocaleString('pt-BR', {minimumFractionDigits:2})}</div>` : ''}
                <div style="display:flex;gap:6px;margin-top:10px;">
                  <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;flex:1;" onclick="abrirModal(${e.id})">
                    ${svgIcone('editar', 12)} Editar
                  </button>
                  <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;flex:1;" onclick="abrirModalStatus(${e.id})">
                    Status
                  </button>
                </div>
              </div>
            `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function filtrar() {
  const cliente = document.getElementById('filtro-cliente').value.toLowerCase();
  const inicio = document.getElementById('filtro-data-inicio').value;
  const fim = document.getElementById('filtro-data-fim').value;
  const veiculoId = document.getElementById('filtro-veiculo').value;
  const motoristaId = document.getElementById('filtro-motorista').value;

  const filtradas = entregas.filter(e => {
    if (cliente && !e.cliente.toLowerCase().includes(cliente)) return false;
    if (inicio && new Date(e.previsao) < new Date(inicio)) return false;
    if (fim && new Date(e.previsao) > new Date(fim + 'T23:59:59')) return false;
    if (veiculoId && String(e.veiculo_id) !== veiculoId) return false;
    if (motoristaId && String(e.motorista_id) !== motoristaId) return false;
    return true;
  });

  renderizarKanban(filtradas);
}

function limparFiltros() {
  document.getElementById('filtro-cliente').value = '';
  document.getElementById('filtro-data-inicio').value = '';
  document.getElementById('filtro-data-fim').value = '';
  document.getElementById('filtro-veiculo').value = '';
  document.getElementById('filtro-motorista').value = '';
  filtrar();
}

function abrirModal(id) {
  entregaEditandoId = id || null;

  document.getElementById('cliente').value = '';
  document.getElementById('origem').value = '';
  document.getElementById('destino').value = '';
  document.getElementById('peso').value = '';
  document.getElementById('valor-frete').value = '';
  document.getElementById('previsao').value = '';
  document.getElementById('descricao').value = '';
  document.getElementById('motorista-id').value = '';
  preencherOpcoesVeiculo(veiculosCompletos);
  document.getElementById('veiculo-id').value = '';
  document.getElementById('veiculo-id').disabled = false;
  const info = document.getElementById('conjunto-info');
  if (info) info.textContent = '';

  const entrega = entregaEditandoId ? entregas.find(e => e.id === entregaEditandoId) : null;

  document.getElementById('modal-titulo').textContent = entrega ? 'Editar Entrega' : 'Nova Entrega';

  if (entrega) {
    document.getElementById('cliente').value = entrega.cliente;
    document.getElementById('origem').value = entrega.origem;
    document.getElementById('destino').value = entrega.destino;
    document.getElementById('peso').value = entrega.peso_kg || '';
    document.getElementById('valor-frete').value = numeroParaMoeda(entrega.valor_frete);
    document.getElementById('previsao').value = entrega.previsao ? entrega.previsao.slice(0, 16) : '';
    document.getElementById('descricao').value = entrega.descricao_carga || '';
    document.getElementById('motorista-id').value = entrega.motorista_id || '';
    atualizarVeiculoPorMotorista();
    if (!mapaConjuntoPorMotorista[entrega.motorista_id]) {
      document.getElementById('veiculo-id').value = entrega.veiculo_id || '';
    }
  }

  document.getElementById('modal').classList.add('aberto');
}

function fecharModal() {
  document.getElementById('modal').classList.remove('aberto');
  entregaEditandoId = null;
}

function abrirModalStatus(id) {
  entregaIdSelecionada = id;
  document.getElementById('modal-status').classList.add('aberto');
}

function fecharModalStatus() {
  document.getElementById('modal-status').classList.remove('aberto');
  entregaIdSelecionada = null;
}

async function salvarEntrega() {
  const dados = {
    cliente: document.getElementById('cliente').value,
    origem: document.getElementById('origem').value,
    destino: document.getElementById('destino').value,
    previsao: document.getElementById('previsao').value,
    descricao_carga: document.getElementById('descricao').value || null,
    peso_kg: parseFloat(document.getElementById('peso').value) || null,
    valor_frete: moedaParaNumero(document.getElementById('valor-frete').value),
    motorista_id: parseInt(document.getElementById('motorista-id').value) || null,
    veiculo_id: parseInt(document.getElementById('veiculo-id').value) || null,
  };

  if (!dados.cliente || !dados.origem || !dados.destino || !dados.previsao) {
    toastAviso('Preencha todos os campos obrigatórios!');
    return;
  }

  const res = entregaEditandoId
    ? await put(`/entregas/${entregaEditandoId}`, dados)
    : await post('/entregas', dados);

  if (res && res.detail) {
    toastErro('Erro: ' + res.detail);
    return;
  }

  fecharModal();
  carregarEntregas();
}

async function confirmarStatus() {
  const status = document.getElementById('novo-status').value;
  await fetch(`http://127.0.0.1:8000/entregas/${entregaIdSelecionada}/status?status=${status}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
  });
  fecharModalStatus();
  carregarEntregas();
}

async function iniciar() {
  definirPeriodoPadrao();
  await Promise.all([carregarVeiculos(), carregarMotoristas(), carregarConjuntosMotoristas()]);
  carregarEntregas();
}
iniciar();