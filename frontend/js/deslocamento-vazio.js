checarAuth();
checarStaff();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';
document.querySelectorAll('.vazio-kpis .card-icon').forEach(el => { el.innerHTML = svgIcone(el.dataset.icone, 21); });

/* Página didática do deslocamento vazio (km rodado sem carga entre o fim de
   uma entrega e o início da seguinte do mesmo veículo). Os dados vêm da tabela
   deslocamentos_vazios (preenchida quando uma entrega entra em rota — ver
   calcularESalvarKmVazio em entregas.js); aqui eles são cruzados com as
   entregas, veículos, motoristas e abastecimentos pra contar a história de
   cada trecho em linguagem simples. */

let entregas = [], veiculos = [], motoristas = [], abastecimentos = [], deslocamentos = [];
let precoDieselMedio = null;
let mapa = null;
let grafico = null;
let renderId = 0;

const CONSUMO_PADRAO_KM_L = 2.5;
const PRECO_DIESEL_REFERENCIA = 6.0; // só se não houver nenhum abastecimento cadastrado
const COR_CARREGADO = '#2E75B6';
const COR_VAZIO = '#E67E22';

function fmtData(d) {
  return d ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}

function fmtKm(km) {
  return `${Math.round(km).toLocaleString('pt-BR')} km`;
}

function fmtReais(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function consumoAtual() {
  const v = parseFloat(document.getElementById('consumo-km-l').value);
  return v > 0 ? v : CONSUMO_PADRAO_KM_L;
}

function salvarConsumo() {
  try { localStorage.setItem('vazio_consumo_km_l', String(consumoAtual())); } catch (e) { /* só conveniência */ }
}

function custoDiesel(km) {
  return km / consumoAtual() * (precoDieselMedio || PRECO_DIESEL_REFERENCIA);
}

function nivelDoPercentual(pct) {
  if (pct == null) return null;
  if (pct < 0.2) return { classe: 'nivel-baixo', nome: 'Baixo' };
  if (pct <= 0.4) return { classe: 'nivel-moderado', nome: 'Moderado' };
  return { classe: 'nivel-alto', nome: 'Alto' };
}

function placaDo(veiculoId) {
  const v = veiculos.find(x => x.id === veiculoId);
  return v ? v.placa : 'Veículo sem placa';
}

function motoristaDo(motoristaId) {
  const m = motoristas.find(x => x.id === motoristaId);
  return m ? m.nome : null;
}

/* Km com carga de uma entrega: o planejado no cadastro (distancia_km) ou,
   pra entregas antigas, a rota calculada na hora (fica em cache). */
async function kmComCarga(entrega) {
  if (entrega.distancia_km != null) return parseFloat(entrega.distancia_km);
  const rota = await obterRotaRodoviaria(entrega.origem, entrega.destino);
  return rota ? rota.distanceKm : null;
}

function periodoInicio() {
  const v = document.getElementById('filtro-periodo').value;
  if (v === 'tudo') return null;
  const d = new Date();
  d.setDate(d.getDate() - parseInt(v, 10));
  return d;
}

function trechosFiltrados() {
  const inicio = periodoInicio();
  const veiculoId = parseInt(document.getElementById('filtro-veiculo').value, 10) || null;
  return deslocamentos
    .map(dv => ({
      dv,
      entrega: entregas.find(e => e.id === dv.entrega_id),
      anterior: entregas.find(e => e.id === dv.entrega_anterior_id),
    }))
    .filter(({ dv, entrega, anterior }) => {
      if (dv.km_vazio == null || !entrega || !anterior || !entrega.iniciado_em) return false;
      if (inicio && dataUtc(entrega.iniciado_em) < inicio) return false;
      if (veiculoId && entrega.veiculo_id !== veiculoId) return false;
      return true;
    })
    .sort((a, b) => dataUtc(b.entrega.iniciado_em) - dataUtc(a.entrega.iniciado_em));
}

/* ---------------------------------------------------------------- tela */
async function atualizarTela() {
  const meuId = ++renderId;
  const trechos = trechosFiltrados();
  const lista = document.getElementById('lista-trechos');

  // Indicadores que não dependem de rota: saem na hora.
  const kmTotal = trechos.reduce((s, t) => s + parseFloat(t.dv.km_vazio), 0);
  document.getElementById('kpi-km').textContent = fmtKm(kmTotal);
  document.getElementById('kpi-trechos').textContent = trechos.length;
  const veiculosDistintos = new Set(trechos.map(t => t.entrega.veiculo_id)).size;
  document.getElementById('kpi-trechos-explica').textContent = trechos.length
    ? `Vezes em que um caminhão saiu sem carga para buscar a próxima (${veiculosDistintos} veículo${veiculosDistintos > 1 ? 's' : ''}).`
    : 'Vezes em que um caminhão saiu sem carga para buscar a próxima.';
  document.getElementById('kpi-custo').textContent = fmtReais(custoDiesel(kmTotal));
  document.getElementById('kpi-custo-explica').textContent = precoDieselMedio
    ? `Km vazio ÷ ${consumoAtual().toLocaleString('pt-BR')} km/L × R$ ${precoDieselMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/L (preço médio pago nos abastecimentos cadastrados).`
    : `Km vazio ÷ ${consumoAtual().toLocaleString('pt-BR')} km/L × R$ ${PRECO_DIESEL_REFERENCIA.toFixed(2).replace('.', ',')}/L (preço de referência — cadastre abastecimentos para usar o preço real).`;

  renderizarGrafico(trechos);
  renderizarDicas(trechos);

  if (!trechos.length) {
    lista.innerHTML = `<div class="vazio-estado-vazio">Nenhum deslocamento vazio neste período.<br>Ele aparece aqui sozinho quando um caminhão inicia uma entrega depois de ter concluído outra.</div>`;
    trechosAtuais = [];
    limparMapa();
    atualizarPercentual(0, 0, meuId, true);
    return;
  }

  lista.innerHTML = `<div class="vazio-estado-vazio">Calculando os trajetos no mapa...</div>`;

  // Rotas (vazio + trechos com carga ao redor) — uma por vez, pra não
  // estourar o limite do OSRM público; cada uma fica em cache depois.
  const enriquecidos = [];
  for (const t of trechos) {
    const rotaVazio = await obterRotaRodoviaria(t.anterior.destino, t.entrega.origem);
    const kmCarga = await kmComCarga(t.entrega);
    if (meuId !== renderId) return;
    const km = parseFloat(t.dv.km_vazio);
    const pct = kmCarga != null && km + kmCarga > 0 ? km / (km + kmCarga) : null;
    const direcaoH = rotaVazio && rotaVazio.durationSec
      ? estimarViagemCaminhao({ distanceKm: km, durationSec: rotaVazio.durationSec }, null).direcaoH
      : km / (PARAMETROS_CAMINHAO.velocidadeMaxKmH * PARAMETROS_CAMINHAO.fatorCarregado);
    enriquecidos.push({ ...t, km, kmCarga, pct, direcaoH, rotaVazio });
  }

  lista.innerHTML = enriquecidos.map(cartaoTrecho).join('');
  trechosAtuais = enriquecidos;
  selecionado = 0;
  await renderizarMapa();
  atualizarPercentualDoPeriodo(kmTotal, meuId);
}

function cartaoTrecho(t, i) {
  const { dv, entrega, anterior, km, kmCarga, pct, direcaoH } = t;
  const nivel = nivelDoPercentual(pct);
  const placa = placaDo(entrega.veiculo_id);
  const motorista = motoristaDo(entrega.motorista_id);
  const fimAnterior = dataUtc(anterior.concluido_em);
  const inicioProxima = dataUtc(entrega.iniciado_em);
  const intervaloH = fimAnterior && inicioProxima ? (inicioProxima - fimAnterior) / 3600000 : null;
  const custo = custoDiesel(km);

  const deCada10 = pct != null ? Math.round(pct * 10) : null;
  let frase = '';
  if (deCada10 != null) {
    frase = deCada10 === 0
      ? ' Menos de 1 a cada 10 km dessa viagem foi sem carga — ótimo aproveitamento.'
      : ` De cada 10 km dessa viagem, <strong>${deCada10} foram sem carga</strong>.`;
    if (nivel.nome === 'Alto') frase += ` Vale procurar um frete de retorno saindo de ${escapeHtml(anterior.destino)} ou região.`;
    else if (nivel.nome === 'Baixo' && deCada10 > 0) frase += ' Bom aproveitamento.';
  }
  // Só faz sentido se couber o próprio trecho vazio dirigido (registros de
  // status lançados em sequência, no mesmo minuto, dariam "passaram 4min").
  const fraseIntervalo = intervaloH != null && intervaloH >= direcaoH * 0.8
    ? ` Entre terminar uma entrega e sair com a outra passaram <strong>${formatarHorasLongas(intervaloH)}</strong>.`
    : '';

  return `
  <article class="trecho" id="trecho-${dv.id}" onclick="selecionarTrecho(${i}, true)" title="Clique para ver este trecho no mapa">
    <div class="trecho-topo">
      <div class="trecho-quem"><strong>${escapeHtml(placa)}</strong>${motorista ? ` · ${escapeHtml(motorista)}` : ''} · saiu vazio para a entrega #${entrega.id}</div>
      ${nivel ? `<span class="nivel ${nivel.classe}" title="Parte da viagem feita sem carga">${nivel.nome} · ${Math.round(pct * 100)}% vazio</span>` : ''}
    </div>
    <div class="trecho-fluxo">
      <div class="trecho-parada">
        <small>1 · Entrega anterior #${anterior.id}</small>
        <div class="cidade">${escapeHtml(anterior.destino)}</div>
        <div class="det">Entregou para ${escapeHtml(anterior.cliente)}<br>${fimAnterior ? `Concluída em ${fmtData(fimAnterior)}` : 'Data de conclusão não registrada'}</div>
      </div>
      <div class="trecho-meio">
        <div class="trecho-meio-caixa">
          <div class="km-rotulo">2 · Rodou vazio</div>
          <div class="km">${fmtKm(km)}</div>
          <div class="det">≈ ${formatarHorasLongas(direcaoH)} ao volante<br>≈ ${fmtReais(custo)} em diesel</div>
        </div>
      </div>
      <div class="trecho-parada">
        <small>3 · Próxima carga #${entrega.id}</small>
        <div class="cidade">${escapeHtml(entrega.origem)}</div>
        <div class="det">Carregou para ${escapeHtml(entrega.cliente)}, rumo a ${escapeHtml(entrega.destino)}<br>Saiu em ${fmtData(inicioProxima)}</div>
      </div>
    </div>
    <div class="trecho-obs">Depois de entregar em <strong>${escapeHtml(anterior.destino)}</strong>, o caminhão rodou <strong>${fmtKm(km)} sem carga</strong> até <strong>${escapeHtml(entrega.origem)}</strong> para buscar a carga seguinte.${frase}${fraseIntervalo}</div>
    <div class="trecho-rodape">
      <div class="trecho-proporcao">${kmCarga != null
        ? `Com carga depois: ${fmtKm(kmCarga)} · vazio antes: ${fmtKm(km)}
           <div class="barra-proporcao"><span class="barra-carregado" style="width:${(1 - pct) * 100}%"></span><span class="barra-vazio" style="width:${pct * 100}%"></span></div>`
        : ''}</div>
      <button type="button" class="btn btn-outline btn-mini" onclick="event.stopPropagation(); selecionarTrecho(${i}, true)">${svgIcone('local', 12)} Ver no mapa</button>
    </div>
  </article>`;
}

/* % da rodagem feita sem carga no período = km vazio ÷ (km vazio + km com
   carga de todas as entregas que saíram no período, do mesmo filtro). */
async function atualizarPercentualDoPeriodo(kmVazio, meuId) {
  const inicio = periodoInicio();
  const veiculoId = parseInt(document.getElementById('filtro-veiculo').value, 10) || null;
  // Viagens de antes da primeira medição de vazio não têm o vazio registrado
  // (o recurso não existia) — entrariam só do lado "com carga" e puxariam o
  // percentual pra baixo artificialmente.
  const inicioMedicao = inicioDaMedicao();
  const desde = inicio && inicioMedicao ? new Date(Math.max(inicio, inicioMedicao)) : (inicio || inicioMedicao);
  const saidas = entregas.filter(e => e.iniciado_em && ['em_rota', 'entregue', 'atrasado', 'ocorrencia'].includes(e.status)
    && (!desde || dataUtc(e.iniciado_em) >= desde) && (!veiculoId || e.veiculo_id === veiculoId));
  let kmCarga = 0;
  for (const e of saidas) {
    const km = await kmComCarga(e);
    if (meuId !== renderId) return;
    if (km) kmCarga += km;
  }
  atualizarPercentual(kmVazio, kmCarga, meuId);
}

/* Primeira vez que o sistema mediu um deslocamento vazio (início do recurso). */
function inicioDaMedicao() {
  const datas = deslocamentos
    .map(dv => entregas.find(e => e.id === dv.entrega_id))
    .filter(e => e && e.iniciado_em)
    .map(e => dataUtc(e.iniciado_em));
  if (!datas.length) return null;
  const d = new Date(Math.min(...datas));
  d.setHours(0, 0, 0, 0);
  return d;
}

function atualizarPercentual(kmVazio, kmCarga, meuId, semDados) {
  if (meuId !== renderId) return;
  const total = kmVazio + kmCarga;
  const pct = total > 0 ? kmVazio / total : 0;
  document.getElementById('kpi-percentual').textContent = `${Math.round(pct * 100)}%`;
  document.getElementById('barra-carregado').style.width = `${(1 - pct) * 100}%`;
  document.getElementById('barra-vazio').style.width = `${pct * 100}%`;
  document.getElementById('kpi-percentual-explica').textContent = semDados
    ? 'Sem trechos vazios no período.'
    : `De ${fmtKm(total)} rodados, ${fmtKm(kmVazio)} foram sem carga (laranja) e ${fmtKm(kmCarga)} com carga (azul). Conta só as viagens desde ${inicioDaMedicao().toLocaleDateString('pt-BR')}, quando o sistema passou a medir o vazio.`;
}

/* ---------------------------------------------------------------- mapa
   Dois modos, pra nunca misturar viagens:
   - "um trecho por vez" (padrão): só a história do trecho escolhido — a
     entrega anterior (azul claro), o trecho vazio (laranja tracejado, com os
     km escritos em cima) e a próxima carga (azul), com os pontos numerados
     1-2-3 iguais aos passos do cartão;
   - "todos os vazios": visão geral só com as linhas laranjas (sem os trechos
     com carga), cada uma clicável pra abrir aquele trecho. */
let trechosAtuais = [];
let modoMapa = 'um';
let selecionado = 0;
let camadaMapa = null;
let mapaReqId = 0;

function garantirMapa() {
  if (mapa) return;
  mapa = L.map('mapa-vazio-pagina').setView([-14.235, -51.925], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(mapa);
  camadaMapa = L.layerGroup().addTo(mapa);
}

function limparMapa() {
  garantirMapa();
  camadaMapa.clearLayers();
  document.getElementById('mapa-legenda-atual').textContent = '—';
  document.getElementById('mapa-como-ler').innerHTML = '';
}

function linhaDaRota(rota) {
  return rota && rota.coordinates.length >= 2 ? rota.coordinates.map(([lon, lat]) => [lat, lon]) : null;
}

function marcadorNumero(latlng, numero, classe) {
  return L.marker(latlng, {
    icon: L.divIcon({ className: 'mapa-num-wrap', html: `<span class="mapa-num ${classe}">${numero}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
    zIndexOffset: 1000,
  });
}

function pontoDoMeio(linha) {
  return linha[Math.floor(linha.length / 2)];
}

function mudarModoMapa(modo) {
  modoMapa = modo;
  document.getElementById('modo-um').classList.toggle('ativo', modo === 'um');
  document.getElementById('modo-todos').classList.toggle('ativo', modo === 'todos');
  document.getElementById('mapa-navegacao').hidden = modo !== 'um';
  document.querySelectorAll('.trecho').forEach((el, i) => el.classList.toggle('destacado', modo === 'um' && i === selecionado));
  renderizarMapa();
}

function selecionarTrecho(i, rolarAteMapa) {
  if (!trechosAtuais[i]) return;
  selecionado = i;
  mudarModoMapa('um');
  if (rolarAteMapa && window.innerWidth <= 1100) {
    document.getElementById('mapa-vazio-pagina').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function navegarPara(i) {
  selecionarTrecho(i);
  const card = document.querySelectorAll('.trecho')[i];
  if (card && window.innerWidth > 1100) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function navegarTrecho(passo) {
  if (!trechosAtuais.length) return;
  selecionarTrecho((selecionado + passo + trechosAtuais.length) % trechosAtuais.length);
  const card = document.querySelectorAll('.trecho')[selecionado];
  if (card && window.innerWidth > 1100) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function renderizarMapa() {
  const meuId = ++mapaReqId;
  garantirMapa();
  document.getElementById('mapa-vazio-pagina').classList.toggle('mapa-escuro', document.body.classList.contains('dark'));
  mapa.invalidateSize();
  if (!trechosAtuais.length) { limparMapa(); return; }
  if (modoMapa === 'todos') return renderizarTodosVazios();

  const t = trechosAtuais[selecionado];
  const [rotaAntes, rotaDepois] = [
    await obterRotaRodoviaria(t.anterior.origem, t.anterior.destino),
    await obterRotaRodoviaria(t.entrega.origem, t.entrega.destino),
  ];
  if (meuId !== mapaReqId) return;
  camadaMapa.clearLayers();

  const antes = linhaDaRota(rotaAntes);
  const vazio = linhaDaRota(t.rotaVazio);
  const depois = linhaDaRota(rotaDepois);
  if (antes) L.polyline(antes, { color: COR_CARREGADO, weight: 3, opacity: 0.35 }).addTo(camadaMapa)
    .bindTooltip(`Entrega anterior #${t.anterior.id} (com carga): ${escapeHtml(t.anterior.origem)} → ${escapeHtml(t.anterior.destino)}`, { sticky: true });
  if (depois) L.polyline(depois, { color: COR_CARREGADO, weight: 4, opacity: 0.85 }).addTo(camadaMapa)
    .bindTooltip(`Próxima entrega #${t.entrega.id} (com carga): ${escapeHtml(t.entrega.origem)} → ${escapeHtml(t.entrega.destino)}`, { sticky: true });
  if (vazio) {
    L.polyline(vazio, { color: COR_VAZIO, weight: 6, dashArray: '10 9' }).addTo(camadaMapa);
    L.tooltip({ permanent: true, direction: 'top', className: 'mapa-km-rotulo', offset: [0, -8] })
      .setLatLng(pontoDoMeio(vazio)).setContent(`2 · ${fmtKm(t.km)} vazio`).addTo(camadaMapa);
    marcadorNumero(vazio[0], 1, 'num-fim').addTo(camadaMapa).bindTooltip(`Terminou a entrega #${t.anterior.id} em ${escapeHtml(t.anterior.destino)}`);
    marcadorNumero(vazio[vazio.length - 1], 3, 'num-ini').addTo(camadaMapa).bindTooltip(`Pegou a carga da entrega #${t.entrega.id} em ${escapeHtml(t.entrega.origem)}`);
  }

  // Fim do ciclo: caminhão no destino da entrega carregada (fim da linha
  // azul) — dali ele vai partir vazio de novo pra uma próxima carga.
  const entregou = t.entrega.status === 'entregue';
  let pontoFinal = depois ? depois[depois.length - 1] : null;
  if (!pontoFinal) {
    const p = await geocodificarCidade(t.entrega.destino);
    if (meuId !== mapaReqId) return;
    if (p) pontoFinal = [p.lat, p.lon];
  }
  // Enquadra o ciclo todo: do fim da entrega anterior (1) até o caminhão no
  // destino da próxima — a viagem com carga de antes (azul claro) fica só
  // como contexto, saindo pela borda.
  const foco = [...(vazio || []), ...(depois || []), ...(pontoFinal ? [pontoFinal] : [])];
  if (foco.length) mapa.fitBounds(L.latLngBounds(foco).pad(0.15), { animate: false });

  if (pontoFinal) {
    L.marker(pontoFinal, { icon: iconeCaminhaoMapa('#2E75B6', '#1E4D78'), zIndexOffset: 1100 }).addTo(camadaMapa);
    // Etiqueta embaixo do caminhão (a dos km do vazio fica em cima da linha
    // laranja, não disputam espaço); perto da borda de baixo, vai pra cima.
    const pertoDoRodape = mapa.latLngToContainerPoint(pontoFinal).y > mapa.getSize().y - 60;
    L.tooltip({ permanent: true, direction: pertoDoRodape ? 'top' : 'bottom', className: 'mapa-fim-rotulo', offset: pertoDoRodape ? [0, -16] : [0, 16] })
      .setLatLng(pontoFinal).setContent(entregou ? `Entregou em ${escapeHtml(t.entrega.destino)}` : `A caminho de ${escapeHtml(t.entrega.destino)}`).addTo(camadaMapa);
  }

  document.getElementById('mapa-legenda-atual').innerHTML =
    `<strong>Trecho ${selecionado + 1} de ${trechosAtuais.length}</strong> · ${escapeHtml(placaDo(t.entrega.veiculo_id))} · ${fmtData(dataUtc(t.entrega.iniciado_em)).slice(0, 10)}`;
  // Ciclos encadeados do mesmo caminhão: o trecho que terminou onde este
  // começou, e o que partiu de onde este terminou (se estiverem no filtro).
  const anteriorIdx = trechosAtuais.findIndex(x => x.entrega.id === t.anterior.id);
  const proximo = trechosAtuais.findIndex(x => x.anterior.id === t.entrega.id);
  document.getElementById('mapa-como-ler').innerHTML = `
    <div><span class="mapa-num num-fim">1</span><span>Terminou a entrega #${t.anterior.id} em <strong>${escapeHtml(t.anterior.destino)}</strong>${anteriorIdx >= 0 ? ` <a href="#" class="mapa-link-ciclo" onclick="event.preventDefault(); navegarPara(${anteriorIdx})">← trecho anterior</a>` : ''}</span><i class="linha-mini linha-mini-clara" title="linha azul clara: a viagem com carga que terminou aqui"></i></div>
    <div><span class="mapa-num num-vazio">2</span><span>Rodou <strong>${fmtKm(t.km)} sem carga</strong></span><i class="linha-mini linha-mini-vazio" title="linha laranja tracejada"></i></div>
    <div><span class="mapa-num num-ini">3</span><span>Carregou em <strong>${escapeHtml(t.entrega.origem)}</strong> e seguiu com carga até ${escapeHtml(t.entrega.destino)}</span><i class="linha-mini" title="linha azul"></i></div>
    <div><span class="mapa-caminhao-leg">${svgIcone('caminhao', 14)}</span><span>${entregou
      ? `Entregou em <strong>${escapeHtml(t.entrega.destino)}</strong>: fim do ciclo. Daqui o caminhão parte vazio para a próxima carga.`
      : `Ainda <strong>a caminho de ${escapeHtml(t.entrega.destino)}</strong>. Quando entregar, o ciclo recomeça.`}
      ${proximo >= 0 ? `<a href="#" class="mapa-link-ciclo" onclick="event.preventDefault(); navegarPara(${proximo})">Ver próximo trecho →</a>` : ''}</span></div>`;
  document.querySelectorAll('.trecho').forEach((el, i) => el.classList.toggle('destacado', i === selecionado));
}

function renderizarTodosVazios() {
  camadaMapa.clearLayers();
  const pontos = [];
  const rotulosFixos = trechosAtuais.length <= 8; // com muitos trechos, km só ao passar o mouse
  trechosAtuais.forEach((t, i) => {
    const vazio = linhaDaRota(t.rotaVazio);
    if (!vazio) return;
    const linha = L.polyline(vazio, { color: COR_VAZIO, weight: 6, dashArray: '10 9' }).addTo(camadaMapa);
    // Linha "invisível" mais grossa por baixo: facilita acertar o clique.
    L.polyline(vazio, { color: COR_VAZIO, weight: 18, opacity: 0 }).addTo(camadaMapa).on('click', () => selecionarTrecho(i));
    linha.on('click', () => selecionarTrecho(i));
    const rotulo = `${escapeHtml(placaDo(t.entrega.veiculo_id))}: ${fmtKm(t.km)}`;
    if (rotulosFixos) {
      // Direções alternadas: trechos vizinhos (mesma região) não empilham
      // as etiquetas uma em cima da outra.
      const direcao = ['top', 'bottom', 'right', 'left'][i % 4];
      const offset = { top: [0, -8], bottom: [0, 8], right: [10, 0], left: [-10, 0] }[direcao];
      const tip = L.tooltip({ permanent: true, direction: direcao, className: 'mapa-km-rotulo mapa-km-rotulo-clicavel', offset, interactive: true })
        .setLatLng(pontoDoMeio(vazio)).setContent(rotulo).addTo(camadaMapa);
      tip.getElement() && tip.getElement().addEventListener('click', () => selecionarTrecho(i));
    } else {
      linha.bindTooltip(rotulo, { sticky: true });
    }
    L.circleMarker(vazio[0], { radius: 5, color: '#1E4D78', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(camadaMapa);
    L.circleMarker(vazio[vazio.length - 1], { radius: 5, color: '#1E4D78', weight: 2, fillColor: '#F2A93B', fillOpacity: 1 }).addTo(camadaMapa);
    pontos.push(...vazio);
  });
  if (pontos.length) mapa.fitBounds(L.latLngBounds(pontos).pad(0.1));
  document.getElementById('mapa-como-ler').innerHTML = `
    <div><i class="linha-mini linha-mini-vazio"></i><span>Cada linha laranja é um trecho que um caminhão rodou <strong>sem carga</strong>, do ponto branco (onde terminou a entrega) ao ponto amarelo (onde pegou a próxima carga).</span></div>
    <div><span>Clique numa linha ou etiqueta para ver a história completa daquele trecho.</span></div>`;
}

/* ---------------------------------------------------------------- gráfico e dicas */
function renderizarGrafico(trechos) {
  const porPlaca = {};
  trechos.forEach(t => {
    const placa = placaDo(t.entrega.veiculo_id);
    porPlaca[placa] = (porPlaca[placa] || 0) + parseFloat(t.dv.km_vazio);
  });
  const ordenado = Object.entries(porPlaca).sort((a, b) => b[1] - a[1]);
  const escuro = document.body.classList.contains('dark');
  if (grafico) grafico.destroy();
  grafico = new Chart(document.getElementById('grafico-veiculos'), {
    type: 'bar',
    data: {
      labels: ordenado.map(([p]) => p),
      datasets: [{ data: ordenado.map(([, km]) => Math.round(km)), backgroundColor: COR_VAZIO, borderRadius: 6, maxBarThickness: 34 }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.parsed.x.toLocaleString('pt-BR')} km sem carga` } } },
      scales: {
        x: { ticks: { color: escuro ? '#9CA3AF' : '#7C8598', callback: v => `${v.toLocaleString('pt-BR')} km` }, grid: { color: escuro ? '#374151' : '#E7E9F0' } },
        y: { ticks: { color: escuro ? '#F3F4F6' : '#1E2A44', font: { weight: 600 } }, grid: { display: false } },
      },
    },
  });
}

function renderizarDicas(trechos) {
  const icone = nome => svgIcone(nome, 16);
  const dicas = [];
  if (trechos.length) {
    const maior = trechos.reduce((a, b) => (parseFloat(b.dv.km_vazio) > parseFloat(a.dv.km_vazio) ? b : a));
    const km = parseFloat(maior.dv.km_vazio);
    dicas.push({ dado: true, icone: 'caminhao', texto: `O maior trecho vazio foi de <strong>${fmtKm(km)}</strong>, de ${escapeHtml(maior.anterior.destino)} até ${escapeHtml(maior.entrega.origem)} (${escapeHtml(placaDo(maior.entrega.veiculo_id))}). Um frete de retorno saindo de ${escapeHtml(maior.anterior.destino)} teria evitado cerca de <strong>${fmtReais(custoDiesel(km))}</strong> em diesel.` });

    const contagem = {};
    trechos.forEach(t => { contagem[t.anterior.destino] = (contagem[t.anterior.destino] || 0) + 1; });
    const [cidade, vezes] = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0];
    if (vezes >= 2) {
      dicas.push({ dado: true, icone: 'local', texto: `<strong>${escapeHtml(cidade)}</strong> foi onde os caminhões mais terminaram entregas e saíram vazios (${vezes} vezes). Ter clientes ou parceiros de carga lá reduz esses trechos.` });
    }
  }
  dicas.push(
    { icone: 'relogio', texto: 'Planeje a próxima carga <strong>antes</strong> de o caminhão chegar ao destino: cadastrar a entrega seguinte com antecedência dá tempo de achar carga perto de onde ele vai estar.' },
    { icone: 'dinheiro', texto: 'Um frete de retorno mais barato quase sempre compensa mais do que voltar vazio: o diesel e o desgaste do trecho sem carga são pagos do mesmo jeito.' },
    { icone: 'check', texto: 'Acompanhe esta página todo mês. A meta é ver a <strong>barra laranja</strong> dos indicadores diminuir.' },
  );
  document.getElementById('lista-dicas').innerHTML = dicas.map(d => `
    <li><span class="dica-icone ${d.dado ? 'dica-dado' : ''}">${icone(d.icone)}</span><span>${d.texto}</span></li>`).join('');
}

/* ---------------------------------------------------------------- início */
/* Km vazio ainda não calculado (viagem antiga recém-ligada, ou rota que falhou
   na hora de entrar em rota): calcula pela estrada, do destino da viagem
   anterior até a origem desta, e grava — igual a calcularESalvarKmVazio. */
async function calcularKmPendentes() {
  const pendentes = deslocamentos.filter(dv => dv.km_vazio == null && dv.entrega_anterior_id);
  if (!pendentes.length) return;
  const aviso = document.getElementById('vazio-calculando');
  if (aviso) { aviso.hidden = false; aviso.textContent = `Calculando o km vazio de ${pendentes.length} viagem(ns) antiga(s)...`; }
  for (const dv of pendentes) {
    const entrega = entregas.find(e => e.id === dv.entrega_id);
    const anterior = entregas.find(e => e.id === dv.entrega_anterior_id);
    if (!entrega || !anterior) continue;
    const rota = await obterRotaRodoviaria(anterior.destino, entrega.origem);
    if (rota == null) continue;
    const km = Math.round(rota.distanceKm * 10) / 10;
    try {
      const res = await put(`/deslocamentos-vazios/${dv.entrega_id}`, { km_vazio: km });
      if (res && !res.detail) dv.km_vazio = km;
    } catch (e) { /* fica para a próxima abertura da tela */ }
  }
  if (aviso) aviso.hidden = true;
}

async function iniciar() {
  let consumo = CONSUMO_PADRAO_KM_L;
  try { consumo = parseFloat(localStorage.getItem('vazio_consumo_km_l')) || CONSUMO_PADRAO_KM_L; } catch (e) { /* padrão */ }
  document.getElementById('consumo-km-l').value = consumo;

  // Viagens antigas (lançadas antes do vazio existir) ganham o vínculo com a
  // viagem anterior do mesmo veículo; o km de cada uma é calculado logo abaixo.
  try { await post('/deslocamentos-vazios/sincronizar', {}); } catch (e) { /* segue com o que já existe */ }

  [entregas, veiculos, motoristas, abastecimentos, deslocamentos] = await Promise.all([
    get('/entregas'), get('/veiculos'), get('/motoristas'), get('/abastecimentos'), get('/deslocamentos-vazios'),
  ]).then(r => r.map(x => x || []));

  const litros = abastecimentos.reduce((s, a) => s + (parseFloat(a.litros) || 0), 0);
  const valor = abastecimentos.reduce((s, a) => s + (parseFloat(a.valor_total) || 0), 0);
  precoDieselMedio = litros > 0 ? valor / litros : null;

  await calcularKmPendentes();

  const sel = document.getElementById('filtro-veiculo');
  const comVazio = new Set(deslocamentos.map(dv => (entregas.find(e => e.id === dv.entrega_id) || {}).veiculo_id));
  veiculos.filter(v => comVazio.has(v.id)).sort((a, b) => a.placa.localeCompare(b.placa)).forEach(v => {
    sel.insertAdjacentHTML('beforeend', `<option value="${v.id}">${escapeHtml(v.placa)} — ${escapeHtml(v.modelo || '')}</option>`);
  });

  atualizarTela();
}
iniciar();
