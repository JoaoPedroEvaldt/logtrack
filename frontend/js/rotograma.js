/* Rotograma do motorista (tela de Entregas): ao filtrar um motorista, mostra
   as viagens dele em sequência — onde carregou, onde descarregou, os km com
   carga de cada viagem e os km vazios entre descarregar uma e carregar a
   próxima — e um mapa com todo o trajeto (azul = carregado, laranja tracejado
   = vazio). Clicar numa viagem destaca o trajeto e o valor dela no mapa.

   Usa as variáveis de entregas.js (motoristasCompletos, veiculosCompletos,
   mapaConjuntoPorMotorista) e é chamado por filtrar(). Km com carga: o
   planejado no cadastro (distancia_km) ou a rota calculada; km vazio: o
   registrado em deslocamentos_vazios ou, se não houver, a rota calculada. */

const ROT_COR_CARREGADO = '#2E75B6';
const ROT_COR_VAZIO = '#E67E22';

let rotDeslocamentos = null;
let rotMapa = null;
let rotCamada = null;
let rotViagens = [];
let rotSelecionada = null;
let rotRenderId = 0;

function rotFmtKm(km) {
  return km == null ? '…' : `${Math.round(km).toLocaleString('pt-BR')} km`;
}

function rotFmtReais(v) {
  return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* Ordem das viagens: quando saiu de fato; senão a saída planejada; senão a previsão. */
function rotDataReferencia(e) {
  return dataUtc(e.iniciado_em) || (e.saida_prevista ? new Date(e.saida_prevista) : new Date(e.previsao));
}

async function atualizarRotograma(lista, motoristaId) {
  const secao = document.getElementById('rotograma');
  const meuId = ++rotRenderId;
  if (!motoristaId) {
    secao.hidden = true;
    return;
  }
  secao.hidden = false;

  if (rotDeslocamentos === null) {
    rotDeslocamentos = await get('/deslocamentos-vazios') || [];
    if (meuId !== rotRenderId) return;
  }

  const viagens = lista.filter(e => e.status !== 'cancelado').sort((a, b) => rotDataReferencia(a) - rotDataReferencia(b));
  rotViagens = viagens.map((e, i) => ({ e, anterior: i > 0 ? viagens[i - 1] : null, kmCarga: null, kmVazio: null, rotaCarga: null, rotaVazio: null }));
  rotSelecionada = null;

  rotRenderizarCabecalho(motoristaId, viagens.length);
  rotRenderizarParadas();
  rotRenderizarKpis();
  rotGarantirMapa();
  rotCamada.clearLayers();
  if (!viagens.length) return;

  // Uma rota por vez (limite do OSRM público); ficam em cache no navegador.
  for (const v of rotViagens) {
    const vias = Array.isArray(v.e.rota_via) ? v.e.rota_via : [];
    v.rotaCarga = await obterRotaRodoviaria(v.e.origem, v.e.destino, vias);
    v.kmCarga = v.e.distancia_km != null ? parseFloat(v.e.distancia_km) : (v.rotaCarga ? v.rotaCarga.distanceKm : null);
    if (v.anterior) {
      v.rotaVazio = await obterRotaRodoviaria(v.anterior.destino, v.e.origem);
      const dv = rotDeslocamentos.find(d => d.entrega_id === v.e.id && d.entrega_anterior_id === v.anterior.id);
      v.kmVazio = dv && dv.km_vazio != null ? parseFloat(dv.km_vazio) : (v.rotaVazio ? v.rotaVazio.distanceKm : null);
    }
    if (meuId !== rotRenderId) return;
    rotRenderizarParadas();
    rotRenderizarKpis();
  }
  rotDesenharMapa();
}

function rotRenderizarCabecalho(motoristaId, total) {
  const m = motoristasCompletos.find(x => String(x.id) === String(motoristaId));
  document.getElementById('rotograma-titulo').textContent = m ? m.nome : `Motorista #${motoristaId}`;

  const partes = [];
  const vinculo = mapaConjuntoPorMotorista[motoristaId];
  if (vinculo) {
    const cavalo = veiculosCompletos.find(v => v.id === vinculo.veiculoId);
    const placaNoNome = cavalo && vinculo.conjuntoNome.includes(cavalo.placa);
    partes.push(`${vinculo.conjuntoNome}${cavalo && !placaNoNome ? ` (${cavalo.placa})` : ''}`);
  }
  const inicio = document.getElementById('filtro-data-inicio').value;
  const fim = document.getElementById('filtro-data-fim').value;
  if (inicio || fim) partes.push(`${inicio ? formatarData(inicio) : 'início'} a ${fim ? formatarData(fim) : 'hoje'}`);
  partes.push(`${total} viage${total === 1 ? 'm' : 'ns'}`);
  document.getElementById('rotograma-sub').textContent = partes.join(' · ');
}

function rotRenderizarKpis() {
  const carregado = rotViagens.reduce((s, v) => s + (v.kmCarga || 0), 0);
  const vazio = rotViagens.reduce((s, v) => s + (v.kmVazio || 0), 0);
  const total = carregado + vazio;
  const frete = rotViagens.reduce((s, v) => s + (parseFloat(v.e.valor_frete) || 0), 0);
  document.getElementById('rot-km-total').textContent = rotFmtKm(total);
  document.getElementById('rot-km-carregado').textContent = rotFmtKm(carregado);
  document.getElementById('rot-km-vazio').textContent = rotFmtKm(vazio);
  document.getElementById('rot-km-vazio-pct').textContent = total > 0 ? `${(vazio / total * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do total` : '';
  document.getElementById('rot-frete').textContent = rotFmtReais(frete);
}

function rotRenderizarParadas() {
  const el = document.getElementById('rotograma-paradas');
  if (!rotViagens.length) {
    el.innerHTML = '<div class="vazio-estado-vazio">Nenhuma viagem deste motorista no período.<br>Ajuste as datas do filtro.</div>';
    return;
  }
  el.innerHTML = rotViagens.map((v, i) => {
    const e = v.e;
    const data = rotDataReferencia(e).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const det = `Viagem ${i + 1} · ${data} · ${e.valor_frete != null ? rotFmtReais(parseFloat(e.valor_frete)) : 'sem valor'} · ${escapeHtml(e.cliente)}`;
    const vazioAntes = v.anterior ? `
      <div class="rot-trecho rot-trecho-vazio">
        <strong>${v.kmVazio === 0 ? 'Carregou na mesma cidade' : rotFmtKm(v.kmVazio)}</strong>
        ${v.kmVazio === 0 ? '' : `vazio · indo carregar a viagem ${i + 1}`}
      </div>` : '';
    return `${vazioAntes}
      <article class="rot-viagem${rotSelecionada === i ? ' selecionada' : ''}" onclick="rotogramaSelecionar(${i})" title="Clique para ver esta viagem no mapa">
        <div class="rot-parada">
          <span class="mapa-num num-ini">${i * 2 + 1}</span>
          <div class="rot-parada-info">
            <div class="rot-cidade">${escapeHtml(e.origem)} <span class="rot-tag rot-tag-carga">Carrega</span></div>
            <div class="rot-det">${det}</div>
          </div>
        </div>
        <div class="rot-trecho rot-trecho-carregado"><strong>${rotFmtKm(v.kmCarga)}</strong> carregado</div>
        <div class="rot-parada">
          <span class="mapa-num">${i * 2 + 2}</span>
          <div class="rot-parada-info">
            <div class="rot-cidade">${escapeHtml(e.destino)} <span class="rot-tag rot-tag-descarga">Descarrega</span></div>
            <div class="rot-det">${badgeStatus(e.status)}</div>
          </div>
        </div>
        <div class="rot-acoes">
          <button type="button" class="btn btn-outline btn-mini" onclick="event.stopPropagation(); abrirModalRota(${e.id})">${svgIcone('caminhao', 12)} Rota detalhada</button>
        </div>
      </article>`;
  }).join('');
}

/* ---------------------------------------------------------------- mapa */
function rotGarantirMapa() {
  if (!rotMapa) {
    rotMapa = L.map('rotograma-mapa').setView([-14.235, -51.925], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(rotMapa);
    rotCamada = L.layerGroup().addTo(rotMapa);
  }
  document.getElementById('rotograma-mapa').classList.toggle('mapa-escuro', document.body.classList.contains('dark'));
  rotMapa.invalidateSize();
}

function rotLinha(rota) {
  return rota && rota.coordinates && rota.coordinates.length >= 2 ? rota.coordinates.map(([lon, lat]) => [lat, lon]) : null;
}

function rotMarcador(latlng, numero, classe, opacidade) {
  return L.marker(latlng, {
    icon: L.divIcon({ className: 'mapa-num-wrap', html: `<span class="mapa-num ${classe}">${numero}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
    zIndexOffset: 1000,
    opacity: opacidade,
  });
}

function rotDesenharMapa() {
  rotGarantirMapa();
  rotCamada.clearLayers();
  const focoTodas = [];
  const focoSelecionada = [];

  rotViagens.forEach((v, i) => {
    const ativa = rotSelecionada === null || rotSelecionada === i;
    const destaque = rotSelecionada === i;
    const carga = rotLinha(v.rotaCarga);
    const vazio = rotLinha(v.rotaVazio);

    if (vazio) {
      L.polyline(vazio, { color: ROT_COR_VAZIO, weight: destaque ? 5 : 4, dashArray: '9 8', opacity: ativa ? 0.95 : 0.2 })
        .addTo(rotCamada).bindTooltip(`${rotFmtKm(v.kmVazio)} vazio · ${escapeHtml(v.anterior.destino)} → ${escapeHtml(v.e.origem)}`, { sticky: true });
      focoTodas.push(...vazio);
      if (destaque) focoSelecionada.push(...vazio);
    }
    if (carga) {
      const linha = L.polyline(carga, { color: ROT_COR_CARREGADO, weight: destaque ? 6 : 4, opacity: ativa ? 0.9 : 0.2 }).addTo(rotCamada);
      // Linha invisível mais grossa por baixo: facilita acertar o clique.
      L.polyline(carga, { weight: 16, opacity: 0 }).addTo(rotCamada).on('click', () => rotogramaSelecionar(i));
      linha.on('click', () => rotogramaSelecionar(i));
      linha.bindTooltip(`Viagem ${i + 1}: ${escapeHtml(v.e.origem)} → ${escapeHtml(v.e.destino)}`, { sticky: true });
      rotMarcador(carga[0], i * 2 + 1, 'num-ini', ativa ? 1 : 0.35).addTo(rotCamada).on('click', () => rotogramaSelecionar(i));
      rotMarcador(carga[carga.length - 1], i * 2 + 2, '', ativa ? 1 : 0.35).addTo(rotCamada).on('click', () => rotogramaSelecionar(i));
      focoTodas.push(...carga);
      if (destaque) {
        focoSelecionada.push(...carga);
        L.tooltip({ permanent: true, direction: 'top', className: 'mapa-fim-rotulo', offset: [0, -8] })
          .setLatLng(carga[Math.floor(carga.length / 2)])
          .setContent(`Viagem ${i + 1} · ${rotFmtKm(v.kmCarga)} · ${v.e.valor_frete != null ? rotFmtReais(parseFloat(v.e.valor_frete)) : 'sem valor'}`)
          .addTo(rotCamada);
      }
    }
  });

  const foco = focoSelecionada.length ? focoSelecionada : focoTodas;
  if (foco.length) rotMapa.fitBounds(L.latLngBounds(foco).pad(0.12), { animate: false });

  const legenda = document.getElementById('rotograma-mapa-legenda');
  if (rotSelecionada === null) {
    legenda.textContent = 'Todas as viagens';
  } else {
    const v = rotViagens[rotSelecionada];
    legenda.innerHTML = `<strong>Viagem ${rotSelecionada + 1}</strong> · ${escapeHtml(v.e.origem)} → ${escapeHtml(v.e.destino)} · ${escapeHtml(v.e.cliente)}`;
  }
  document.getElementById('rotograma-ver-todas').hidden = rotSelecionada === null;
}

function rotogramaSelecionar(i) {
  rotSelecionada = rotSelecionada === i ? null : i;
  document.querySelectorAll('.rot-viagem').forEach((el, j) => el.classList.toggle('selecionada', j === rotSelecionada));
  rotDesenharMapa();
  if (rotSelecionada !== null && window.innerWidth <= 1100) {
    document.getElementById('rotograma-mapa').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function rotogramaVerTodas() {
  rotSelecionada = null;
  document.querySelectorAll('.rot-viagem').forEach(el => el.classList.remove('selecionada'));
  rotDesenharMapa();
}
