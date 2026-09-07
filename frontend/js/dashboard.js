checarAuth();

document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || 'Usuário';
document.getElementById('data-hoje').textContent = new Date().toLocaleDateString('pt-BR', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

const STATUS_ATIVOS = ['aguardando', 'em_rota', 'atrasado', 'ocorrencia'];
const NOMES_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function ultimosMeses(qtd) {
  const hoje = new Date();
  const meses = [];
  for (let i = qtd - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push({ ano: d.getFullYear(), mes: d.getMonth(), label: NOMES_MES[d.getMonth()] });
  }
  return meses;
}

function conjuntoDaEntrega(entrega, conjuntos) {
  return conjuntos.find(c =>
    (entrega.motorista_id && c.motorista_id === entrega.motorista_id) ||
    (entrega.veiculo_id && (c.cavalo_id === entrega.veiculo_id || c.semirreboque1_id === entrega.veiculo_id || c.semirreboque2_id === entrega.veiculo_id))
  );
}

function renderizarGraficoMensal(entregas) {
  const meses = ultimosMeses(6);
  const hoje = new Date();

  const dados = meses.map(m => entregas.filter(e => {
    if (e.status !== 'entregue' || !e.concluido_em) return false;
    const d = new Date(e.concluido_em);
    return d.getFullYear() === m.ano && d.getMonth() === m.mes;
  }).length);

  const cores = meses.map(m => (m.ano === hoje.getFullYear() && m.mes === hoje.getMonth()) ? '#F2A93B' : '#2E3E60');

  new Chart(document.getElementById('grafico-mensal'), {
    type: 'bar',
    data: {
      labels: meses.map(m => m.label),
      datasets: [{ data: dados, backgroundColor: cores, borderRadius: 6, maxBarThickness: 42 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

function renderizarGraficoStatus(entregas) {
  const concluidas = entregas.filter(e => e.status === 'entregue').length;
  const emTransito = entregas.filter(e => e.status === 'em_rota').length;
  const pendentes = entregas.filter(e => ['aguardando', 'atrasado', 'ocorrencia'].includes(e.status)).length;
  const total = concluidas + emTransito + pendentes;

  const textoCentral = {
    id: 'textoCentral',
    afterDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      const cx = (chartArea.left + chartArea.right) / 2;
      const cy = (chartArea.top + chartArea.bottom) / 2;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#1E2A44';
      ctx.font = "700 26px 'Segoe UI'";
      ctx.fillText(String(total), cx, cy);
      ctx.restore();
    }
  };

  new Chart(document.getElementById('grafico-status'), {
    type: 'doughnut',
    data: {
      labels: ['Concluídas', 'Em trânsito', 'Pendentes'],
      datasets: [{ data: [concluidas, emTransito, pendentes], backgroundColor: ['#1E2A44', '#F2A93B', '#D8DCE6'], borderWidth: 0 }]
    },
    options: {
      responsive: true,
      cutout: '68%',
      plugins: { legend: { position: 'bottom' } }
    },
    plugins: [textoCentral]
  });
}

function renderizarTabela(entregas, conjuntos) {
  const tbody = document.getElementById('tabela-entregas');

  if (entregas.length === 0) {
    tbody.innerHTML = estadoVazio(3, 'Nenhuma entrega cadastrada', 'Cadastre a primeira entrega para ver o painel ganhar vida.', 'vazio');
    return;
  }

  const recentes = entregas.slice(-8).reverse();
  tbody.innerHTML = recentes.map(e => {
    const conjunto = conjuntoDaEntrega(e, conjuntos);
    return `
      <tr>
        <td>${escapeHtml(e.origem)} → ${escapeHtml(e.destino)}</td>
        <td>${conjunto ? escapeHtml(conjunto.nome) : '—'}</td>
        <td>${badgeStatus(e.status)}</td>
      </tr>
    `;
  }).join('');
}

const TIPO_LABEL_VENCIMENTO = { cnh: 'CNH', crlv: 'CRLV', seguro: 'Seguro' };

/* Classifica cada alerta por urgência (dias até o vencimento) e devolve o selo
   correspondente — vermelho já vencido, laranja vence em até 7 dias, azul o resto
   dentro dos 30 dias que a API já filtrou. Reaproveita os badges de status que já
   existem no sistema, então não precisou de cor nova. */
function situacaoVencimento(item) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const validade = new Date(item.validade + 'T00:00:00');
  const dias = Math.round((validade - hoje) / 86400000);

  if (item.vencido) return { badge: 'badge-ocorrencia', texto: `Vencido há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? '' : 's'}` };
  if (dias <= 7) return { badge: 'badge-atrasado', texto: dias === 0 ? 'Vence hoje' : `Vence em ${dias} dia${dias === 1 ? '' : 's'}` };
  return { badge: 'badge-em_rota', texto: `Vence em ${dias} dias` };
}

function renderizarVencimentos(lista) {
  const tbody = document.getElementById('tabela-vencimentos');
  if (!tbody) return;

  const resumoEl = document.getElementById('alertas-resumo');
  if (resumoEl) {
    const vencidos = lista.filter(i => i.vencido).length;
    resumoEl.textContent = vencidos
      ? `${vencidos} vencido${vencidos === 1 ? '' : 's'} · ${lista.length - vencidos} vencendo nos próximos 30 dias`
      : lista.length ? `${lista.length} vencendo nos próximos 30 dias` : 'Tudo em dia';
  }

  if (lista.length === 0) {
    tbody.innerHTML = estadoVazio(4, 'Nenhum vencimento próximo', 'CNHs, CRLVs e seguros estão em dia nos próximos 30 dias.', 'check');
    return;
  }

  tbody.innerHTML = lista.map(item => {
    const s = situacaoVencimento(item);
    return `
      <tr>
        <td>${TIPO_LABEL_VENCIMENTO[item.tipo] || item.tipo}</td>
        <td>${escapeHtml(item.referencia)}</td>
        <td>${formatarData(item.validade)}</td>
        <td><span class="badge ${s.badge}">${s.texto}</span></td>
      </tr>
    `;
  }).join('');
}

const NOMES_MES_EXTENSO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function formatarMoeda(valor) {
  return 'R$ ' + (valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* Selo "▲12% vs mesmo período" nos cards de faturamento. O backend já compara os
   mesmos N dias em ambos os meses (não o mês anterior inteiro) — senão, no dia 7
   do mês essa conta seria "7 dias vs 31 dias" e a variação não diria nada real.
   `aumentoEBom` diz se subir é notícia boa (receita/líquido) ou ruim (custos) —
   decide a cor, não só a seta. Sem dado do mês anterior pra comparar, não mostra
   nada em vez de inventar um "0%". */
function badgeVariacao(atual, anterior, aumentoEBom) {
  if (!anterior) return atual ? '<span class="variacao-neutra">Sem histórico do mesmo período</span>' : '';
  const pct = ((atual - anterior) / Math.abs(anterior)) * 100;
  const subiu = pct >= 0;
  const bom = subiu === aumentoEBom;
  const seta = subiu ? '▲' : '▼';
  const classe = bom ? 'variacao-positiva' : 'variacao-negativa';
  return `<span class="${classe}">${seta} ${Math.abs(pct).toFixed(0)}% vs mesmo período do mês passado</span>`;
}

function renderizarFaturamento(fat) {
  const [ano, mes] = fat.periodo.split('-').map(Number);
  document.getElementById('faturamento-periodo').textContent = `${NOMES_MES_EXTENSO[mes - 1]} de ${ano}`;

  const custoTotal = fat.custo_manutencao + fat.custo_abastecimento;
  document.getElementById('fat-receita').textContent = formatarMoeda(fat.receita_bruta);
  document.getElementById('fat-custos').textContent = formatarMoeda(custoTotal);
  document.getElementById('fat-liquido').textContent = formatarMoeda(fat.faturamento_liquido);

  const anterior = fat.mes_anterior || {};
  document.getElementById('fat-receita-var').innerHTML = badgeVariacao(fat.receita_bruta, anterior.receita_bruta, true);
  document.getElementById('fat-custos-var').innerHTML = badgeVariacao(custoTotal, anterior.custo_total, false);
  document.getElementById('fat-liquido-var').innerHTML = badgeVariacao(fat.faturamento_liquido, anterior.faturamento_liquido, true);

  const tbodyConjunto = document.getElementById('tabela-faturamento-conjunto');
  if (fat.por_conjunto.length === 0) {
    tbodyConjunto.innerHTML = estadoVazio(4, 'Sem movimento no mês', null, 'vazio');
  } else {
    tbodyConjunto.innerHTML = fat.por_conjunto.map(c => `
      <tr>
        <td>${escapeHtml(c.conjunto)}</td>
        <td>${formatarMoeda(c.receita)}</td>
        <td>${formatarMoeda(c.custo)}</td>
        <td><strong>${formatarMoeda(c.liquido)}</strong></td>
      </tr>
    `).join('');
  }

  const tbodyMotorista = document.getElementById('tabela-faturamento-motorista');
  if (fat.por_motorista.length === 0) {
    tbodyMotorista.innerHTML = estadoVazio(5, 'Sem movimento no mês', null, 'vazio');
  } else {
    tbodyMotorista.innerHTML = fat.por_motorista.map(m => `
      <tr>
        <td>${escapeHtml(m.motorista)}</td>
        <td>${formatarMoeda(m.receita)}</td>
        <td>${formatarMoeda(m.custo)}</td>
        <td>${formatarMoeda(m.comissao)}</td>
        <td><strong>${formatarMoeda(m.liquido)}</strong></td>
      </tr>
    `).join('');
  }
}

/* Linha "#1, #2, #3..." com destaque pro topo do ranking — reforça a leitura de
   "top 5" sem precisar de mais uma coluna na tabela. */
function medalha(posicao) {
  return posicao < 3 ? `<strong>${posicao + 1}º</strong>` : `${posicao + 1}º`;
}

function renderizarTopMotoristas(lista) {
  const tbody = document.getElementById('tabela-top-motoristas');
  if (!tbody) return;
  const top5 = [...lista].sort((a, b) => b.faturamento - a.faturamento).slice(0, 5);
  if (top5.length === 0) {
    tbody.innerHTML = estadoVazio(3, 'Sem entregas no histórico', null, 'vazio');
    return;
  }
  tbody.innerHTML = top5.map((m, i) => `
    <tr>
      <td>${medalha(i)} ${escapeHtml(m.motorista)}</td>
      <td>${m.concluidas}</td>
      <td><strong>${formatarMoeda(m.faturamento)}</strong></td>
    </tr>
  `).join('');
}

/* Não existe endpoint pronto de desempenho por veículo — calcula em cima das
   entregas já carregadas, do mesmo jeito que relatorios.js faz pro PDF. */
function calcularTopVeiculos(entregas, veiculos) {
  return veiculos.map(v => {
    const viagens = entregas.filter(e => e.veiculo_id === v.id && e.status === 'entregue');
    const faturamento = viagens.reduce((s, e) => s + (parseFloat(e.valor_frete) || 0), 0);
    return { placa: v.placa, modelo: v.modelo, concluidas: viagens.length, faturamento };
  }).filter(v => v.concluidas > 0).sort((a, b) => b.faturamento - a.faturamento).slice(0, 5);
}

function renderizarTopVeiculos(top5) {
  const tbody = document.getElementById('tabela-top-veiculos');
  if (!tbody) return;
  if (top5.length === 0) {
    tbody.innerHTML = estadoVazio(3, 'Sem entregas no histórico', null, 'vazio');
    return;
  }
  tbody.innerHTML = top5.map((v, i) => `
    <tr>
      <td>${medalha(i)} ${escapeHtml(v.placa)}</td>
      <td>${v.concluidas}</td>
      <td><strong>${formatarMoeda(v.faturamento)}</strong></td>
    </tr>
  `).join('');
}

function renderizarCustoPorKm(lista) {
  const tbody = document.getElementById('tabela-custo-km');
  if (!tbody) return;
  if (lista.length === 0) {
    tbody.innerHTML = estadoVazio(4, 'Sem dados suficientes', 'Precisa de ao menos 2 leituras de quilometragem no mês (em abastecimentos ou manutenções) pra estimar.', 'vazio');
    return;
  }
  tbody.innerHTML = lista.slice(0, 5).map(v => `
    <tr>
      <td>${escapeHtml(v.placa)}</td>
      <td>${v.km_rodado.toLocaleString('pt-BR')} km</td>
      <td>${formatarMoeda(v.custo_total)}</td>
      <td><strong>${formatarMoeda(v.custo_por_km)}</strong></td>
    </tr>
  `).join('');
}

async function carregarPainel() {
  /* Motorista só enxerga as próprias entregas — o resto (cadastros de colegas,
     faturamento, vencimentos) é bloqueado pela API pra esse perfil, então nem pedimos. */
  const ehMotorista = localStorage.getItem('perfil') === 'motorista';

  const [entregas, motoristas, veiculos, ocorrencias, conjuntos, faturamento, vencimentos, desempenhoMotoristas, custoPorKm] = await Promise.all([
    get('/entregas'),
    ehMotorista ? Promise.resolve(null) : get('/motoristas'),
    ehMotorista ? Promise.resolve(null) : get('/veiculos'),
    ehMotorista ? Promise.resolve(null) : get('/ocorrencias'),
    ehMotorista ? Promise.resolve(null) : get('/conjuntos'),
    ehMotorista ? Promise.resolve(null) : get('/dashboard/faturamento'),
    ehMotorista ? Promise.resolve(null) : get('/dashboard/vencimentos'),
    ehMotorista ? Promise.resolve(null) : get('/dashboard/desempenho-motoristas'),
    ehMotorista ? Promise.resolve(null) : get('/dashboard/custo-por-km'),
  ]);

  const listaEntregas = entregas || [];
  const listaConjuntos = conjuntos || [];

  const emAndamento = listaEntregas.filter(e => STATUS_ATIVOS.includes(e.status)).length;
  document.getElementById('card-em-andamento').textContent = emAndamento;

  if (!ehMotorista) {
    const listaMotoristas = motoristas || [];
    const listaVeiculos = veiculos || [];
    const listaOcorrencias = ocorrencias || [];

    /* "Disponível" no cadastro só vira "em rota" quando existe uma entrega em_rota
       usando aquele motorista/veículo agora — o campo status sozinho não reflete isso. */
    const motoristasEmRota = new Set(listaEntregas.filter(e => e.status === 'em_rota' && e.motorista_id).map(e => e.motorista_id));
    const veiculosEmRota = new Set(listaEntregas.filter(e => e.status === 'em_rota' && e.veiculo_id).map(e => e.veiculo_id));
    const motoristasDisp = listaMotoristas.filter(m => m.status === 'disponivel' && !motoristasEmRota.has(m.id)).length;
    const veiculosDisp = listaVeiculos.filter(v => v.status === 'disponivel' && !veiculosEmRota.has(v.id)).length;

    document.getElementById('card-motoristas').textContent = `${motoristasDisp} / ${listaMotoristas.length}`;
    document.getElementById('card-veiculos').textContent = `${veiculosDisp} / ${listaVeiculos.length}`;
    document.getElementById('card-ocorrencias').textContent = listaOcorrencias.length;
    renderizarVencimentos(vencimentos || []);
    if (faturamento && !faturamento.detail) renderizarFaturamento(faturamento);
    renderizarTopMotoristas(desempenhoMotoristas || []);
    renderizarTopVeiculos(calcularTopVeiculos(listaEntregas, listaVeiculos));
    renderizarCustoPorKm(custoPorKm || []);
  }

  renderizarGraficoMensal(listaEntregas);
  renderizarGraficoStatus(listaEntregas);
  renderizarTabela(listaEntregas, listaConjuntos);
}

carregarPainel();
