checarAuth();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';
aplicarMascaraMoeda(document.getElementById('valor-frete'));
document.querySelectorAll('#cards-resumo-entregas .card-icon, #rota-stats .card-icon').forEach(el => {
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

/* Entrega que ainda não saiu cuja previsão não cobre saída prevista + tempo
   estimado de viagem (gravados pelo planejamento do formulário). */
function prazoCurto(e) {
  if (e.status !== 'aguardando' || !e.saida_prevista || e.tempo_estimado_h == null) return false;
  const chegada = new Date(e.saida_prevista).getTime() + parseFloat(e.tempo_estimado_h) * 3600 * 1000;
  return chegada - new Date(e.previsao).getTime() > 60 * 1000;
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
      <td>${formatarDataHora(e.previsao)}${prazoCurto(e) ? '<span class="prazo-curto-tag" title="A previsão é menor que a saída prevista + tempo estimado de viagem">⚠ prazo curto</span>' : ''}</td>
      <td>${e.valor_frete != null ? 'R$ ' + parseFloat(e.valor_frete).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}</td>
      <td>${badgeStatus(e.status)}</td>
      <td style="display:flex;gap:6px;">
        ${ehMotorista ? '' : `<button class="btn btn-outline" style="font-size:11px;padding:4px 10px;" onclick="abrirModal(${e.id})">${svgIcone('editar', 12)} Editar</button>`}
        <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;" onclick="abrirModalStatus(${e.id})">Status</button>
        <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;" onclick="abrirModalRota(${e.id})">${svgIcone('caminhao', 12)} Rota</button>
      </td>
    </tr>
  `).join('');
}

/* Clicar num card de status filtra a lista por ele (mesmo efeito do select
   #filtro-status) — clicar de novo no card já ativo limpa o filtro. */
function filtrarPorStatusCard(status) {
  const select = document.getElementById('filtro-status');
  select.value = select.value === status ? '' : status;
  filtrar();
}

function marcarCardStatusAtivo(statusAtivo) {
  document.querySelectorAll('#cards-resumo-entregas .card').forEach(card => {
    card.classList.toggle('card-filtro-ativo', !!statusAtivo && card.dataset.status === statusAtivo);
  });
}

function filtrar() {
  const cliente = document.getElementById('filtro-cliente').value.toLowerCase();
  const inicio = document.getElementById('filtro-data-inicio').value;
  const fim = document.getElementById('filtro-data-fim').value;
  const status = document.getElementById('filtro-status').value;
  const veiculoId = document.getElementById('filtro-veiculo').value;
  const motoristaId = document.getElementById('filtro-motorista').value;
  marcarCardStatusAtivo(status);

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
  atualizarRotograma(filtradas, motoristaId);
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
  // Depois de abrir o modal: o mapa do planejamento precisa do container
  // visível pra calcular o próprio tamanho.
  prepararPlanejamento(entrega);
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

let mapaRota = null;
let camadaRota = null; // L.layerGroup com os marcadores/linha da entrega aberta no momento
/* abrirModalRota() é assíncrona (geocodificação + OSRM) — se o usuário fechar
   o modal ou abrir outra entrega antes disso resolver, a chamada antiga não
   pode continuar mexendo no mapa. Cada chamada guarda seu próprio número e
   confere contra o "atual" depois de cada await. */
let rotaRequestId = 0;

/* Cria o mapa e o tile layer uma única vez (na primeira abertura) — reaberturas
   só limpam e redesenham camadaRota, sem tocar no mapa em si. */
function garantirMapaRota() {
  if (mapaRota) return;
  mapaRota = L.map('mapa-rota').setView([-14.235, -51.925], 4);
  // CartoDB/Stadia exigem API key pra tiles escuros hoje em dia — em vez de
  // depender de um serviço pago, o tema escuro escurece o tile padrão do OSM
  // (gratuito, sem chave) via filtro CSS (.mapa-escuro no style.css).
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(mapaRota);
  camadaRota = L.layerGroup().addTo(mapaRota);
}

/* Opções de toLocaleString pro formato "dd/mm hh:mm" usado nas datas de chegada/entrega da rota. */
const FORMATO_DATA_HORA_CURTO = { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' };

/* <input type="datetime-local"> trabalha com "AAAA-MM-DDTHH:MM" em hora local. */
function paraInputDataHora(data) {
  const p = n => String(n).padStart(2, '0');
  return `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}T${p(data.getHours())}:${p(data.getMinutes())}`;
}

/* ===================== PLANEJAMENTO NO FORMULÁRIO =====================
   Ao preencher origem e destino, calcula a melhor rota (a mais rápida do
   OSRM, passando pelos pontos de "Passar por" se houver), estima o tempo de
   caminhão e sugere a previsão de entrega = saída prevista + tempo estimado.
   A previsão continua editável (folga do motorista, manutenção...): se o
   usuário mexer nela, o sistema para de sobrescrever e só mostra se o prazo
   escolhido dá ou não dá tempo. */
let viasAtuais = [];            // [{nome, lat, lon}] — pontos de passagem na ordem
let planoAtual = null;          // { rota, est } da rota escolhida
let previsaoEditadaManual = false;
let planoRequestId = 0;
let mapaPlano = null;
let camadaPlano = null;
let alternativasAtuais = [];

const CORES_ALTERNATIVAS = ['#2E75B6', '#E67E22', '#8E44AD', '#16A085'];

function garantirMapaPlano() {
  if (mapaPlano) return;
  mapaPlano = L.map('mapa-plano', { zoomControl: false }).setView([-14.235, -51.925], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(mapaPlano);
  camadaPlano = L.layerGroup().addTo(mapaPlano);
}

function renderizarVias() {
  document.getElementById('vias-lista').innerHTML = viasAtuais.map((v, i) => `
    <span class="via-chip">via ${escapeHtml(v.nome)}
      <button type="button" title="Remover" onclick="removerVia(${i})">×</button>
    </span>`).join('');
}

async function adicionarViaDigitada() {
  const input = document.getElementById('via-cidade');
  const nome = input.value.trim();
  if (!nome) return;
  const ponto = await geocodificarCidade(nome).catch(() => null);
  if (!ponto) { toastAviso('Não encontrei essa cidade no mapa.'); return; }
  viasAtuais.push({ nome, lat: ponto.lat, lon: ponto.lon });
  input.value = '';
  renderizarVias();
  recalcularPlano();
}

function removerVia(i) {
  viasAtuais.splice(i, 1);
  renderizarVias();
  recalcularPlano();
}

function lerDataInput(id) {
  const v = document.getElementById(id).value;
  return v ? new Date(v) : null;
}

async function recalcularPlano() {
  const origem = document.getElementById('origem').value.trim();
  const destino = document.getElementById('destino').value.trim();
  const painel = document.getElementById('planejamento');
  const status = document.getElementById('planejamento-status');
  document.getElementById('rotas-alternativas').innerHTML = '';
  alternativasAtuais = [];

  if (!origem || !destino) {
    painel.hidden = true;
    planoAtual = null;
    return;
  }

  const meuId = ++planoRequestId;
  painel.hidden = false;
  status.textContent = 'Calculando rota...';
  garantirMapaPlano();
  mapaPlano.invalidateSize();

  const rota = await obterRotaRodoviaria(origem, destino, viasAtuais);
  if (meuId !== planoRequestId) return;
  if (!rota) {
    planoAtual = null;
    status.textContent = 'Não foi possível calcular a rota (cidade não encontrada ou falha de rede). Preencha a previsão manualmente.';
    document.getElementById('planejamento-numeros').innerHTML = '';
    document.getElementById('planejamento-detalhe').textContent = '';
    document.getElementById('planejamento-prazo').textContent = '';
    camadaPlano.clearLayers();
    return;
  }

  const ufs = rota.coordinates.length ? await ufsAoLongoDaRota(rota.coordinates) : [];
  if (meuId !== planoRequestId) return;

  planoAtual = { rota, est: estimarViagemCaminhao(rota, ufs) };
  status.textContent = viasAtuais.length ? 'Rota mais rápida passando pelos pontos escolhidos' : 'Rota mais rápida';
  desenharPlano();
  if (!previsaoEditadaManual) aplicarChegadaNaPrevisao();
  atualizarComparacaoPrazo();
}

function desenharPlano(alternativas = []) {
  const { rota, est } = planoAtual;
  document.getElementById('planejamento-numeros').innerHTML = `
    <span><b>${est.km.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km</b></span>
    <span>direção <b>${formatarHorasLongas(est.direcaoH)}</b></span>
    <span>viagem total <b>${formatarHorasLongas(est.totalH)}</b></span>`;
  const paradas = descreverParadas(est);
  document.getElementById('planejamento-detalhe').innerHTML =
    (paradas.length ? `Inclui ${paradas.join(', ')}.` : 'Viagem curta, sem paradas obrigatórias.')
    + (est.ufs.length > 1 ? `<br>Estados: ${est.ufs.join(' → ')}` : '')
    + '<br>Estimativa para caminhão carregado (máx. 90 km/h, Lei do Motorista 13.103/2015). Não considera trânsito, obras nem tempo de carga/descarga.';

  camadaPlano.clearLayers();
  alternativas.forEach((alt, i) => {
    if (i === 0) return;
    L.polyline(alt.coordinates.map(([lon, lat]) => [lat, lon]), { color: CORES_ALTERNATIVAS[i % CORES_ALTERNATIVAS.length], weight: 3, opacity: 0.6, dashArray: '6 6' }).addTo(camadaPlano);
  });
  if (!rota.coordinates.length) return;
  const linha = L.polyline(rota.coordinates.map(([lon, lat]) => [lat, lon]), { color: CORES_ALTERNATIVAS[0], weight: 4 }).addTo(camadaPlano);
  const inicio = rota.coordinates[0];
  const fim = rota.coordinates[rota.coordinates.length - 1];
  L.marker([inicio[1], inicio[0]], { icon: iconeCaminhaoMapa() }).addTo(camadaPlano);
  L.circleMarker([fim[1], fim[0]], { radius: 7, color: '#1E4D78', weight: 2, fillColor: '#F2A93B', fillOpacity: 1 }).addTo(camadaPlano);
  viasAtuais.forEach(v => L.circleMarker([v.lat, v.lon], { radius: 5, color: '#1E4D78', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(camadaPlano).bindTooltip(v.nome));
  mapaPlano.fitBounds(linha.getBounds(), { padding: [16, 16] });
}

function chegadaEstimada() {
  const saida = lerDataInput('saida-prevista');
  if (!planoAtual || !saida) return null;
  return new Date(saida.getTime() + planoAtual.est.totalH * 3600 * 1000);
}

function aplicarChegadaNaPrevisao() {
  const chegada = chegadaEstimada();
  if (chegada) document.getElementById('previsao').value = paraInputDataHora(chegada);
}

function usarChegadaEstimada() {
  previsaoEditadaManual = false;
  aplicarChegadaNaPrevisao();
  atualizarComparacaoPrazo();
}

function atualizarComparacaoPrazo() {
  const caixa = document.getElementById('planejamento-prazo');
  const btnUsar = document.getElementById('btn-usar-estimativa');
  const chegada = chegadaEstimada();
  const previsao = lerDataInput('previsao');
  caixa.className = 'planejamento-prazo';
  btnUsar.hidden = true;
  if (!chegada) {
    caixa.textContent = planoAtual ? 'Informe a saída prevista para calcular a chegada.' : '';
    return;
  }
  const chegadaTxt = chegada.toLocaleString('pt-BR', FORMATO_DATA_HORA_CURTO);
  if (!previsao) {
    caixa.textContent = `Chegada estimada: ${chegadaTxt}`;
    return;
  }
  const diffH = (previsao - chegada) / 3600000;
  btnUsar.hidden = Math.abs(diffH) < 1 / 60;
  if (diffH >= -1 / 60) {
    caixa.classList.add('ok');
    caixa.textContent = Math.abs(diffH) < 1 / 60
      ? `✓ Chegada estimada: ${chegadaTxt}`
      : `✓ Prazo viável — chegada estimada ${chegadaTxt}, folga de ${formatarHorasLongas(diffH)}`;
  } else {
    caixa.classList.add('curto');
    caixa.textContent = `⚠ Prazo curto — chegada estimada ${chegadaTxt}, faltam ${formatarHorasLongas(-diffH)} em relação à previsão escolhida`;
  }
}

async function mostrarRotasAlternativas() {
  const lista = document.getElementById('rotas-alternativas');
  if (viasAtuais.length) {
    lista.innerHTML = '<small style="color:var(--text-light);">Com pontos de passagem a rota já é fixa — remova-os para comparar as alternativas.</small>';
    return;
  }
  const origem = document.getElementById('origem').value.trim();
  const destino = document.getElementById('destino').value.trim();
  if (!planoAtual) return;
  lista.innerHTML = '<small style="color:var(--text-light);">Buscando alternativas...</small>';
  const meuId = planoRequestId;
  const rotas = await obterRotasAlternativas(origem, destino);
  if (meuId !== planoRequestId) return;
  if (rotas.length < 2) {
    lista.innerHTML = '<small style="color:var(--text-light);">O mapa não encontrou outra rota razoável — use "Passar por" para forçar um caminho.</small>';
    return;
  }
  alternativasAtuais = await Promise.all(rotas.map(async r => ({ rota: r, est: estimarViagemCaminhao(r, await ufsAoLongoDaRota(r.coordinates)) })));
  if (meuId !== planoRequestId) return;
  lista.innerHTML = alternativasAtuais.map((a, i) => `
    <button type="button" class="rota-opcao ${i === 0 ? 'escolhida' : ''}" onclick="escolherAlternativa(${i})">
      <span class="rota-opcao-cor" style="background:${CORES_ALTERNATIVAS[i % CORES_ALTERNATIVAS.length]}"></span>
      <span><b>Rota ${i + 1}${i === 0 ? ' — mais rápida' : ''}</b> · ${a.est.km.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km · ${formatarHorasLongas(a.est.totalH)}
      ${a.est.ufs.length > 1 ? `<br><small style="color:var(--text-light);">${a.est.ufs.join(' → ')}</small>` : ''}</span>
    </button>`).join('');
  desenharPlano(rotas);
}

/* Escolher uma rota alternativa vira um ponto de passagem nela — é o que dá
   pra guardar e redesenhar depois (o OSRM não tem "id" de rota). O ponto é o
   da alternativa MAIS LONGE da rota principal: o "meio" da alternativa pode
   cair num trecho que as duas compartilham, e aí o OSRM voltaria pra
   principal. */
function pontoMaisDistanteDaPrincipal(coordsAlt, coordsPrincipal) {
  const amostra = (coords) => coords.filter((_, i) => i % Math.max(1, Math.floor(coords.length / 300)) === 0);
  const principal = amostra(coordsPrincipal).map(([lon, lat]) => ({ lat, lon }));
  let melhor = coordsAlt[Math.floor(coordsAlt.length / 2)];
  let maiorDist = -1;
  for (const [lon, lat] of amostra(coordsAlt)) {
    let menor = Infinity;
    for (const p of principal) menor = Math.min(menor, distanciaHaversineKm({ lat, lon }, p));
    if (menor > maiorDist) { maiorDist = menor; melhor = [lon, lat]; }
  }
  return melhor;
}

async function escolherAlternativa(i) {
  if (i === 0) { viasAtuais = []; renderizarVias(); recalcularPlano(); return; }
  const alt = alternativasAtuais[i];
  if (!alt) return;
  const [lon, lat] = pontoMaisDistanteDaPrincipal(alt.rota.coordinates, alternativasAtuais[0].rota.coordinates);
  const nome = await nomeCidadeNoPonto(lat, lon) || `ponto da rota ${i + 1}`;
  viasAtuais = [{ nome, lat, lon }];
  renderizarVias();
  recalcularPlano();
}

function prepararPlanejamento(entrega) {
  viasAtuais = entrega && Array.isArray(entrega.rota_via) ? entrega.rota_via.map(v => ({ ...v })) : [];
  renderizarVias();
  document.getElementById('via-cidade').value = '';
  // Editando: respeita a previsão já gravada (só compara). Nova: sugere.
  previsaoEditadaManual = !!entrega;
  let saida = entrega && entrega.saida_prevista ? new Date(entrega.saida_prevista) : null;
  if (!saida && !entrega) {
    saida = new Date();
    saida.setMinutes(0, 0, 0);
    saida.setHours(saida.getHours() + 1);
  }
  document.getElementById('saida-prevista').value = saida ? paraInputDataHora(saida) : '';
  planoAtual = null;
  recalcularPlano();
}

function preencherStatsRota({ distancia, tempo, chegada, chegadaLabel, paradas }) {
  document.getElementById('rota-stat-distancia').textContent = distancia;
  document.getElementById('rota-stat-tempo').textContent = tempo;
  document.getElementById('rota-stat-chegada').textContent = chegada;
  document.getElementById('rota-stat-paradas').textContent = paradas;
  if (chegadaLabel) document.getElementById('rota-stat-chegada-label').textContent = chegadaLabel;
}

/* Calcula e salva o km rodado vazio (destino da última entrega concluída
   desse veículo até a origem desta) assim que a entrega entra em rota —
   entregaAnteriorId vem na resposta do PUT /status (atualizar_status já
   descobriu e gravou o vínculo na tabela deslocamentos_vazios, separada de
   entregas). Só funciona se a entrega anterior estiver visível pro usuário
   atual: um motorista não enxerga entregas de outro motorista (ver
   _garantir_acesso_entrega no backend), então nesse caso o km vazio fica
   pendente até um admin/operador abrir a tela — não é crítico, é só uma
   métrica de relatório. */
async function calcularESalvarKmVazio(entregaId, entregaAnteriorId) {
  if (!entregaAnteriorId) return;
  const entrega = entregas.find(e => e.id === entregaId);
  const anterior = entregas.find(e => e.id === entregaAnteriorId);
  if (!entrega || !anterior) return;

  const rota = await obterRotaRodoviaria(anterior.destino, entrega.origem);
  if (rota == null) return;
  try {
    await put(`/deslocamentos-vazios/${entregaId}`, { km_vazio: Math.round(rota.distanceKm * 10) / 10 });
  } catch (e) { /* métrica secundária — falha de rede aqui não deve incomodar o usuário */ }
}

async function abrirModalRota(id) {
  const meuRequestId = ++rotaRequestId;
  const entrega = entregas.find(e => e.id === id);
  if (!entrega) return;

  document.getElementById('modal-rota-titulo').textContent = `Rota — ${entrega.origem} → ${entrega.destino}`;
  const status = document.getElementById('rota-status');
  status.textContent = 'Calculando rota...';
  preencherStatsRota({ distancia: '—', tempo: '—', chegada: '—', chegadaLabel: 'Chegada (saindo agora)', paradas: '—' });
  document.getElementById('modal-rota').classList.add('aberto');

  // O mapa é criado uma vez só e reaproveitado (nunca destruído/recriado):
  // remover e recriar o L.map a cada abertura disparava um erro do Leaflet
  // quando a animação de zoom do fitBounds() anterior ainda não tinha
  // terminado (o callback de "fim de transição CSS" rodava depois do mapa já
  // ter sido removido, e quebrava tentando ler a posição de um pane que não
  // existe mais). camadaRota junta tudo que é específico da entrega aberta
  // (marcadores, linha) pra poder limpar só isso a cada abertura.
  garantirMapaRota();
  camadaRota.clearLayers();
  const elMapa = document.getElementById('mapa-rota');
  const escuro = document.body.classList.contains('dark');
  elMapa.classList.toggle('mapa-escuro', escuro);
  mapaRota.invalidateSize();

  let origem, destino;
  try {
    [origem, destino] = await Promise.all([
      geocodificarCidade(entrega.origem),
      geocodificarCidade(entrega.destino),
    ]);
  } catch (e) {
    if (meuRequestId !== rotaRequestId) return;
    status.textContent = 'Não foi possível buscar as coordenadas de origem/destino (falha de rede).';
    return;
  }
  if (meuRequestId !== rotaRequestId) return;

  if (!origem || !destino) {
    status.textContent = 'Não foi possível localizar origem e/ou destino no mapa.';
    return;
  }

  const origemNorm = normalizarBusca(entrega.origem);
  const destinoNorm = normalizarBusca(entrega.destino);
  const vias = Array.isArray(entrega.rota_via) ? entrega.rota_via : [];
  const mesmaCidade = origemNorm === destinoNorm && !vias.length;

  L.marker([destino.lat, destino.lon]).addTo(camadaRota).bindPopup(`Destino: ${escapeHtml(entrega.destino)}`);

  let coordenadas = [[origem.lat, origem.lon], [destino.lat, destino.lon]];

  if (mesmaCidade) {
    status.textContent = 'Origem e destino são a mesma cidade.';
    preencherStatsRota({ distancia: '0 km', tempo: '0min', chegada: '—', chegadaLabel: 'Chegada', paradas: 'Nenhuma' });
    L.marker([origem.lat, origem.lon], { icon: iconeCaminhaoMapa() }).addTo(camadaRota).bindPopup(`Origem/Destino: ${escapeHtml(entrega.origem)}`);
    // fitBounds numa linha de comprimento zero (mesmo ponto duas vezes) faz o
    // Leaflet calcular um zoom/pan inválido — não desenha linha nenhuma, só
    // centraliza no ponto com um zoom fixo de "escala de bairro".
    mapaRota.setView([origem.lat, origem.lon], 12);
    return;
  }

  {
    const rotaCalculada = await obterRotaRodoviaria(entrega.origem, entrega.destino, vias);
    if (meuRequestId !== rotaRequestId) return;
    const ufsRota = rotaCalculada && rotaCalculada.coordinates.length ? await ufsAoLongoDaRota(rotaCalculada.coordinates) : null;
    if (meuRequestId !== rotaRequestId) return;

    if (rotaCalculada) {
      coordenadas = rotaCalculada.coordinates.map(([lon, lat]) => [lat, lon]);
      const km = rotaCalculada.distanceKm;
      const est = estimarViagemCaminhao(rotaCalculada, ufsRota);
      const horasTotais = est.totalH;
      const partesParadas = descreverParadas(est);

      // Âncora da chegada: quando saiu de fato (em viagem), senão a saída
      // planejada no cadastro, senão "se sair agora". "Atrasado" e
      // "ocorrência" com iniciado_em também são caminhão já na estrada.
      const emViagem = ['em_rota', 'atrasado', 'ocorrencia'].includes(entrega.status) && !!entrega.iniciado_em;
      const iniciadoEm = emViagem ? dataUtc(entrega.iniciado_em) : null;
      const saidaPrevista = entrega.saida_prevista ? new Date(entrega.saida_prevista) : null;
      const ancoraPartida = iniciadoEm || saidaPrevista || new Date();
      const chegada = new Date(ancoraPartida.getTime() + horasTotais * 3600 * 1000);

      let chegadaLabel = 'Chegada (saindo agora)';
      let chegadaTexto = chegada.toLocaleString('pt-BR', FORMATO_DATA_HORA_CURTO);
      if (entrega.status === 'entregue' && entrega.concluido_em) {
        chegadaLabel = 'Entregue em';
        chegadaTexto = dataUtc(entrega.concluido_em).toLocaleString('pt-BR', FORMATO_DATA_HORA_CURTO);
      } else if (emViagem) {
        chegadaLabel = 'Chegada estimada';
      } else if (saidaPrevista) {
        chegadaLabel = `Chegada (saída ${saidaPrevista.toLocaleString('pt-BR', FORMATO_DATA_HORA_CURTO)})`;
      }

      preencherStatsRota({
        distancia: `${km.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km`,
        tempo: `${formatarHorasLongas(est.direcaoH)} (total ${formatarHorasLongas(est.totalH)})`,
        chegada: chegadaTexto,
        chegadaLabel,
        paradas: partesParadas.length ? partesParadas.join(' + ') : 'Nenhuma',
      });
      status.textContent = (vias.length ? `Passando por ${vias.map(v => v.nome).join(', ')}. ` : '')
        + (est.ufs.length > 1 ? `Estados: ${est.ufs.join(' → ')}. ` : '')
        + 'Rota via OpenStreetMap (OSRM), tempo ajustado para caminhão carregado (máx. 90 km/h) com as paradas da Lei do Motorista (Lei 13.103/2015), abastecimentos e postos fiscais nas divisas. Estimativa de planejamento (não inclui trânsito nem carga/descarga), não substitui o cronotacógrafo.';
      vias.forEach(v => L.circleMarker([v.lat, v.lon], { radius: 6, color: '#1E4D78', weight: 2, fillColor: '#fff', fillOpacity: 1 })
        .addTo(camadaRota).bindPopup(`Passando por: ${escapeHtml(v.nome)}`));

      // Posição do caminhão: parado na origem (ainda não saiu), avançando pelo
      // trajeto real (entrega em rota) ou parado no destino (já entregue).
      let fracAtual = 0;
      if (emViagem) {
        fracAtual = Math.max(0, Math.min(1, (Date.now() - iniciadoEm.getTime()) / (horasTotais * 3600 * 1000)));
      } else if (entrega.status === 'entregue') {
        fracAtual = 1;
      }
      const posicaoCaminhao = fracAtual === 0 ? [origem.lat, origem.lon] : pontoNaLinha(coordenadas, fracAtual);
      const popupCaminhao = emViagem
        ? `Posição estimada — ${Math.round(fracAtual * 100)}% do trajeto`
        : `Origem: ${escapeHtml(entrega.origem)}`;
      L.marker(posicaoCaminhao, { icon: iconeCaminhaoMapa() }).addTo(camadaRota).bindPopup(popupCaminhao);
      if (fracAtual > 0) {
        L.circleMarker([origem.lat, origem.lon], { radius: 6, color: '#1E4D78', weight: 2, fillColor: '#2E75B6', fillOpacity: 1 })
          .addTo(camadaRota).bindPopup(`Origem: ${escapeHtml(entrega.origem)}`);
      }
    } else {
      const km = distanciaHaversineKm(origem, destino);
      preencherStatsRota({ distancia: `~${km.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km`, tempo: '—', chegada: '—', chegadaLabel: 'Chegada', paradas: '—' });
      status.textContent = 'Não foi possível calcular o trajeto rodoviário — mostrando distância em linha reta.';
      L.marker([origem.lat, origem.lon], { icon: iconeCaminhaoMapa() }).addTo(camadaRota).bindPopup(`Origem: ${escapeHtml(entrega.origem)}`);
    }
  }

  const linha = L.polyline(coordenadas, { color: escuro ? '#7CB2E8' : '#2E75B6', weight: 4 }).addTo(camadaRota);
  mapaRota.fitBounds(linha.getBounds(), { padding: [24, 24] });
}

function fecharModalRota() {
  rotaRequestId++; // invalida qualquer geocodificação/rota ainda em voo dessa abertura
  document.getElementById('modal-rota').classList.remove('aberto');
  // O mapa em si não é destruído (ver garantirMapaRota) — só fecha o modal.
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
    saida_prevista: document.getElementById('saida-prevista').value || null,
    rota_via: viasAtuais.length ? viasAtuais : null,
  };
  // Sem rota calculada (falha de rede, cidade não achada) não sobrescreve a
  // estimativa gravada de uma entrega em edição com vazio.
  if (planoAtual) {
    dados.distancia_km = Math.round(planoAtual.est.km * 10) / 10;
    dados.tempo_estimado_h = Math.round(planoAtual.est.totalH * 10) / 10;
  } else if (!entregaEditandoId) {
    dados.distancia_km = null;
    dados.tempo_estimado_h = null;
  }

  if (!dados.cliente || !dados.origem || !dados.destino || !dados.previsao) {
    toastAviso('Preencha todos os campos obrigatórios!');
    return;
  }

  const res = entregaEditandoId
    ? await put(`/entregas/${entregaEditandoId}`, dados)
    : await post('/entregas', dados);

  if (res && res.detail) {
    toastErro('Erro: ' + extrairErro(res));
    return;
  }

  fecharModal();
  carregarEntregas();
}

async function confirmarStatus() {
  const status = document.getElementById('novo-status').value;
  const idAlvo = entregaIdSelecionada;
  const res = await fetch(`${API}/entregas/${idAlvo}/status?status=${status}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
  const corpo = await res.json();
  if (!res.ok) {
    toastErro('Erro: ' + extrairErro(corpo));
    return;
  }
  fecharModalStatus();
  await carregarEntregas();
  if (status === 'em_rota') calcularESalvarKmVazio(idAlvo, corpo.entrega_anterior_id);
}

async function iniciar() {
  definirPeriodoPadrao();
  ativarAutocompleteCidade(document.getElementById('origem'));
  ativarAutocompleteCidade(document.getElementById('destino'));
  ativarAutocompleteCidade(document.getElementById('via-cidade'));
  document.getElementById('origem').addEventListener('change', recalcularPlano);
  document.getElementById('destino').addEventListener('change', recalcularPlano);
  document.getElementById('via-cidade').addEventListener('change', () => {
    // Escolher uma cidade no autocomplete já adiciona (sem precisar do botão).
    const v = document.getElementById('via-cidade').value;
    if (/ - [A-Z]{2}$/.test(v)) adicionarViaDigitada();
  });
  document.getElementById('saida-prevista').addEventListener('change', () => {
    if (!previsaoEditadaManual) aplicarChegadaNaPrevisao();
    atualizarComparacaoPrazo();
  });
  document.getElementById('previsao').addEventListener('input', () => {
    previsaoEditadaManual = true;
    atualizarComparacaoPrazo();
  });
  /* Motorista só vê as próprias entregas; cadastros de veículo/motorista/conjunto
     ficam bloqueados pra esse perfil, então nem tenta carregar (e nem precisa). */
  if (localStorage.getItem('perfil') !== 'motorista') {
    await Promise.all([carregarVeiculos(), carregarMotoristas(), carregarConjuntosMotoristas(), carregarManutencoesAtivas()]);
    // "Ver rotograma" da ficha do motorista chega com ?motorista=ID já filtrado.
    const motoristaUrl = new URLSearchParams(location.search).get('motorista');
    if (motoristaUrl) document.getElementById('filtro-motorista').value = motoristaUrl;
  }
  carregarEntregas();
}
iniciar();