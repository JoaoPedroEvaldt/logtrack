checarAuth();
checarStaff();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';

let todasEntregas = [], todosVeiculos = [], todasManutencoes = [], todasOcorrencias = [], todosConjuntos = [], todosDeslocamentosVazios = [];
let graficoMensal = null;

const NOMES_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const LABEL_STATUS = { aguardando: 'Aguardando', em_rota: 'Em Rota', entregue: 'Entregue', atrasado: 'Atrasado', ocorrencia: 'Ocorrência', cancelado: 'Cancelado' };
const LABEL_TIPO_OCORRENCIA = { atraso: 'Atraso', acidente: 'Acidente', cliente_ausente: 'Cliente Ausente', problema_mecanico: 'Problema Mecânico', extravio: 'Extravio', outro: 'Outro' };

function definirPeriodoPadrao() {
  const hoje = new Date();
  const seisMesesAtras = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);
  document.getElementById('data-fim').value = hoje.toISOString().slice(0, 10);
  document.getElementById('data-inicio').value = seisMesesAtras.toISOString().slice(0, 10);
}

function preencherFiltroConjunto() {
  const sel = document.getElementById('filtro-conjunto');
  todosConjuntos.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.nome;
    sel.appendChild(opt);
  });
}

function preencherFiltroVeiculoVazio() {
  const sel = document.getElementById('filtro-veiculo-vazio');
  todosVeiculos.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = `${v.placa} — ${v.modelo}`;
    sel.appendChild(opt);
  });
}

function conjuntoDaEntrega(entrega) {
  return todosConjuntos.find(c =>
    (entrega.motorista_id && c.motorista_id === entrega.motorista_id) ||
    (entrega.veiculo_id && (c.cavalo_id === entrega.veiculo_id || c.semirreboque1_id === entrega.veiculo_id || c.semirreboque2_id === entrega.veiculo_id))
  );
}

function veiculosDoConjunto(conjunto) {
  return [conjunto.cavalo_id, conjunto.semirreboque1_id, conjunto.semirreboque2_id].filter(Boolean);
}

function periodoSelecionado() {
  const inicioStr = document.getElementById('data-inicio').value;
  const fimStr = document.getElementById('data-fim').value;
  const conjuntoId = document.getElementById('filtro-conjunto').value;
  const veiculoVazioId = document.getElementById('filtro-veiculo-vazio').value;
  return {
    inicioStr, fimStr,
    inicio: inicioStr ? new Date(inicioStr + 'T00:00:00') : null,
    fim: fimStr ? new Date(fimStr + 'T23:59:59') : null,
    conjunto: conjuntoId ? todosConjuntos.find(c => String(c.id) === conjuntoId) : null,
    // Filtro à parte do "Conjunto": deslocamento vazio é uma métrica do veículo
    // em si, então dá pra querer olhar uma placa específica sem precisar que
    // ela esteja associada a um conjunto ativo.
    veiculoVazio: veiculoVazioId ? todosVeiculos.find(v => String(v.id) === veiculoVazioId) : null
  };
}

function entregasNoPeriodo({ inicio, fim, conjunto }) {
  return todasEntregas.filter(e => {
    const dataRef = e.concluido_em ? new Date(e.concluido_em) : new Date(e.criado_em);
    if (inicio && dataRef < inicio) return false;
    if (fim && dataRef > fim) return false;
    if (conjunto) {
      const c = conjuntoDaEntrega(e);
      if (!c || c.id !== conjunto.id) return false;
    }
    return true;
  });
}

function ocorrenciasNoPeriodo({ inicio, fim, conjunto }) {
  return todasOcorrencias.filter(o => {
    const d = new Date(o.criado_em);
    if (inicio && d < inicio) return false;
    if (fim && d > fim) return false;
    if (conjunto) {
      const entrega = todasEntregas.find(e => e.id === o.entrega_id);
      const c = entrega ? conjuntoDaEntrega(entrega) : null;
      if (!c || c.id !== conjunto.id) return false;
    }
    return true;
  });
}

/* Cruza deslocamentos_vazios (tabela própria, separada de entregas — ver
   DeslocamentoVazio no backend) com as entregas já carregadas, pra ter em mãos
   veículo/origem/data (da entrega) e destino (da entrega anterior). Cada item
   retornado é { dv, entrega, anterior } — nunca um objeto "fundido" dos dois. */
function deslocamentosVazioNoPeriodo({ inicio, fim, conjunto, veiculoVazio }) {
  return todosDeslocamentosVazios
    .map(dv => ({
      dv,
      entrega: todasEntregas.find(e => e.id === dv.entrega_id),
      anterior: dv.entrega_anterior_id ? todasEntregas.find(e => e.id === dv.entrega_anterior_id) : null,
    }))
    .filter(({ dv, entrega, anterior }) => {
      if (dv.km_vazio == null || !entrega || !anterior || !entrega.iniciado_em) return false;
      // Data de referência é iniciado_em (quando o trecho vazio terminou e a
      // entrega em si começou) — concluido_em/criado_em não fazem sentido aqui,
      // porque o deslocamento vazio é sobre o que aconteceu ANTES da entrega partir.
      const d = new Date(entrega.iniciado_em);
      if (inicio && d < inicio) return false;
      if (fim && d > fim) return false;
      if (veiculoVazio && entrega.veiculo_id !== veiculoVazio.id) return false;
      if (conjunto) {
        const c = conjuntoDaEntrega(entrega);
        if (!c || c.id !== conjunto.id) return false;
      }
      return true;
    });
}

function manutencoesNoPeriodo({ inicio, fim, conjunto }) {
  const veiculosPermitidos = conjunto ? veiculosDoConjunto(conjunto) : null;
  return todasManutencoes.filter(m => {
    const d = new Date(m.data_manutencao + 'T00:00:00');
    if (inicio && d < inicio) return false;
    if (fim && d > fim) return false;
    if (veiculosPermitidos && !veiculosPermitidos.includes(m.veiculo_id)) return false;
    return true;
  });
}

function mesesDoPeriodo(inicio, fim) {
  const meses = [];
  const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  const limite = new Date(fim.getFullYear(), fim.getMonth(), 1);
  while (cursor <= limite && meses.length < 12) {
    meses.push({ ano: cursor.getFullYear(), mes: cursor.getMonth(), label: NOMES_MES[cursor.getMonth()] });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return meses;
}

function renderizarGraficoMensal(entregas, inicio, fim) {
  const hoje = new Date();
  const meses = mesesDoPeriodo(inicio || new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1), fim || hoje);
  const dados = meses.map(m => entregas.filter(e => {
    if (e.status !== 'entregue' || !e.concluido_em) return false;
    const d = new Date(e.concluido_em);
    return d.getFullYear() === m.ano && d.getMonth() === m.mes;
  }).length);

  if (graficoMensal) graficoMensal.destroy();
  graficoMensal = new Chart(document.getElementById('grafico-mensal'), {
    type: 'bar',
    data: { labels: meses.map(m => m.label), datasets: [{ data: dados, backgroundColor: '#2E3E60', borderRadius: 6, maxBarThickness: 42 }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

/* Paleta categórica validada (contraste + distinção pra daltonismo) contra as
   cores reais de superfície do LogTrack (--bg-card #FFFFFF claro / #1F2937
   escuro) — mesma família de cor já usada nos badges de tipo de ocorrência
   (.badge-tipo-1..7 no style.css), estendida com o 8º tom. Cicla de 8 em 8
   quando há mais trechos que cores; a identidade de cada trecho nunca depende
   só da cor (a legenda e o popup sempre têm o texto também). */
const PALETA_VAZIO_CLARO = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const PALETA_VAZIO_ESCURO = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

let mapaVazio = null;
let camadaVazio = null;
let renderMapaVazioId = 0; // invalida geocodificações de uma chamada anterior se o período mudar antes delas terminarem

async function renderizarMapaVazio(deslocamentos) {
  const meuId = ++renderMapaVazioId;
  const card = document.getElementById('card-mapa-vazio');
  const legenda = document.getElementById('legenda-vazio');

  if (!deslocamentos.length) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';
  legenda.innerHTML = '';

  const escuro = document.body.classList.contains('dark');
  const paleta = escuro ? PALETA_VAZIO_ESCURO : PALETA_VAZIO_CLARO;

  if (!mapaVazio) {
    mapaVazio = L.map('mapa-vazio').setView([-14.235, -51.925], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(mapaVazio);
    camadaVazio = L.layerGroup().addTo(mapaVazio);
  }
  camadaVazio.clearLayers();
  document.getElementById('mapa-vazio').classList.toggle('mapa-escuro', escuro);
  mapaVazio.invalidateSize();

  const ordenados = [...deslocamentos].sort((a, b) => new Date(a.entrega.iniciado_em) - new Date(b.entrega.iniciado_em));

  const todosPontos = [];
  // Um deslocamento por vez (não Promise.all) para não estourar o limite de
  // requisições simultâneas do OSRM/Nominatim públicos quando há muitos
  // trechos vazios no período — cada um já cai no cache depois da primeira vez.
  for (let i = 0; i < ordenados.length; i++) {
    const { dv, entrega, anterior } = ordenados[i];

    const rota = await obterRotaRodoviaria(anterior.destino, entrega.origem);
    if (meuId !== renderMapaVazioId) return; // período mudou enquanto calculava
    if (!rota) continue;

    const cor = paleta[i % paleta.length];
    const veiculo = todosVeiculos.find(v => v.id === entrega.veiculo_id);
    const placaTexto = veiculo ? veiculo.placa : `Veículo #${entrega.veiculo_id}`;
    const trechoTexto = `${anterior.destino} → ${entrega.origem}`;
    const kmTexto = parseFloat(dv.km_vazio).toLocaleString('pt-BR') + ' km';
    const popup = `<strong>${escapeHtml(placaTexto)}</strong><br>${escapeHtml(trechoTexto)}<br>${kmTexto} vazio · ${formatarDataHora(entrega.iniciado_em)}`;

    // Mesmo trajeto real do modal de Rota (entregas.js) quando o OSRM devolve
    // geometria; sem rota calculável, cai pra linha reta entre as cidades —
    // mesmo fallback usado lá.
    const coordenadas = rota.coordinates.length >= 2
      ? rota.coordinates.map(([lon, lat]) => [lat, lon])
      : await (async () => {
          const [origemPt, destinoPt] = await Promise.all([geocodificarCidade(anterior.destino), geocodificarCidade(entrega.origem)]);
          return origemPt && destinoPt ? [[origemPt.lat, origemPt.lon], [destinoPt.lat, destinoPt.lon]] : null;
        })();
    if (!coordenadas) continue;

    L.polyline(coordenadas, { color: cor, weight: 4, opacity: 0.85, dashArray: rota.coordinates.length >= 2 ? null : '6 6' })
      .addTo(camadaVazio)
      .bindPopup(popup);
    // Caminhão na cor do trecho (mesma paleta da linha e da legenda) em vez de
    // um ponto genérico — deixa claro de cara que é o veículo saindo vazio
    // dali, e a cor liga visualmente a linha, o ícone e a legenda.
    L.marker(coordenadas[0], { icon: iconeCaminhaoMapa(cor, '#2b2b2b') })
      .addTo(camadaVazio).bindPopup(popup);
    todosPontos.push(...coordenadas);

    const item = document.createElement('div');
    item.className = 'legenda-vazio-item';
    item.innerHTML = `<span class="legenda-vazio-dot" style="background:${cor}"></span> ${escapeHtml(placaTexto)} — ${escapeHtml(trechoTexto)} — ${kmTexto}`;
    legenda.appendChild(item);
  }
  if (todosPontos.length) mapaVazio.fitBounds(todosPontos, { padding: [24, 24] });
}

function atualizarRelatorio() {
  const periodo = periodoSelecionado();
  const incluirOcorrencias = document.getElementById('modulo-ocorrencias').checked;
  const incluirManutencoes = document.getElementById('modulo-manutencoes').checked;

  const entregasFiltradas = entregasNoPeriodo(periodo);
  const entregues = entregasFiltradas.filter(e => e.status === 'entregue');
  document.getElementById('stat-entregues').textContent = entregues.length;

  document.getElementById('tile-ocorrencias').style.display = incluirOcorrencias ? '' : 'none';
  if (incluirOcorrencias) {
    document.getElementById('stat-ocorrencias').textContent = ocorrenciasNoPeriodo(periodo).length;
  }

  document.getElementById('tile-manutencao').style.display = incluirManutencoes ? '' : 'none';
  if (incluirManutencoes) {
    const custoTotal = manutencoesNoPeriodo(periodo).reduce((soma, m) => soma + (parseFloat(m.custo) || 0), 0);
    document.getElementById('stat-custo-manutencao').textContent = 'R$ ' + custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }

  const incluirVazio = document.getElementById('modulo-vazio').checked;
  document.getElementById('tile-vazio-km').style.display = incluirVazio ? '' : 'none';
  document.getElementById('tile-vazio-viagens').style.display = incluirVazio ? '' : 'none';
  const deslocamentosVazio = incluirVazio ? deslocamentosVazioNoPeriodo(periodo) : [];
  if (incluirVazio) {
    const kmVazioTotal = deslocamentosVazio.reduce((soma, item) => soma + parseFloat(item.dv.km_vazio), 0);
    document.getElementById('stat-vazio-km').textContent = kmVazioTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' km';
    document.getElementById('stat-vazio-viagens').textContent = deslocamentosVazio.length;
    renderizarMapaVazio(deslocamentosVazio);
  } else {
    document.getElementById('card-mapa-vazio').style.display = 'none';
  }

  renderizarGraficoMensal(entregasFiltradas, periodo.inicio, periodo.fim);

  const fmt = d => d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  document.getElementById('preview-sub').textContent =
    `${fmt(periodo.inicio)} – ${fmt(periodo.fim)} · ${periodo.conjunto ? periodo.conjunto.nome : 'Todos os conjuntos'}`;

  const modulos = ['as entregas'];
  if (incluirOcorrencias) modulos.push('ocorrências');
  if (incluirManutencoes) modulos.push('manutenções');
  if (incluirVazio) modulos.push(periodo.veiculoVazio ? `deslocamento vazio (${periodo.veiculoVazio.placa})` : 'deslocamento vazio');
  document.getElementById('preview-nota').textContent =
    `Pré-visualização — o PDF final inclui ${modulos.join(', ')} do período.`;
}

async function carregarDados() {
  [todasEntregas, todosVeiculos, todasManutencoes, todasOcorrencias, todosConjuntos, todosDeslocamentosVazios] = await Promise.all([
    get('/entregas'), get('/veiculos'), get('/manutencoes'), get('/ocorrencias'), get('/conjuntos'), get('/deslocamentos-vazios')
  ]);
  todasEntregas = todasEntregas || [];
  todosVeiculos = todosVeiculos || [];
  todasManutencoes = todasManutencoes || [];
  todasOcorrencias = todasOcorrencias || [];
  todosConjuntos = todosConjuntos || [];
  todosDeslocamentosVazios = todosDeslocamentosVazios || [];
  preencherFiltroConjunto();
  preencherFiltroVeiculoVazio();
  atualizarRelatorio();
}

async function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const geradoEm = new Date().toLocaleString('pt-BR');

  const periodo = periodoSelecionado();
  const entregasFiltradas = entregasNoPeriodo(periodo);
  const incluirOcorrencias = document.getElementById('modulo-ocorrencias').checked;
  const incluirManutencoes = document.getElementById('modulo-manutencoes').checked;
  const incluirDesempenho = document.getElementById('modulo-motoristas-veiculos').checked;
  const incluirVazio = document.getElementById('modulo-vazio').checked;

  const entregues = entregasFiltradas.filter(e => e.status === 'entregue');

  /* ---- Capa: pílulas de filtro + título + cards de indicadores ---- */
  let y = 30;
  let x = 14;
  x += pdfPilula(doc, x, y, `Período: ${periodo.inicioStr || '—'} a ${periodo.fimStr || '—'}`) + 4;
  pdfPilula(doc, x, y, `Conjunto: ${periodo.conjunto ? periodo.conjunto.nome : 'Todos'}`);
  y += 16;

  pdfTituloSecao(doc, 14, y, 'Relatório de Desempenho Operacional');
  y += 10;

  const kpis = [
    { valor: String(entregues.length), label: 'Entregas concluídas' },
  ];
  if (incluirOcorrencias) kpis.push({ valor: String(ocorrenciasNoPeriodo(periodo).length), label: 'Ocorrências' });
  if (incluirManutencoes) {
    const custoTotal = manutencoesNoPeriodo(periodo).reduce((s, m) => s + (parseFloat(m.custo) || 0), 0);
    kpis.push({ valor: 'R$ ' + custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), label: 'Custo com manutenção' });
  }
  const deslocamentosVazioPdf = incluirVazio ? deslocamentosVazioNoPeriodo(periodo) : [];
  if (incluirVazio) {
    const kmVazioTotal = deslocamentosVazioPdf.reduce((s, item) => s + parseFloat(item.dv.km_vazio), 0);
    kpis.push({ valor: kmVazioTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' km', label: 'Rodados vazios' });
  }
  y += pdfCardsKPI(doc, 14, y, pageWidth - 28, kpis) + 12;

  const contagemPorStatus = {};
  entregasFiltradas.forEach(e => { contagemPorStatus[e.status] = (contagemPorStatus[e.status] || 0) + 1; });
  const itensBarraStatus = Object.keys(LABEL_STATUS)
    .map(s => ({ status: s, label: LABEL_STATUS[s], valor: contagemPorStatus[s] || 0, cor: corPorStatus(s) }));
  if (entregasFiltradas.length) {
    y += pdfBarraStatus(doc, 14, y, pageWidth - 28, itensBarraStatus) + 6;
  }

  pdfTituloSecao(doc, 14, y, 'Entregas do período', 12);
  y += 6;

  const badgeStatusEntregas = pdfColunaBadgeStatus(
    3,
    (i) => entregasFiltradas[i].status,
    (i) => LABEL_STATUS[entregasFiltradas[i].status] || entregasFiltradas[i].status
  );

  doc.autoTable({
    startY: y,
    head: [['Cliente', 'Origem', 'Destino', 'Status', 'Previsão', 'Concluído em']],
    body: entregasFiltradas.map(e => [
      e.cliente, e.origem, e.destino,
      LABEL_STATUS[e.status] || e.status,
      formatarDataHora(e.previsao), formatarDataHora(e.concluido_em)
    ]),
    ...PDF_ESTILO_TABELA,
    columnStyles: { 3: { cellWidth: 27 } },
    didDrawPage: pdfCabecalhoRodape(doc, 'Entregas do período', geradoEm),
    didParseCell: badgeStatusEntregas.didParseCell,
    didDrawCell: badgeStatusEntregas.didDrawCell,
  });

  if (incluirOcorrencias) {
    const lista = ocorrenciasNoPeriodo(periodo);
    doc.addPage();
    pdfTituloSecao(doc, 14, 32, 'Ocorrências do período');
    doc.autoTable({
      startY: 40,
      head: [['Veículo', 'Tipo', 'Descrição', 'Data']],
      body: lista.map(o => {
        const entrega = todasEntregas.find(e => e.id === o.entrega_id);
        const veiculo = entrega ? todosVeiculos.find(v => v.id === entrega.veiculo_id) : null;
        return [
          veiculo ? veiculo.placa : '—',
          LABEL_TIPO_OCORRENCIA[o.tipo] || o.tipo,
          o.descricao,
          formatarDataHora(o.criado_em)
        ];
      }),
      ...PDF_ESTILO_TABELA,
      didDrawPage: pdfCabecalhoRodape(doc, 'Ocorrências do período', geradoEm),
    });
  }

  if (incluirManutencoes) {
    const lista = manutencoesNoPeriodo(periodo);
    doc.addPage();
    pdfTituloSecao(doc, 14, 32, 'Manutenções do período');
    doc.autoTable({
      startY: 40,
      head: [['Veículo', 'Data', 'Tipo', 'Custo']],
      body: lista.map(m => {
        const v = todosVeiculos.find(v => v.id === m.veiculo_id);
        return [
          v ? v.placa : `#${m.veiculo_id}`,
          formatarData(m.data_manutencao),
          m.tipo,
          m.custo != null ? 'R$ ' + parseFloat(m.custo).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'
        ];
      }),
      ...PDF_ESTILO_TABELA,
      didDrawPage: pdfCabecalhoRodape(doc, 'Manutenções do período', geradoEm),
    });
  }

  if (incluirVazio) {
    doc.addPage();
    pdfTituloSecao(doc, 14, 32, 'Deslocamento vazio do período');
    doc.autoTable({
      startY: 40,
      head: [['Veículo', 'Trecho vazio', 'Km', 'Início da entrega']],
      body: deslocamentosVazioPdf.map(({ dv, entrega, anterior }) => {
        const v = todosVeiculos.find(v => v.id === entrega.veiculo_id);
        return [
          v ? v.placa : `#${entrega.veiculo_id}`,
          `${anterior.destino} → ${entrega.origem}`,
          parseFloat(dv.km_vazio).toLocaleString('pt-BR'),
          formatarDataHora(entrega.iniciado_em)
        ];
      }),
      ...PDF_ESTILO_TABELA,
      didDrawPage: pdfCabecalhoRodape(doc, 'Deslocamento vazio do período', geradoEm),
    });
  }

  if (incluirDesempenho) {
    const desempenho = todosVeiculos.map(v => {
      const viagens = entregasFiltradas.filter(e => e.veiculo_id === v.id && e.status === 'entregue');
      const faturamento = viagens.reduce((s, e) => s + (parseFloat(e.valor_frete) || 0), 0);
      return { v, viagens: viagens.length, faturamento };
    }).filter(d => d.viagens > 0).sort((a, b) => b.faturamento - a.faturamento);

    doc.addPage();
    pdfTituloSecao(doc, 14, 32, 'Desempenho por veículo');
    doc.autoTable({
      startY: 40,
      head: [['Veículo', 'Viagens concluídas', 'Faturamento']],
      body: desempenho.map(({ v, viagens, faturamento }) => [
        `${v.placa} — ${v.modelo}`, viagens, 'R$ ' + faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      ]),
      ...PDF_ESTILO_TABELA,
      didDrawPage: pdfCabecalhoRodape(doc, 'Desempenho por veículo', geradoEm),
    });
  }

  pdfFinalizarPaginas(doc);
  doc.save(`logtrack-relatorio-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`);
}

definirPeriodoPadrao();
carregarDados();
