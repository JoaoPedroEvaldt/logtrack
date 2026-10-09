/* Mapa da frota (mapa-frota.html): todos os caminhões (cavalos) no mapa, onde
   estão agora. Clicar num caminhão abre a viagem dele — trajeto já feito,
   trajeto que falta, motorista, frete e chegada estimada.

   De onde vem a posição: enquanto não há rastreador integrado, ela é
   ESTIMADA — em viagem, o ponto do trajeto rodoviário (OSRM) proporcional ao
   tempo desde a saída sobre o tempo total estimado para caminhão (mesma
   conta do modal de Rota); parado, a cidade onde descarregou por último.
   A integração com o rastreador (Onixsat) entra em posicaoDoRastreador():
   quando ela devolver uma posição, essa passa a valer no lugar da estimativa. */
checarAuth();
checarStaff();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';

const COR_ESTADO = { viagem: '#2E75B6', destino: '#8E44AD', alerta: '#E67E22', disponivel: '#27AE60', manutencao: '#8E99AD' };
const ROTULO_ESTADO = { viagem: 'Em viagem', destino: 'No destino', alerta: 'Atenção', disponivel: 'Disponível', manutencao: 'Em manutenção' };
// STATUS_EM_VIAGEM / emViagem() vêm do api.js (mesma regra no sistema todo).
const ATUALIZAR_A_CADA_MS = 60 * 1000;

let mapaFrota = null;
let camadaCaminhoes = null;
let camadaFoco = null;
let caminhoes = [];          // um item por cavalo, ver montarCaminhoes()
let selecionadoId = null;

/* Gancho para o rastreador: devolver { lat, lon, atualizadoEm } quando a
   API do Onixsat estiver configurada. Enquanto devolver null, vale a estimativa. */
async function posicaoDoRastreador(veiculo) { // eslint-disable-line no-unused-vars
  return null;
}

function reais(v) {
  return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const FMT_CURTO = { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' };

/* ===================== DADOS ===================== */
async function carregar() {
  const [veiculos, entregas, conjuntos, manutencoes, motoristas] = await Promise.all([
    get('/veiculos'), get('/entregas'), get('/conjuntos'), get('/manutencoes'), get('/motoristas')
  ]);
  const nomeMotorista = new Map((motoristas || []).map(m => [m.id, m.nome]));
  caminhoes = await montarCaminhoes(veiculos || [], entregas || [], conjuntos || [], manutencoes || [], nomeMotorista);
  renderizarResumo();
  renderizarLista();
  desenharCaminhoes();
  if (selecionadoId && caminhoes.some(c => c.id === selecionadoId)) selecionar(selecionadoId, false);
  else enquadrarTodos();
}

async function montarCaminhoes(veiculos, entregas, conjuntos, manutencoes, nomeMotorista) {
  const cavalos = veiculos.filter(v => v.tipo === 'cavalo');
  const lista = [];
  for (const v of cavalos) {
    const conjunto = conjuntos.find(c => c.cavalo_id === v.id) || null;
    const doVeiculo = entregas.filter(e => e.veiculo_id === v.id && e.status !== 'cancelado');
    const viagem = doVeiculo.find(e => STATUS_EM_VIAGEM.includes(e.status) && e.iniciado_em) || null; // só viagem que já saiu tem posição
    const ultima = doVeiculo.filter(e => e.status === 'entregue' && e.concluido_em)
      .sort((a, b) => dataUtc(b.concluido_em) - dataUtc(a.concluido_em))[0] || null;
    const proxima = doVeiculo.filter(e => e.status === 'aguardando')
      .sort((a, b) => new Date(a.saida_prevista || a.previsao) - new Date(b.saida_prevista || b.previsao))[0] || null;
    // Revisão só agendada para daqui a uns dias não tira o caminhão da estrada.
    const hojeISO = dataLocalISO(new Date());
    const manutencao = manutencoes.find(m => m.veiculo_id === v.id &&
      (m.status === 'em_andamento' || (m.status === 'agendada' && m.data_manutencao <= hojeISO))) || null;
    const motoristaId = (viagem && viagem.motorista_id) || (conjunto && conjunto.motorista_id) || null;
    const placas = conjunto
      ? [conjunto.cavalo, conjunto.semirreboque1, conjunto.semirreboque2].filter(Boolean).map(x => x.placa).join(' / ')
      : v.placa;

    const c = {
      id: v.id, veiculo: v, conjunto, placas, viagem, ultima, proxima, manutencao,
      motoristaId, motorista: motoristaId ? nomeMotorista.get(motoristaId) : null,
      estado: 'disponivel', posicao: null, cidade: null, rota: null, frac: 0, chegada: null, fonte: 'estimativa',
    };

    if (!viagem) {
      c.estado = manutencao ? 'manutencao' : 'disponivel';
      c.cidade = ultima ? ultima.destino : (proxima ? proxima.origem : null);
    }
    lista.push(c);
  }

  // Todos ao mesmo tempo, e cada um por conta própria: um caminhão com
  // cidade que não se acha no mapa, ou o serviço de rotas fora do ar, deixa
  // só aquele sem posição — nunca a tela inteira presa em "carregando".
  await Promise.all(lista.map(c => comLimiteDeTempo(localizar(c), 20000).catch(() => {})));
  lista.filter(c => c.viagem).forEach(definirEstadoViagem);
  const ordem = { destino: 0, alerta: 1, viagem: 2, disponivel: 3, manutencao: 4 };
  return lista.sort((a, b) => ordem[a.estado] - ordem[b.estado] || a.veiculo.placa.localeCompare(b.veiculo.placa));
}

/* Depende da chegada estimada (calculada em localizar), por isso vem depois.
   Pela estimativa já chegou: "No destino", esperando alguém confirmar a
   entrega — não é atraso, a previsão do cliente costuma ser essa mesma
   chegada. Laranja só com ocorrência/atraso marcado, ou passou da previsão
   ainda no meio do caminho. */
function definirEstadoViagem(c) {
  const agora = new Date();
  if (c.viagem.status !== 'em_rota') c.estado = 'alerta';
  else if (c.chegada && agora >= c.chegada) c.estado = 'destino';
  else if (agora > new Date(c.viagem.previsao)) c.estado = 'alerta';
  else c.estado = 'viagem';
}

function comLimiteDeTempo(promessa, ms) {
  return Promise.race([promessa, new Promise((_, rejeita) => setTimeout(() => rejeita(new Error('tempo esgotado')), ms))]);
}

async function localizar(c) {
  if (c.viagem) {
    await calcularPosicaoEmViagem(c);
  } else if (c.cidade) {
    const ponto = await geocodificarCidade(c.cidade);
    if (ponto) c.posicao = [ponto.lat, ponto.lon];
  }
  const rastreador = await posicaoDoRastreador(c.veiculo);
  if (rastreador) {
    c.posicao = [rastreador.lat, rastreador.lon];
    c.fonte = 'rastreador';
    c.atualizadoEm = rastreador.atualizadoEm;
  }
}

/* Mesma estimativa do modal de Rota (entregas.js): trajeto rodoviário, tempo
   de caminhão com as paradas da Lei do Motorista, fração pelo tempo decorrido. */
async function calcularPosicaoEmViagem(c) {
  const e = c.viagem;
  const vias = Array.isArray(e.rota_via) ? e.rota_via : [];
  const rota = await obterRotaRodoviaria(e.origem, e.destino, vias);
  if (!rota || !rota.coordinates.length) {
    const ponto = await geocodificarCidade(e.origem);
    if (ponto) c.posicao = [ponto.lat, ponto.lon];
    c.cidade = e.origem;
    return;
  }
  const ufs = await ufsAoLongoDaRota(rota.coordinates);
  const est = estimarViagemCaminhao(rota, ufs);
  const saida = dataUtc(e.iniciado_em);
  c.rota = { coordenadas: rota.coordinates.map(([lon, lat]) => [lat, lon]), km: rota.distanceKm, est };
  c.chegada = new Date(saida.getTime() + est.totalH * 3600 * 1000);
  atualizarFracao(c);
}

function atualizarFracao(c) {
  if (!c.rota) return;
  const saida = dataUtc(c.viagem.iniciado_em);
  c.frac = Math.max(0, Math.min(0.99, (Date.now() - saida.getTime()) / (c.rota.est.totalH * 3600 * 1000)));
  if (c.fonte === 'estimativa') c.posicao = pontoNaLinha(c.rota.coordenadas, c.frac);
}

/* Corta o trajeto no ponto que corresponde à fração da DISTÂNCIA (igual ao
   pontoNaLinha) — devolve [parte percorrida, parte que falta]. */
function dividirLinha(coords, frac) {
  const km = (a, b) => distanciaHaversineKm({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] });
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) total += km(coords[i], coords[i + 1]);
  let alvo = total * frac;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = km(coords[i], coords[i + 1]);
    if (alvo <= d) {
      const t = d > 0 ? alvo / d : 0;
      const p = [coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t, coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t];
      return [[...coords.slice(0, i + 1), p], [p, ...coords.slice(i + 1)]];
    }
    alvo -= d;
  }
  return [coords, [coords[coords.length - 1]]];
}

/* ===================== MAPA ===================== */
function garantirMapa() {
  if (mapaFrota) return;
  mapaFrota = L.map('frota-mapa', { zoomControl: true }).setView([-22, -50], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(mapaFrota);
  camadaFoco = L.layerGroup().addTo(mapaFrota);
  camadaCaminhoes = L.layerGroup().addTo(mapaFrota);
  mapaFrota.on('zoomend', () => { if (caminhoes.length) desenharCaminhoes(); });
  document.getElementById('frota-mapa').classList.toggle('mapa-escuro', document.body.classList.contains('dark'));
}

function iconeFrota(c, pilha = 0) {
  const cor = COR_ESTADO[c.estado];
  const selecionado = c.id === selecionadoId ? ' selecionado' : '';
  return L.divIcon({
    className: 'frota-marcador-wrap',
    html: `<div class="frota-marcador${selecionado}" style="--cor:${cor}">
             <span class="frota-marcador-icone">${svgIcone('caminhao', 16)}</span>
             <span class="frota-marcador-placa">${escapeHtml(c.veiculo.placa)}</span>
           </div>`,
    iconSize: null,
    // pilha: marcadores que se encostariam na tela sobem 34px cada (ver posicoesDesenho).
    iconAnchor: [18, 18 + pilha * 34],
  });
}

/* Caminhões na mesma cidade (ou em cidades vizinhas, no zoom do país
   inteiro) ficariam um escondendo o outro. Pelo ponto de cada um NA TELA,
   sobe o marcador um "andar" (34px) até não encostar em nenhum já posto —
   devolve o andar de cada caminhão. Recalculado a cada zoom. */
const LARGURA_MARCADOR_PX = 112;
const ALTURA_MARCADOR_PX = 34;

function posicoesDesenho() {
  const postos = []; // { x, y } do canto de cada marcador já posicionado
  const resultado = new Map();
  caminhoes.filter(c => c.posicao).forEach(c => {
    const p = mapaFrota.latLngToContainerPoint(c.posicao);
    let andar = 0;
    while (andar < 8 && postos.some(o =>
      Math.abs(o.x - p.x) < LARGURA_MARCADOR_PX && Math.abs(o.y - (p.y - andar * ALTURA_MARCADOR_PX)) < ALTURA_MARCADOR_PX)) {
      andar++;
    }
    postos.push({ x: p.x, y: p.y - andar * ALTURA_MARCADOR_PX });
    resultado.set(c.id, andar);
  });
  return resultado;
}

function desenharCaminhoes() {
  garantirMapa();
  camadaCaminhoes.clearLayers();
  const desenho = posicoesDesenho();
  caminhoes.filter(c => c.posicao).forEach(c => {
    const m = L.marker(c.posicao, { icon: iconeFrota(c, desenho.get(c.id)), zIndexOffset: c.id === selecionadoId ? 1000 : 0, title: c.veiculo.placa });
    m.on('click', () => selecionar(c.id));
    m.addTo(camadaCaminhoes);
    c.marcador = m;
  });
}

function enquadrarTodos() {
  const pontos = caminhoes.filter(c => c.posicao).map(c => c.posicao);
  if (pontos.length) mapaFrota.fitBounds(L.latLngBounds(pontos), { padding: [50, 50], maxZoom: 7 });
}

function mostrarTodos() {
  selecionadoId = null;
  camadaFoco.clearLayers();
  document.getElementById('frota-detalhe').hidden = true;
  document.getElementById('frota-lista').hidden = false;
  document.getElementById('frota-btn-todos').hidden = true;
  document.getElementById('frota-lateral-titulo').textContent = 'Caminhões';
  desenharCaminhoes();
  enquadrarTodos();
}

function selecionar(id, enquadrar = true) {
  const c = caminhoes.find(x => x.id === id);
  if (!c) return;
  selecionadoId = id;
  desenharCaminhoes();
  camadaFoco.clearLayers();
  const escuro = document.body.classList.contains('dark');

  if (c.rota) {
    // Trajeto já percorrido (cheio) e o que falta (tracejado).
    const coords = c.rota.coordenadas;
    const [feito, falta] = dividirLinha(coords, c.frac);
    L.polyline(feito, { color: COR_ESTADO[c.estado], weight: 5, opacity: 0.9 }).addTo(camadaFoco);
    L.polyline(falta, { color: escuro ? '#9CA3AF' : '#5B6478', weight: 4, opacity: 0.8, dashArray: '8 8' }).addTo(camadaFoco);
    L.circleMarker(coords[0], { radius: 7, color: '#1E4D78', weight: 2, fillColor: '#fff', fillOpacity: 1 })
      .addTo(camadaFoco).bindTooltip(`Carregou: ${escapeHtml(c.viagem.origem)}`);
    L.marker(coords[coords.length - 1]).addTo(camadaFoco).bindTooltip(`Destino: ${escapeHtml(c.viagem.destino)}`);
    if (enquadrar) mapaFrota.fitBounds(L.latLngBounds(coords), { padding: [40, 40] });
  } else if (c.posicao && enquadrar) {
    mapaFrota.setView(c.posicao, 9);
  }

  document.getElementById('frota-lista').hidden = true;
  document.getElementById('frota-btn-todos').hidden = false;
  document.getElementById('frota-lateral-titulo').textContent = c.veiculo.placa;
  const det = document.getElementById('frota-detalhe');
  det.hidden = false;
  det.innerHTML = htmlDetalhe(c);
}

/* ===================== PAINEL LATERAL ===================== */
function textoSituacao(c) {
  if (c.viagem) {
    const pct = Math.round(c.frac * 100);
    const extra = c.viagem.status === 'ocorrencia' ? ' · ocorrência aberta'
      : (c.estado === 'alerta' ? ' · atrasado' : (c.estado === 'destino' ? ' · confirmar entrega' : ''));
    return `${pct}% do trajeto · ${escapeHtml(c.viagem.origem)} → ${escapeHtml(c.viagem.destino)}${extra}`;
  }
  if (c.manutencao) return `Parado em manutenção (${escapeHtml(c.manutencao.tipo)})${c.cidade ? ' · ' + escapeHtml(c.cidade) : ''}`;
  if (c.proxima) return `Aguardando carga em ${escapeHtml(c.cidade || c.proxima.origem)}`;
  return c.cidade ? `Parado em ${escapeHtml(c.cidade)}` : 'Sem posição conhecida';
}

function renderizarResumo() {
  const conta = estado => caminhoes.filter(c => c.estado === estado).length;
  const card = (estado, valor, rotulo) => `
    <div class="frota-kpi" style="--cor:${COR_ESTADO[estado]}">
      <strong>${valor}</strong><span>${rotulo}</span>
    </div>`;
  document.getElementById('frota-resumo').innerHTML =
    card('viagem', conta('viagem'), 'em viagem') +
    card('destino', conta('destino'), 'no destino') +
    card('alerta', conta('alerta'), 'atrasado / ocorrência') +
    card('disponivel', conta('disponivel'), 'disponíveis') +
    card('manutencao', conta('manutencao'), 'em manutenção');
  const algumRastreado = caminhoes.some(c => c.fonte === 'rastreador');
  document.getElementById('frota-fonte').innerHTML = algumRastreado
    ? `${svgIcone('local', 12)} Posição do rastreador`
    : `${svgIcone('info', 12)} Posição estimada pela rota planejada e pelo horário de saída · atualiza a cada minuto`;
}

function renderizarLista() {
  const el = document.getElementById('frota-lista');
  if (!caminhoes.length) {
    el.innerHTML = estadoVazio(null, 'Nenhum cavalo mecânico cadastrado', 'Cadastre os caminhões na tela de Veículos.', 'caminhao');
    return;
  }
  // div (não <button>): o item tem o botão "Entregue" dentro, e botão dentro de botão não vale.
  el.innerHTML = caminhoes.map(c => `
    <div class="frota-item" role="button" tabindex="0" onclick="selecionar(${c.id})"
         onkeydown="if (event.key === 'Enter') selecionar(${c.id})" style="--cor:${COR_ESTADO[c.estado]}">
      <span class="frota-item-icone">${svgIcone('caminhao', 18)}</span>
      <span class="frota-item-texto">
        <strong>${escapeHtml(c.veiculo.placa)}${c.motorista ? ` · ${escapeHtml(c.motorista)}` : ''}</strong>
        <span>${textoSituacao(c)}</span>
        ${c.viagem ? `<span class="frota-barra"><i style="width:${Math.round(c.frac * 100)}%"></i></span>` : ''}
      </span>
      ${c.estado === 'destino'
        ? `<button class="btn btn-primary frota-btn-entregue" onclick="event.stopPropagation(); encerrarViagem(${c.id})">${svgIcone('check', 13)} Entregue</button>`
        : `<span class="frota-item-estado">${ROTULO_ESTADO[c.estado]}</span>`}
    </div>`).join('');
}

function htmlDetalhe(c) {
  const linha = (rotulo, valor) => valor ? `<div class="frota-det-linha"><span>${rotulo}</span><strong>${valor}</strong></div>` : '';
  const motoristaLink = c.motoristaId
    ? `<a class="link-ficha" href="motorista-ficha.html?id=${c.motoristaId}">${escapeHtml(c.motorista || 'Motorista')}</a>` : '—';
  let viagemHtml = '';
  if (c.viagem) {
    const e = c.viagem;
    viagemHtml = `
      <div class="frota-det-bloco" style="--cor:${COR_ESTADO[c.estado]}">
        <div class="frota-det-rota">
          <div><span>Carregou em</span><strong>${escapeHtml(e.origem)}</strong></div>
          <div class="frota-det-seta">→</div>
          <div><span>Destino</span><strong>${escapeHtml(e.destino)}</strong></div>
        </div>
        <div class="frota-barra frota-barra-grande"><i style="width:${Math.round(c.frac * 100)}%"></i></div>
        <div class="frota-det-pct">${Math.round(c.frac * 100)}% do trajeto${c.rota ? ` · faltam ~${Math.round(c.rota.km * (1 - c.frac)).toLocaleString('pt-BR')} km` : ''}</div>
        ${linha('Entrega', `#${e.id} · ${escapeHtml(e.cliente)}`)}
        ${linha('Carga', e.descricao_carga ? escapeHtml(e.descricao_carga) : '')}
        ${linha('Frete', e.valor_frete ? reais(parseFloat(e.valor_frete)) : '')}
        ${linha('Saiu em', dataUtc(e.iniciado_em).toLocaleString('pt-BR', FMT_CURTO))}
        ${linha('Chegada estimada', c.chegada ? c.chegada.toLocaleString('pt-BR', FMT_CURTO) : '')}
        ${linha('Previsão do cliente', new Date(e.previsao).toLocaleString('pt-BR', FMT_CURTO))}
        ${linha('Situação', badgeStatus(e.status))}
      </div>`;
  } else {
    viagemHtml = `
      <div class="frota-det-bloco">
        ${linha('Onde está', c.cidade ? escapeHtml(c.cidade) : 'Sem posição conhecida')}
        ${c.manutencao ? linha('Manutenção', `${escapeHtml(c.manutencao.tipo)} desde ${formatarData(c.manutencao.data_manutencao)}`) : ''}
        ${c.ultima ? linha('Última entrega', `#${c.ultima.id} · ${escapeHtml(c.ultima.origem)} → ${escapeHtml(c.ultima.destino)} (${dataUtc(c.ultima.concluido_em).toLocaleDateString('pt-BR')})`) : ''}
        ${c.proxima ? linha('Próxima carga', `#${c.proxima.id} · ${escapeHtml(c.proxima.origem)} → ${escapeHtml(c.proxima.destino)}${c.proxima.saida_prevista ? ` · sai ${new Date(c.proxima.saida_prevista).toLocaleString('pt-BR', FMT_CURTO)}` : ''}`) : ''}
      </div>`;
  }
  return `
    <div class="frota-det-topo" style="--cor:${COR_ESTADO[c.estado]}">
      <span class="frota-item-icone">${svgIcone('caminhao', 22)}</span>
      <div>
        <strong>${escapeHtml(c.placas)}</strong>
        <span>${escapeHtml(c.veiculo.marca)} ${escapeHtml(c.veiculo.modelo)}${c.conjunto ? ' · ' + escapeHtml(c.conjunto.nome) : ''}</span>
      </div>
      <span class="frota-item-estado">${ROTULO_ESTADO[c.estado]}</span>
    </div>
    ${linha('Motorista', motoristaLink)}
    ${viagemHtml}
    <div class="frota-det-acoes">
      ${c.viagem ? `<button class="btn btn-primary" onclick="encerrarViagem(${c.id})">${svgIcone('check', 14)} Confirmar entrega</button>` : ''}
      ${c.motoristaId ? `<a class="btn btn-outline" href="entregas.html?motorista=${c.motoristaId}">${svgIcone('local', 14)} Rotograma</a>` : ''}
      ${c.motoristaId ? `<a class="btn btn-outline" href="motorista-ficha.html?id=${c.motoristaId}">${svgIcone('usuario', 14)} Ficha</a>` : ''}
    </div>
    <p class="frota-det-nota">${c.fonte === 'rastreador' ? 'Posição informada pelo rastreador.' : 'Posição estimada: ponto da rota proporcional ao tempo desde a saída (não considera trânsito nem paradas fora do plano).'}</p>`;
}

/* ===================== ENCERRAR VIAGEM ===================== */
/* Mesmo PUT /status que a tela de Entregas usa ao escolher "Entregue": a data
   de entrega fica a de agora. O caminhão vira "Disponível" na cidade de destino. */
async function encerrarViagem(id) {
  const c = caminhoes.find(x => x.id === id);
  if (!c || !c.viagem) return;
  const e = c.viagem;
  const ok = await confirmarAcao(
    `Confirmar a entrega #${e.id} (${e.origem} → ${e.destino}) do ${c.veiculo.placa}? A data de entrega fica a de agora.`,
    { titulo: 'Encerrar viagem', textoConfirmar: 'Confirmar entrega', perigo: false });
  if (!ok) return;
  const res = await put(`/entregas/${e.id}/status?status=entregue`, {});
  if (res.detail) { toastErro('Erro: ' + extrairErro(res)); return; }
  toastSucesso(`Entrega #${e.id} concluída — ${c.veiculo.placa} disponível em ${e.destino}.`);
  await carregarComAviso();
}

/* ===================== ATUALIZAÇÃO ===================== */
function avancarPosicoes() {
  caminhoes.forEach(atualizarFracao);
  caminhoes.filter(c => c.viagem).forEach(definirEstadoViagem);
  renderizarResumo();
  renderizarLista();
  if (selecionadoId) selecionar(selecionadoId, false); else desenharCaminhoes();
}

/* Nunca deixa a tela presa em "Localizando caminhões...": se algo falhar,
   diz o que fazer (o caso mais comum foi o navegador com um arquivo antigo
   em cache logo depois de uma atualização do sistema). */
function carregarComAviso() {
  return carregar().catch(erro => {
    console.error(erro);
    if (caminhoes.length) return; // já tinha um mapa na tela: mantém
    document.getElementById('frota-lista').innerHTML = estadoVazio(null,
      'Não foi possível montar o mapa agora',
      'Atualize a página (Ctrl + F5). Se continuar, confira a internet — as rotas vêm de um serviço externo.', 'alerta');
  });
}

garantirMapa();
carregarComAviso();
setInterval(avancarPosicoes, ATUALIZAR_A_CADA_MS);
setInterval(carregarComAviso, 10 * ATUALIZAR_A_CADA_MS);
