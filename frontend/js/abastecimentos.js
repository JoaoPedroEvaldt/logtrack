checarAuth();
checarStaff();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';
aplicarMascaraMoeda(document.getElementById('litros'));
aplicarMascaraMoeda(document.getElementById('valor-total'));
document.getElementById('litros').addEventListener('input', () => recalcularValorTotal());

let abastecimentos = [];
let abastecimentoEditandoId = null;
let conjuntosCarregados = [];

const ESTADOS_UF = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
let precosDieselPorUF = null;
let precoDieselAtual = null;

function preencherEstados() {
  const sel = document.getElementById('estado');
  ESTADOS_UF.forEach(uf => {
    const opt = document.createElement('option');
    opt.value = uf;
    opt.textContent = uf;
    sel.appendChild(opt);
  });
}

async function carregarPrecosDiesel() {
  if (precosDieselPorUF) return precosDieselPorUF;
  try {
    const res = await fetch('https://combustivelapi.com.br/api/precos/');
    const data = await res.json();
    precosDieselPorUF = (data.precos && data.precos.diesel) || null;
  } catch (e) {
    precosDieselPorUF = null;
  }
  return precosDieselPorUF;
}

async function atualizarPrecoDiesel(recalcular = true) {
  const uf = document.getElementById('estado').value.toLowerCase();
  const infoEl = document.getElementById('preco-diesel-info');
  precoDieselAtual = null;
  if (!uf) { infoEl.value = ''; return; }

  infoEl.value = 'Buscando preço...';
  const precos = await carregarPrecosDiesel();
  const precoStr = precos ? precos[uf] : null;
  const preco = precoStr ? parseFloat(precoStr.replace(',', '.')) : null;

  if (!preco) {
    infoEl.value = 'Preço indisponível';
    return;
  }

  precoDieselAtual = preco;
  infoEl.value = `R$ ${preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / L`;
  if (recalcular) recalcularValorTotal();
}

function recalcularValorTotal() {
  if (!precoDieselAtual) return;
  const litros = moedaParaNumero(document.getElementById('litros').value);
  if (!litros) return;
  document.getElementById('valor-total').value = numeroParaMoeda(litros * precoDieselAtual);
}

function definirPeriodoPadrao() {
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  document.getElementById('filtro-data-inicio').value = inicioMes.toISOString().slice(0, 10);
  document.getElementById('filtro-data-fim').value = fimMes.toISOString().slice(0, 10);
}

async function carregarAbastecimentos() {
  abastecimentos = await get('/abastecimentos') || [];
  filtrar();
}

async function carregarVeiculos() {
  const data = await get('/veiculos') || [];
  const selects = [document.getElementById('veiculo-id'), document.getElementById('filtro-veiculo')];
  selects.forEach(sel => {
    while (sel.options.length > 1) sel.remove(1);
    data
      .filter(v => v.tipo !== 'semirreboque')
      .forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = `${v.placa} — ${v.modelo} ${v.marca}`;
        sel.appendChild(opt);
      });
  });
}

async function carregarMotoristas() {
  const data = await get('/motoristas') || [];
  const sel = document.getElementById('motorista-id');
  while (sel.options.length > 1) sel.remove(1);
  data.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.nome;
    sel.appendChild(opt);
  });
}

async function carregarConjuntos() {
  conjuntosCarregados = await get('/conjuntos') || [];
}

function vincularPorMotorista() {
  const motoristaId = parseInt(document.getElementById('motorista-id').value) || null;
  if (!motoristaId) return;
  const conjunto = conjuntosCarregados.find(c => c.motorista_id === motoristaId && c.cavalo_id);
  if (conjunto) document.getElementById('veiculo-id').value = conjunto.cavalo_id;
}

function vincularPorVeiculo() {
  const veiculoId = parseInt(document.getElementById('veiculo-id').value) || null;
  if (!veiculoId) return;
  const conjunto = conjuntosCarregados.find(c => c.cavalo_id === veiculoId && c.motorista_id);
  if (conjunto) document.getElementById('motorista-id').value = conjunto.motorista_id;
}

function atualizarCards(lista) {
  document.getElementById('total-abastecimentos').textContent = lista.length;
  const litros = lista.reduce((s, a) => s + (parseFloat(a.litros) || 0), 0);
  const custo = lista.reduce((s, a) => s + (parseFloat(a.valor_total) || 0), 0);
  document.getElementById('total-litros').textContent = litros.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) + ' L';
  document.getElementById('total-custo').textContent = 'R$ ' + custo.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function renderizar(lista) {
  const tbody = document.getElementById('tabela-abastecimentos');

  if (lista.length === 0) {
    tbody.innerHTML = estadoVazio(9, 'Nenhum abastecimento registrado', 'O histórico de abastecimentos da frota aparecerá aqui.', 'usuario');
    return;
  }

  tbody.innerHTML = lista.map(a => `
    <tr>
      <td>#${a.id}</td>
      <td>${a.veiculo ? `<strong>${escapeHtml(a.veiculo.placa)}</strong><br><small>${escapeHtml(a.veiculo.modelo)} ${escapeHtml(a.veiculo.marca)}</small>` : '—'}</td>
      <td>${a.motorista ? escapeHtml(a.motorista.nome) : '—'}</td>
      <td>${formatarData(a.data_abastecimento)}</td>
      <td>${parseFloat(a.litros).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L</td>
      <td>${a.quilometragem != null ? a.quilometragem.toLocaleString('pt-BR') + ' km' : '—'}</td>
      <td>${escapeHtml(a.posto) || '—'}</td>
      <td>R$ ${parseFloat(a.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
      <td style="display:flex;gap:6px;">
        <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;" onclick="editarAbastecimento(${a.id})">${svgIcone('editar', 12)} Editar</button>
        <button class="btn btn-danger" style="font-size:11px;padding:4px 10px;" onclick="excluirAbastecimento(${a.id})">${svgIcone('excluir', 12)} Excluir</button>
      </td>
    </tr>
  `).join('');
}

function descreverPeriodoAtivo(inicio, fim) {
  const el = document.getElementById('periodo-resumo');
  if (!el) return;
  if (!inicio && !fim) {
    el.textContent = 'Mostrando todo o histórico (sem filtro de data)';
  } else {
    el.textContent = `Período: ${inicio ? formatarData(inicio) : 'início'} até ${fim ? formatarData(fim) : 'hoje'}`;
  }
}

function filtrar() {
  const veiculoId = document.getElementById('filtro-veiculo').value;
  const inicio = document.getElementById('filtro-data-inicio').value;
  const fim = document.getElementById('filtro-data-fim').value;
  descreverPeriodoAtivo(inicio, fim);

  const filtrados = abastecimentos.filter(a => {
    if (veiculoId && String(a.veiculo_id) !== veiculoId) return false;
    if (inicio && a.data_abastecimento < inicio) return false;
    if (fim && a.data_abastecimento > fim) return false;
    return true;
  });

  atualizarCards(filtrados);
  renderizar(filtrados);
}

function limparFiltros() {
  document.getElementById('filtro-veiculo').value = '';
  document.getElementById('filtro-data-inicio').value = '';
  document.getElementById('filtro-data-fim').value = '';
  filtrar();
}

function abrirModal() {
  abastecimentoEditandoId = null;
  document.getElementById('modal-titulo').textContent = 'Novo Abastecimento';
  document.getElementById('veiculo-id').value = '';
  document.getElementById('motorista-id').value = '';
  document.getElementById('data-abastecimento').value = '';
  document.getElementById('quilometragem').value = '';
  document.getElementById('estado').value = '';
  document.getElementById('preco-diesel-info').value = '';
  precoDieselAtual = null;
  document.getElementById('litros').value = '';
  document.getElementById('valor-total').value = '';
  document.getElementById('posto').value = '';
  document.getElementById('modal').classList.add('aberto');
}

function fecharModal() {
  document.getElementById('modal').classList.remove('aberto');
}

function editarAbastecimento(id) {
  const a = abastecimentos.find(a => a.id === id);
  if (!a) return;
  abastecimentoEditandoId = id;
  document.getElementById('modal-titulo').textContent = 'Editar Abastecimento';
  document.getElementById('veiculo-id').value = a.veiculo_id;
  document.getElementById('motorista-id').value = a.motorista_id || '';
  document.getElementById('data-abastecimento').value = a.data_abastecimento;
  document.getElementById('quilometragem').value = a.quilometragem || '';
  document.getElementById('estado').value = a.estado || '';
  document.getElementById('preco-diesel-info').value = '';
  precoDieselAtual = null;
  if (a.estado) atualizarPrecoDiesel(false);
  document.getElementById('litros').value = numeroParaMoeda(a.litros);
  document.getElementById('valor-total').value = numeroParaMoeda(a.valor_total);
  document.getElementById('posto').value = a.posto || '';
  document.getElementById('modal').classList.add('aberto');
}

async function excluirAbastecimento(id) {
  if (!(await confirmarAcao('Deseja excluir este abastecimento?'))) return;
  await del(`/abastecimentos/${id}`);
  carregarAbastecimentos();
}

async function salvarAbastecimento() {
  const dados = {
    veiculo_id: parseInt(document.getElementById('veiculo-id').value),
    motorista_id: parseInt(document.getElementById('motorista-id').value) || null,
    data_abastecimento: document.getElementById('data-abastecimento').value,
    quilometragem: parseInt(document.getElementById('quilometragem').value) || null,
    litros: moedaParaNumero(document.getElementById('litros').value),
    valor_total: moedaParaNumero(document.getElementById('valor-total').value),
    posto: document.getElementById('posto').value || null,
    estado: document.getElementById('estado').value || null,
  };

  if (!dados.veiculo_id || !dados.data_abastecimento || !dados.litros || !dados.valor_total) {
    toastAviso('Preencha todos os campos obrigatórios!');
    return;
  }

  let res;
  if (abastecimentoEditandoId) {
    res = await put(`/abastecimentos/${abastecimentoEditandoId}`, dados);
  } else {
    res = await post('/abastecimentos', dados);
  }

  if (res.detail) {
    toastErro('Erro: ' + extrairErro(res));
    return;
  }

  fecharModal();
  carregarAbastecimentos();
}

preencherEstados();
definirPeriodoPadrao();
carregarAbastecimentos();
carregarVeiculos();
carregarMotoristas();
carregarConjuntos();
