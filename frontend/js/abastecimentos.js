checarAuth();
checarStaff();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';
/* Litros digitados como se escreve: "400" é 400 L (a máscara de dinheiro
   transformava "400" em 4,00). Aceita vírgula ou ponto e até 2 casas. */
const inputLitros = document.getElementById('litros');
inputLitros.addEventListener('input', () => {
  let v = inputLitros.value.replace(/\./g, ',').replace(/[^\d,]/g, '');
  const virgula = v.indexOf(',');
  if (virgula !== -1) v = v.slice(0, virgula + 1) + v.slice(virgula + 1).replace(/,/g, '').slice(0, 2);
  const [inteiro, decimal] = v.split(',');
  inputLitros.value = inteiro.slice(0, 5) + (decimal !== undefined ? ',' + decimal : '');
});
aplicarMascaraMoeda(document.getElementById('valor-total'));
document.getElementById('litros').addEventListener('input', () => recalcularValorTotal());

/* Preço por litro com 3 casas (bomba de diesel: R$ 6,299). Vem com a média
   do estado, mas o usuário pode digitar o preço que pagou de fato. */
const inputPrecoLitro = document.getElementById('preco-litro');
inputPrecoLitro.addEventListener('input', () => {
  const digitos = inputPrecoLitro.value.replace(/\D/g, '').slice(0, 7);
  inputPrecoLitro.value = digitos ? (parseInt(digitos, 10) / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '';
  origemPreco = 'manual';
  descreverOrigemPreco();
  recalcularValorTotal();
});

// De onde veio o preço que está no campo: 'media' (API, média do estado),
// 'manual' (digitado) ou 'registrado' (abastecimento já salvo, em edição).
let origemPreco = null;
let precoMedioEstado = null;

function precoLitroDigitado() {
  const v = inputPrecoLitro.value;
  return v ? parseFloat(v.replace(/\./g, '').replace(',', '.')) || null : null;
}

function formatarPrecoLitro(preco) {
  return preco.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function usarPrecoMedio() {
  if (!precoMedioEstado) return;
  inputPrecoLitro.value = formatarPrecoLitro(precoMedioEstado);
  origemPreco = 'media';
  descreverOrigemPreco();
  recalcularValorTotal();
}

function descreverOrigemPreco() {
  const info = document.getElementById('preco-diesel-info');
  const uf = document.getElementById('estado').value;
  const media = precoMedioEstado ? `R$ ${formatarPrecoLitro(precoMedioEstado)}` : null;
  if (origemPreco === 'media') {
    info.innerHTML = `Média do diesel em ${uf}. Pode alterar se pagou outro valor.`;
  } else if (origemPreco === 'manual' || origemPreco === 'registrado') {
    const texto = origemPreco === 'manual' ? 'Preço digitado manualmente.' : 'Preço registrado neste abastecimento.';
    info.innerHTML = media ? `${texto} <button type="button" onclick="usarPrecoMedio()">Usar média de ${uf} (${media})</button>` : texto;
  } else {
    info.textContent = 'Escolha o estado para puxar a média, ou digite o preço pago';
  }
}

let abastecimentos = [];
let abastecimentoEditandoId = null;
let conjuntosCarregados = [];

const ESTADOS_UF = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
let precosDieselPorUF = null;

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

function parsePrecoDiesel(str) {
  const n = str ? parseFloat(str.replace(',', '.')) : null;
  return n || null;
}

/* Ao escolher o estado: busca a média do diesel dele. Só preenche o campo de
   preço se o usuário ainda não digitou um (ou se é um abastecimento novo) —
   preço digitado à mão nunca é sobrescrito pela média. */
async function atualizarPrecoDiesel() {
  const uf = document.getElementById('estado').value.toLowerCase();
  const infoEl = document.getElementById('preco-diesel-info');
  precoMedioEstado = null;
  if (!uf) { descreverOrigemPreco(); return; }

  infoEl.textContent = 'Buscando a média do diesel no estado...';
  const precos = await carregarPrecosDiesel();
  precoMedioEstado = precos ? parsePrecoDiesel(precos[uf]) : null;

  // A API de terceiros nem sempre traz o preço de todos os estados (varia a cada
  // coleta). Nesse caso não preenche nenhuma estimativa: o usuário digita o preço.
  if (!precoMedioEstado) {
    const precoNacional = precos ? parsePrecoDiesel(precos.br) : null;
    infoEl.textContent = precoNacional
      ? `Média de ${uf.toUpperCase()} indisponível agora — digite o preço pago (referência nacional: R$ ${formatarPrecoLitro(precoNacional)}/L)`
      : 'Média indisponível agora — digite o preço pago';
    return;
  }

  if (origemPreco === 'manual' || origemPreco === 'registrado') {
    descreverOrigemPreco();
    return;
  }
  usarPrecoMedio();
}

function recalcularValorTotal() {
  const preco = precoLitroDigitado();
  const litros = moedaParaNumero(document.getElementById('litros').value);
  if (!preco || !litros) return;
  document.getElementById('valor-total').value = numeroParaMoeda(litros * preco);
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
      <td>R$ ${parseFloat(a.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}${parseFloat(a.litros) ? `<br><small>R$ ${formatarPrecoLitro(parseFloat(a.valor_total) / parseFloat(a.litros))}/L</small>` : ''}</td>
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
  inputPrecoLitro.value = '';
  origemPreco = null;
  precoMedioEstado = null;
  descreverOrigemPreco();
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
  // Preço que foi pago de fato (total / litros) — a média do estado aparece
  // só como sugestão ("Usar média"), sem trocar o valor registrado.
  const precoPago = parseFloat(a.litros) ? parseFloat(a.valor_total) / parseFloat(a.litros) : null;
  inputPrecoLitro.value = precoPago ? formatarPrecoLitro(precoPago) : '';
  origemPreco = precoPago ? 'registrado' : null;
  precoMedioEstado = null;
  descreverOrigemPreco();
  if (a.estado) atualizarPrecoDiesel();
  inputLitros.value = parseFloat(a.litros).toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false });
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
