checarAuth();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';
aplicarMascaraMoeda(document.getElementById('valor-frete'));
document.querySelectorAll('#cards-resumo-entregas .card-icon').forEach(el => {
  el.innerHTML = svgIcone(el.dataset.icone, 21);
});

let entregas = [];
let entregaIdSelecionada = null;
let entregaEditandoId = null;
let veiculosCompletos = [];
let motoristasCompletos = [];
let mapaConjuntoPorMotorista = {};
let mapaMotoristasEmRota = {};
let mapaVeiculosEmRota = {};
let mapaVeiculosEmManutencao = {};

async function carregarManutencoesAtivas() {
  const manutencoes = await get('/manutencoes') || [];
  mapaVeiculosEmManutencao = {};
  manutencoes.filter(m => m.status !== 'concluida').forEach(m => {
    mapaVeiculosEmManutencao[m.veiculo_id] = m.tipo;
  });
}

function calcularEmRota(excluirEntregaId) {
  mapaMotoristasEmRota = {};
  mapaVeiculosEmRota = {};
  entregas.forEach(e => {
    if (e.status !== 'em_rota' || e.id === excluirEntregaId) return;
    if (e.motorista_id) mapaMotoristasEmRota[e.motorista_id] = e.cliente;
    if (e.veiculo_id) mapaVeiculosEmRota[e.veiculo_id] = e.cliente;
  });
}

function atualizarDisponibilidadeMotoristas() {
  const sel = document.getElementById('motorista-id');
  [...sel.options].forEach(opt => {
    if (!opt.value) return;
    const m = motoristasCompletos.find(m => String(m.id) === opt.value);
    const nomeBase = m ? (m.nome || `Motorista #${m.id}`) : opt.textContent;
    const emRota = mapaMotoristasEmRota[opt.value];
    /* Mesmo que o motorista esteja livre, o veículo do conjunto dele pode não estar —
       e como o vínculo trava a escolha de veículo, selecioná-lo levaria a um erro ao salvar. */
    const vinculo = mapaConjuntoPorMotorista[opt.value];
    const veiculoEmRota = vinculo && mapaVeiculosEmRota[vinculo.veiculoId];
    const veiculoEmManutencao = vinculo && mapaVeiculosEmManutencao[vinculo.veiculoId];

    if (emRota) {
      opt.textContent = `${nomeBase} (em rota — ${emRota})`;
      opt.disabled = true;
    } else if (veiculoEmRota) {
      opt.textContent = `${nomeBase} (veículo em rota — ${veiculoEmRota})`;
      opt.disabled = true;
    } else if (veiculoEmManutencao) {
      opt.textContent = `${nomeBase} (veículo em manutenção — ${veiculoEmManutencao})`;
      opt.disabled = true;
    } else {
      opt.textContent = nomeBase;
      opt.disabled = false;
    }
  });
}

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
    const emRota = mapaVeiculosEmRota[v.id];
    const emManutencao = mapaVeiculosEmManutencao[v.id];
    if (emRota) {
      opt.textContent = `${v.placa} — ${v.modelo} (em rota — ${emRota})`;
      opt.disabled = true;
    } else if (emManutencao) {
      opt.textContent = `${v.placa} — ${v.modelo} (em manutenção — ${emManutencao})`;
      opt.disabled = true;
    } else {
      opt.textContent = `${v.placa} — ${v.modelo}`;
    }
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
    const bloqueio = mapaVeiculosEmRota[vinculo.veiculoId]
      ? `está em rota (entrega para ${escapeHtml(mapaVeiculosEmRota[vinculo.veiculoId])})`
      : mapaVeiculosEmManutencao[vinculo.veiculoId]
        ? `está em manutenção (${escapeHtml(mapaVeiculosEmManutencao[vinculo.veiculoId])})`
        : null;
    if (info) {
      info.innerHTML = bloqueio
        ? `${svgIcone('alerta', 12)} Vinculado ao conjunto "${escapeHtml(vinculo.conjuntoNome)}", mas o veículo ${bloqueio} — não vai ser possível salvar até resolver isso.`
        : `${svgIcone('link', 12)} Vinculado ao conjunto "${escapeHtml(vinculo.conjuntoNome)}". Para trocar o veículo, altere o conjunto na aba Conjuntos.`;
    }
  } else {
    preencherOpcoesVeiculo(veiculosCompletos);
    selVeiculo.disabled = false;
    if (info) info.textContent = '';
  }
}

const STATUS_LISTA = ['aguardando', 'em_rota', 'entregue', 'atrasado', 'ocorrencia', 'cancelado'];

function veiculoLabel(veiculoId) {
  if (!veiculoId) return null;
  const v = veiculosCompletos.find(v => v.id === veiculoId);
  return v ? `${escapeHtml(v.placa)} — ${escapeHtml(v.modelo)}` : `Veículo #${veiculoId}`;
}

function motoristaLabel(motoristaId) {
  if (!motoristaId) return null;
  const m = motoristasCompletos.find(m => m.id === motoristaId);
  return m ? escapeHtml(m.nome) : `Motorista #${motoristaId}`;
}

function celulaAtribuicao(label, pendenteRelevante) {
  if (label) return label;
  return pendenteRelevante ? '<span class="badge badge-pendente">A definir</span>' : '—';
}

function atualizarResumo(lista) {
  STATUS_LISTA.forEach(status => {
    const el = document.getElementById(`resumo-${status}`);
    if (el) el.textContent = lista.filter(e => e.status === status).length;
  });
}

function renderizarTabela(lista) {
  const tbody = document.getElementById('tabela-entregas');

  if (lista.length === 0) {
    tbody.innerHTML = estadoVazio(9, 'Nenhuma entrega encontrada', 'Ajuste os filtros ou cadastre uma nova entrega para começar.', 'vazio');
    return;
  }

  const ordenada = [...lista].sort((a, b) => new Date(b.previsao) - new Date(a.previsao));
  const ehMotorista = localStorage.getItem('perfil') === 'motorista';

  tbody.innerHTML = ordenada.map(e => `
    <tr>
      <td>#${e.id}</td>
      <td>${escapeHtml(e.cliente)}</td>
      <td>${escapeHtml(e.origem)} → ${escapeHtml(e.destino)}</td>
      <td>${celulaAtribuicao(motoristaLabel(e.motorista_id), e.status === 'aguardando')}</td>
      <td>${celulaAtribuicao(veiculoLabel(e.veiculo_id), e.status === 'aguardando')}</td>
      <td>${formatarDataHora(e.previsao)}</td>
      <td>${e.valor_frete != null ? 'R$ ' + parseFloat(e.valor_frete).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}</td>
      <td>${badgeStatus(e.status)}</td>
      <td style="display:flex;gap:6px;">
        ${ehMotorista ? '' : `<button class="btn btn-outline" style="font-size:11px;padding:4px 10px;" onclick="abrirModal(${e.id})">${svgIcone('editar', 12)} Editar</button>`}
        <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;" onclick="abrirModalStatus(${e.id})">Status</button>
      </td>
    </tr>
  `).join('');
}

function filtrar() {
  const cliente = document.getElementById('filtro-cliente').value.toLowerCase();
  const inicio = document.getElementById('filtro-data-inicio').value;
  const fim = document.getElementById('filtro-data-fim').value;
  const status = document.getElementById('filtro-status').value;
  const veiculoId = document.getElementById('filtro-veiculo').value;
  const motoristaId = document.getElementById('filtro-motorista').value;

  const filtradas = entregas.filter(e => {
    if (cliente && !e.cliente.toLowerCase().includes(cliente)) return false;
    if (inicio && new Date(e.previsao) < new Date(inicio)) return false;
    if (fim && new Date(e.previsao) > new Date(fim + 'T23:59:59')) return false;
    if (status && e.status !== status) return false;
    if (veiculoId && String(e.veiculo_id) !== veiculoId) return false;
    if (motoristaId && String(e.motorista_id) !== motoristaId) return false;
    return true;
  });

  atualizarResumo(filtradas);
  renderizarTabela(filtradas);
}

function limparFiltros() {
  document.getElementById('filtro-cliente').value = '';
  document.getElementById('filtro-data-inicio').value = '';
  document.getElementById('filtro-data-fim').value = '';
  document.getElementById('filtro-status').value = '';
  document.getElementById('filtro-veiculo').value = '';
  document.getElementById('filtro-motorista').value = '';
  filtrar();
}

function abrirModal(id) {
  entregaEditandoId = id || null;
  calcularEmRota(entregaEditandoId);

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
  atualizarDisponibilidadeMotoristas();
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
  const res = await fetch(`${API}/entregas/${entregaIdSelecionada}/status?status=${status}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
  const corpo = await res.json();
  if (!res.ok) {
    toastErro('Erro: ' + extrairErro(corpo));
    return;
  }
  fecharModalStatus();
  carregarEntregas();
}

async function iniciar() {
  definirPeriodoPadrao();
  /* Motorista só vê as próprias entregas; cadastros de veículo/motorista/conjunto
     ficam bloqueados pra esse perfil, então nem tenta carregar (e nem precisa). */
  if (localStorage.getItem('perfil') !== 'motorista') {
    await Promise.all([carregarVeiculos(), carregarMotoristas(), carregarConjuntosMotoristas(), carregarManutencoesAtivas()]);
  }
  carregarEntregas();
}
iniciar();