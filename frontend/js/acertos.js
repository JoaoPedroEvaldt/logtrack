/* Acerto do motorista (acertos.html): a cada 30 dias, na entrega do envelope,
   o motorista recebe 13% do frete das viagens concluídas + 1/3 das diárias
   − os adiantamentos (vales dos dias 5 e 15). O cálculo e as travas ficam na
   API (app/routers/acertos.py); aqui é a tela, os lançamentos e o recibo. */
checarAuth();
checarStaff();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';
aplicarMascaraMoeda(document.getElementById('diaria-valor'));
aplicarMascaraMoeda(document.getElementById('adiantamento-valor'));

let motoristasAcerto = [];
let previaAtual = null;

function reais(v) {
  return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function motoristaSelecionado() {
  return parseInt(document.getElementById('acerto-motorista').value, 10) || null;
}

function somarDias(isoData, dias) {
  const d = new Date(isoData + 'T00:00:00');
  d.setDate(d.getDate() + dias);
  return dataLocalISO(d);
}

/* ===================== CARGA ===================== */
async function iniciar() {
  motoristasAcerto = (await get('/motoristas')) || [];
  const sel = document.getElementById('acerto-motorista');
  motoristasAcerto
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.nome;
      sel.appendChild(opt);
    });

  // A ficha do motorista abre esta tela com ?motorista=ID.
  const daUrl = new URLSearchParams(location.search).get('motorista');
  if (daUrl && motoristasAcerto.some(m => String(m.id) === daUrl)) {
    sel.value = daUrl;
    await aoTrocarMotorista();
  } else {
    carregarHistorico();
  }
}

/* Período sugerido: do dia seguinte ao último acerto até hoje (ou, no
   primeiro acerto, do dia 1º do mês até hoje). */
async function aoTrocarMotorista() {
  const id = motoristaSelecionado();
  const hoje = dataLocalISO(new Date());
  if (!id) {
    document.getElementById('acerto-conteudo').hidden = true;
    document.getElementById('acerto-vazio').hidden = false;
    carregarHistorico();
    return;
  }
  const historico = (await get(`/acertos?motorista_id=${id}`)) || [];
  const ultimo = historico[0];
  let inicio = ultimo ? somarDias(ultimo.periodo_fim, 1) : hoje.slice(0, 8) + '01';
  if (inicio > hoje) inicio = hoje;
  document.getElementById('acerto-inicio').value = inicio;
  document.getElementById('acerto-fim').value = hoje;
  renderizarHistorico(historico, id);
  await calcularPrevia();
}

async function calcularPrevia() {
  const id = motoristaSelecionado();
  const inicio = document.getElementById('acerto-inicio').value;
  const fim = document.getElementById('acerto-fim').value;
  if (!id || !inicio || !fim) return;
  if (fim < inicio) {
    toastAviso('O fim do período não pode ser antes do início.');
    return;
  }
  const previa = await get(`/acertos/previa?motorista_id=${id}&periodo_inicio=${inicio}&periodo_fim=${fim}`);
  if (!previa || previa.detail) {
    toastErro('Erro: ' + extrairErro(previa));
    return;
  }
  previaAtual = previa;
  document.getElementById('acerto-vazio').hidden = true;
  document.getElementById('acerto-conteudo').hidden = false;
  renderizarRecibo(previa);
  renderizarViagens(previa);
  renderizarDiarias(previa);
  renderizarAdiantamentos(previa);
}

/* ===================== RECIBO NA TELA ===================== */
function renderizarRecibo(p) {
  const devedor = p.saldo < 0;
  const vazio = !p.viagens.length && !p.diarias.length && !p.adiantamentos.length;
  document.getElementById('acerto-recibo').innerHTML = `
    <div class="acerto-recibo-cab">
      <span class="acerto-recibo-rotulo">Prévia do acerto</span>
      <h2>${escapeHtml(p.motorista)}</h2>
      <span class="acerto-recibo-periodo">${formatarData(p.periodo_inicio)} a ${formatarData(p.periodo_fim)}</span>
    </div>
    <div class="acerto-linha">
      <div><strong>Comissão</strong><span>13% de ${reais(p.total_frete)} · ${p.viagens.length} viage${p.viagens.length === 1 ? 'm' : 'ns'}</span></div>
      <b class="positivo">+ ${reais(p.comissao)}</b>
    </div>
    <div class="acerto-linha">
      <div><strong>Diárias</strong><span>⅓ de ${reais(p.total_diarias)} pagos pelo cliente</span></div>
      <b class="positivo">+ ${reais(p.diarias_motorista)}</b>
    </div>
    <div class="acerto-linha">
      <div><strong>Adiantamentos</strong><span>${p.adiantamentos.length} vale${p.adiantamentos.length === 1 ? '' : 's'} no período</span></div>
      <b class="negativo">− ${reais(p.total_adiantamentos)}</b>
    </div>
    <div class="acerto-saldo ${devedor ? 'devedor' : ''}">
      <span>${devedor ? 'Saldo devedor do motorista' : 'Saldo a pagar no envelope'}</span>
      <strong>${reais(Math.abs(p.saldo))}</strong>
    </div>
    <div class="form-group" style="margin-top:16px;">
      <label>Observação (sai no recibo)</label>
      <textarea id="acerto-observacao" rows="2" maxlength="1000" placeholder="Opcional"></textarea>
    </div>
    <button class="btn btn-primary acerto-btn-fechar" onclick="fecharAcerto()" ${vazio ? 'disabled title="Nada pendente no período"' : ''}>
      ${svgIcone('check', 16)} Fechar acerto
    </button>
    <p class="acerto-nota">Ao fechar, as viagens, diárias e vales acima ficam presos a este acerto e não entram em outro. Viagem concluída depois entra no próximo.</p>
  `;
}

function renderizarViagens(p) {
  document.getElementById('acerto-viagens-sub').textContent = `${p.viagens.length} pendente${p.viagens.length === 1 ? '' : 's'} de acerto`;
  const tbody = document.getElementById('acerto-viagens');
  if (!p.viagens.length) {
    tbody.innerHTML = estadoVazio(5, 'Nenhuma viagem concluída pendente no período', null, 'caminhao');
    return;
  }
  tbody.innerHTML = p.viagens.map(v => `
    <tr>
      <td>#${v.id}</td>
      <td>${formatarData(v.data)}</td>
      <td>${escapeHtml(v.origem)} → ${escapeHtml(v.destino)}</td>
      <td>${reais(v.valor_frete)}</td>
      <td><strong>${reais(v.comissao)}</strong></td>
    </tr>`).join('');
}

/* Linhas das tabelas de diárias e vales — usadas na prévia (itens pendentes)
   e na janela de um acerto fechado. editavel=false esconde os botões. */
const diariasPorId = new Map();
const adiantamentosPorId = new Map();

function linhasDiarias(lista, editavel) {
  lista.forEach(d => diariasPorId.set(d.id, d));
  return lista.map(d => `
    <tr>
      <td>${formatarData(d.data)}${d.dias ? `<br><span class="acerto-mini">${d.dias} dia${d.dias === 1 ? '' : 's'}</span>` : ''}</td>
      <td>#${d.entrega_id} · ${escapeHtml(d.rota || '')}${d.descricao ? `<br><span class="acerto-mini">${escapeHtml(d.descricao)}</span>` : ''}</td>
      <td>${reais(d.valor)}</td>
      <td><strong>${reais(d.parte_motorista)}</strong></td>
      <td>${reais(d.parte_caminhao)}</td>
      <td>${reais(d.parte_empresa)}</td>
      <td class="acerto-acoes">${editavel ? `
        <button class="btn btn-outline acerto-btn-mini" onclick="editarDiaria(${d.id})" title="Corrigir">${svgIcone('editar', 12)}</button>
        <button class="btn btn-danger acerto-btn-mini" onclick="excluirDiaria(${d.id})" title="Excluir">${svgIcone('excluir', 12)}</button>` : ''}
      </td>
    </tr>`).join('');
}

function linhasAdiantamentos(lista, editavel) {
  lista.forEach(a => adiantamentosPorId.set(a.id, a));
  return lista.map(a => `
    <tr>
      <td>${formatarData(a.data)}</td>
      <td>${escapeHtml(a.descricao || '—')}</td>
      <td><strong>${reais(a.valor)}</strong></td>
      <td class="acerto-acoes">${editavel ? `
        <button class="btn btn-outline acerto-btn-mini" onclick="editarAdiantamento(${a.id})" title="Corrigir">${svgIcone('editar', 12)}</button>
        <button class="btn btn-danger acerto-btn-mini" onclick="excluirAdiantamento(${a.id})" title="Excluir">${svgIcone('excluir', 12)}</button>` : ''}
      </td>
    </tr>`).join('');
}

function renderizarDiarias(p) {
  const tbody = document.getElementById('acerto-diarias');
  tbody.innerHTML = p.diarias.length
    ? linhasDiarias(p.diarias, true)
    : estadoVazio(7, 'Nenhuma diária no período', 'Use "Lançar diária" quando o cliente pagar estadia.', 'relogio');
}

function renderizarAdiantamentos(p) {
  const tbody = document.getElementById('acerto-adiantamentos');
  tbody.innerHTML = p.adiantamentos.length
    ? linhasAdiantamentos(p.adiantamentos, true)
    : estadoVazio(4, 'Nenhum adiantamento no período', 'Lance os vales dos dias 5 e 15.', 'dinheiro');
}

/* ===================== FECHAR / HISTÓRICO ===================== */
async function fecharAcerto() {
  const p = previaAtual;
  if (!p) return;
  const texto = p.saldo < 0
    ? `Fechar o acerto de ${p.motorista} com saldo devedor de ${reais(-p.saldo)}?`
    : `Fechar o acerto de ${p.motorista} e pagar ${reais(p.saldo)} no envelope?`;
  if (!(await confirmarAcao(texto))) return;
  const res = await post('/acertos', {
    motorista_id: p.motorista_id,
    periodo_inicio: p.periodo_inicio,
    periodo_fim: p.periodo_fim,
    observacao: document.getElementById('acerto-observacao').value.trim() || null,
  });
  if (res && res.detail) {
    toastErro('Erro: ' + extrairErro(res));
    return;
  }
  toastSucesso(`Acerto nº ${res.id} fechado. Gerando o recibo...`);
  await gerarRecibo(res.id);
  await aoTrocarMotorista();
}

async function carregarHistorico() {
  renderizarHistorico((await get('/acertos')) || [], null);
}

/* "01/09 a 30/09/2026" quando o período é do mesmo ano (cabe numa linha da tabela). */
function periodoCurto(inicio, fim) {
  const ini = formatarData(inicio), f = formatarData(fim);
  return inicio.slice(0, 4) === fim.slice(0, 4) ? `${ini.slice(0, 5)} a ${f}` : `${ini} a ${f}`;
}

function renderizarHistorico(lista, motoristaId) {
  const nome = motoristaId ? (motoristasAcerto.find(m => m.id === motoristaId) || {}).nome : null;
  document.getElementById('historico-sub').textContent = nome ? `Somente ${nome}` : 'Todos os motoristas';
  const tbody = document.getElementById('acertos-historico');
  if (!lista.length) {
    tbody.innerHTML = estadoVazio(10, 'Nenhum acerto fechado ainda', null, 'dinheiro');
    return;
  }
  const admin = ehAdmin();
  tbody.innerHTML = lista.map(a => `
    <tr>
      <td><strong>${String(a.id).padStart(4, '0')}</strong></td>
      <td><a class="link-ficha" href="motorista-ficha.html?id=${a.motorista_id}">${escapeHtml(a.motorista || '—')}</a></td>
      <td style="white-space:nowrap;">${periodoCurto(a.periodo_inicio, a.periodo_fim)}</td>
      <td>${a.qtd_viagens}</td>
      <td>${reais(a.comissao)}</td>
      <td>${reais(a.diarias_motorista)}</td>
      <td>${reais(a.total_adiantamentos)}</td>
      <td><strong>${reais(a.saldo)}</strong></td>
      <td>${formatarDataHoraUtc(a.criado_em)}</td>
      <td class="acerto-acoes">
        <button class="btn btn-outline acerto-btn-mini" onclick="abrirDetalheAcerto(${a.id})">${svgIcone(admin ? 'editar' : 'info', 12)} ${admin ? 'Abrir / corrigir' : 'Abrir'}</button>
        <button class="btn btn-outline acerto-btn-mini" onclick="gerarRecibo(${a.id})">${svgIcone('download', 12)} Recibo</button>
      </td>
    </tr>`).join('');
}

function ehAdmin() {
  return localStorage.getItem('perfil') === 'administrador';
}

/* Depois de qualquer lançamento/correção: atualiza a janela do acerto aberto
   (se houver), a prévia do motorista escolhido e o histórico. */
async function atualizarTudo() {
  if (acertoAbertoId) await abrirDetalheAcerto(acertoAbertoId);
  const id = motoristaSelecionado();
  if (id) {
    await calcularPrevia();
    renderizarHistorico((await get(`/acertos?motorista_id=${id}`)) || [], id);
  } else {
    await carregarHistorico();
  }
}

async function reabrirAcerto(id) {
  if (!(await confirmarAcao(`Reabrir o acerto nº ${id}? As viagens, diárias e vales dele voltam a ficar pendentes e o recibo deixa de valer.`))) return;
  const res = await del(`/acertos/${id}`);
  if (res && res.detail) {
    toastErro('Erro: ' + extrairErro(res));
    return;
  }
  toastSucesso('Acerto reaberto.');
  fecharDetalheAcerto();
  if (motoristaSelecionado()) await aoTrocarMotorista(); else carregarHistorico();
}

/* ===================== ACERTO FECHADO: VER E CORRIGIR ===================== */
let acertoAbertoId = null;

async function abrirDetalheAcerto(id) {
  const a = await get(`/acertos/${id}`);
  if (!a || a.detail) { toastErro('Erro: ' + extrairErro(a)); return; }
  acertoAbertoId = id;
  const admin = ehAdmin();
  const numero = String(a.id).padStart(4, '0');
  document.getElementById('acerto-detalhe-titulo').textContent = `Acerto nº ${numero} — ${a.motorista || ''}`;
  const devedor = a.saldo < 0;
  document.getElementById('acerto-detalhe-corpo').innerHTML = `
    <p class="acerto-modal-ajuda">
      Período ${formatarData(a.periodo_inicio)} a ${formatarData(a.periodo_fim)} · fechado em ${formatarDataHoraUtc(a.criado_em)}${a.fechado_por ? ' por ' + escapeHtml(a.fechado_por) : ''}.
      ${admin ? 'Corrija um vale ou uma diária lançados errado: o acerto é recalculado e o recibo sai atualizado.' : 'Só um administrador pode corrigir um acerto já fechado.'}
    </p>
    <div class="acerto-detalhe-resumo">
      <div><span>Comissão (13% de ${reais(a.total_frete)})</span><strong>+ ${reais(a.comissao)}</strong></div>
      <div><span>Diárias (⅓ de ${reais(a.total_diarias)})</span><strong>+ ${reais(a.diarias_motorista)}</strong></div>
      <div><span>Adiantamentos</span><strong>− ${reais(a.total_adiantamentos)}</strong></div>
      <div class="acerto-saldo ${devedor ? 'devedor' : ''}"><span>${devedor ? 'Saldo devedor' : 'Saldo pago'}</span><strong>${reais(Math.abs(a.saldo))}</strong></div>
    </div>

    <h3 class="acerto-detalhe-sec">Viagens (${a.viagens.length})</h3>
    <table><thead><tr><th>#</th><th>Concluída</th><th>Rota</th><th>Frete</th><th>Comissão</th></tr></thead>
      <tbody>${a.viagens.length ? a.viagens.map(v => `<tr><td>#${v.id}</td><td>${formatarData(v.data)}</td><td>${escapeHtml(v.origem)} → ${escapeHtml(v.destino)}</td><td>${reais(v.valor_frete)}</td><td>${reais(v.comissao)}</td></tr>`).join('') : estadoVazio(5, 'Nenhuma viagem', null, 'caminhao')}</tbody>
    </table>
    ${admin ? '<p class="acerto-nota">Frete errado? Corrija na tela de Entregas — este acerto acompanha.</p>' : ''}

    <h3 class="acerto-detalhe-sec">Diárias (${a.diarias.length})</h3>
    <table><thead><tr><th>Data</th><th>Entrega</th><th>Pago pelo cliente</th><th>Motorista ⅓</th><th>Caminhão ⅓</th><th>Empresa ⅓</th><th></th></tr></thead>
      <tbody>${a.diarias.length ? linhasDiarias(a.diarias, admin) : estadoVazio(7, 'Nenhuma diária', null, 'relogio')}</tbody>
    </table>

    <h3 class="acerto-detalhe-sec">Adiantamentos (${a.adiantamentos.length})</h3>
    <table><thead><tr><th>Data</th><th>Descrição</th><th>Valor</th><th></th></tr></thead>
      <tbody>${a.adiantamentos.length ? linhasAdiantamentos(a.adiantamentos, admin) : estadoVazio(4, 'Nenhum adiantamento', null, 'dinheiro')}</tbody>
    </table>

    <div class="form-group" style="margin-top:16px;">
      <label>Observação do recibo</label>
      <textarea id="acerto-detalhe-obs" rows="2" maxlength="1000" ${admin ? '' : 'disabled'}>${escapeHtml(a.observacao || '')}</textarea>
    </div>
    <div class="acerto-detalhe-acoes">
      ${admin ? `<button class="btn btn-danger" onclick="reabrirAcerto(${a.id})" title="Desfaz o fechamento inteiro">Reabrir acerto</button>` : ''}
      <span style="flex:1;"></span>
      ${admin ? `<button class="btn btn-outline" onclick="salvarObservacaoAcerto(${a.id})">Salvar observação</button>` : ''}
      <button class="btn btn-primary" onclick="gerarRecibo(${a.id})">${svgIcone('download', 14)} Recibo em PDF</button>
    </div>`;
  document.getElementById('modal-acerto').classList.add('aberto');
}

function fecharDetalheAcerto() {
  acertoAbertoId = null;
  document.getElementById('modal-acerto').classList.remove('aberto');
}

async function salvarObservacaoAcerto(id) {
  const res = await put(`/acertos/${id}`, { observacao: document.getElementById('acerto-detalhe-obs').value });
  if (res && res.detail) { toastErro('Erro: ' + extrairErro(res)); return; }
  toastSucesso('Observação salva.');
}

/* ===================== LANÇAMENTOS ===================== */
let diariaEditando = null;
let adiantamentoEditando = null;

function fecharModais() {
  document.querySelectorAll('#modal-diaria, #modal-adiantamento').forEach(m => m.classList.remove('aberto'));
}

function avisoAcertoFechado(elId, item) {
  const el = document.getElementById(elId);
  el.hidden = !item || !item.acerto_id;
  if (item && item.acerto_id) {
    el.textContent = `Este lançamento está no acerto nº ${String(item.acerto_id).padStart(4, '0')}, já fechado. Ao salvar, o acerto é recalculado — gere o recibo de novo para o motorista assinar.`;
  }
}

async function abrirModalDiaria() {
  const id = motoristaSelecionado();
  if (!id) return;
  diariaEditando = null;
  const entregas = ((await get('/entregas')) || [])
    .filter(e => e.motorista_id === id && e.status !== 'cancelado')
    .sort((a, b) => new Date(b.previsao) - new Date(a.previsao))
    .slice(0, 40);
  const sel = document.getElementById('diaria-entrega');
  sel.disabled = false;
  sel.innerHTML = entregas.length
    ? entregas.map(e => `<option value="${e.id}">#${e.id} — ${escapeHtml(e.origem)} → ${escapeHtml(e.destino)} (${(e.concluido_em ? dataUtc(e.concluido_em) : new Date(e.previsao)).toLocaleDateString('pt-BR')})</option>`).join('')
    : '<option value="">Nenhuma entrega deste motorista</option>';
  document.getElementById('diaria-titulo').textContent = 'Lançar diária';
  document.getElementById('diaria-salvar').textContent = 'Lançar diária';
  document.getElementById('diaria-data').value = dataLocalISO(new Date());
  document.getElementById('diaria-dias').value = '';
  document.getElementById('diaria-valor').value = '';
  document.getElementById('diaria-descricao').value = '';
  avisoAcertoFechado('diaria-aviso', null);
  atualizarDivisaoDiaria();
  document.getElementById('modal-diaria').classList.add('aberto');
}

function editarDiaria(id) {
  const d = diariasPorId.get(id);
  if (!d) return;
  diariaEditando = d;
  const sel = document.getElementById('diaria-entrega');
  sel.innerHTML = `<option value="${d.entrega_id}">#${d.entrega_id} — ${escapeHtml(d.rota || '')}</option>`;
  sel.disabled = true;
  document.getElementById('diaria-titulo').textContent = 'Corrigir diária';
  document.getElementById('diaria-salvar').textContent = 'Salvar correção';
  document.getElementById('diaria-data').value = d.data;
  document.getElementById('diaria-dias').value = d.dias || '';
  document.getElementById('diaria-valor').value = numeroParaMoeda(d.valor);
  document.getElementById('diaria-descricao').value = d.descricao || '';
  avisoAcertoFechado('diaria-aviso', d);
  atualizarDivisaoDiaria();
  document.getElementById('modal-diaria').classList.add('aberto');
}

/* Mesma regra da API (dividir_diaria): três terços, o centavo que sobra fica com a empresa. */
function atualizarDivisaoDiaria() {
  const valor = moedaParaNumero(document.getElementById('diaria-valor').value) || 0;
  const terco = Math.round(valor / 3 * 100) / 100;
  const empresa = Math.round((valor - 2 * terco) * 100) / 100;
  document.getElementById('diaria-divisao').innerHTML = `
    <div><span>Motorista</span><strong>${reais(terco)}</strong></div>
    <div><span>Caminhão</span><strong>${reais(terco)}</strong></div>
    <div><span>Empresa</span><strong>${reais(empresa)}</strong></div>`;
}
document.getElementById('diaria-valor').addEventListener('input', atualizarDivisaoDiaria);

async function salvarDiaria() {
  const dias = parseInt(document.getElementById('diaria-dias').value, 10);
  const dados = {
    data: document.getElementById('diaria-data').value,
    dias: dias > 0 ? dias : null,
    valor: moedaParaNumero(document.getElementById('diaria-valor').value),
    descricao: document.getElementById('diaria-descricao').value.trim() || null,
  };
  const entregaId = parseInt(document.getElementById('diaria-entrega').value, 10);
  if (!entregaId || !dados.data || !dados.valor) {
    toastAviso('Preencha entrega, data e valor.');
    return;
  }
  const res = diariaEditando
    ? await put(`/diarias/${diariaEditando.id}`, dados)
    : await post('/diarias', { entrega_id: entregaId, ...dados });
  if (res && res.detail) {
    toastErro('Erro: ' + extrairErro(res));
    return;
  }
  const corrigiuFechado = diariaEditando && diariaEditando.acerto_id;
  fecharModais();
  toastSucesso(diariaEditando ? (corrigiuFechado ? 'Diária corrigida e acerto recalculado.' : 'Diária corrigida.') : 'Diária lançada.');
  if (!diariaEditando && dados.data > document.getElementById('acerto-fim').value) {
    toastAviso('A data da diária é depois do fim do período — ela vai entrar no próximo acerto.');
  }
  diariaEditando = null;
  atualizarTudo();
}

function abrirModalAdiantamento() {
  if (!motoristaSelecionado()) return;
  adiantamentoEditando = null;
  document.getElementById('adiantamento-titulo').textContent = 'Lançar adiantamento';
  document.getElementById('adiantamento-salvar').textContent = 'Lançar adiantamento';
  document.getElementById('adiantamento-atalhos').hidden = false;
  usarDiaDoMes(new Date().getDate() >= 15 ? 15 : 5);
  document.getElementById('adiantamento-valor').value = '';
  avisoAcertoFechado('adiantamento-aviso', null);
  document.getElementById('modal-adiantamento').classList.add('aberto');
}

function editarAdiantamento(id) {
  const a = adiantamentosPorId.get(id);
  if (!a) return;
  adiantamentoEditando = a;
  document.getElementById('adiantamento-titulo').textContent = 'Corrigir adiantamento';
  document.getElementById('adiantamento-salvar').textContent = 'Salvar correção';
  document.getElementById('adiantamento-atalhos').hidden = true;
  document.getElementById('adiantamento-data').value = a.data;
  document.getElementById('adiantamento-valor').value = numeroParaMoeda(a.valor);
  document.getElementById('adiantamento-descricao').value = a.descricao || '';
  avisoAcertoFechado('adiantamento-aviso', a);
  document.getElementById('modal-adiantamento').classList.add('aberto');
}

function usarDiaDoMes(dia) {
  const hoje = new Date();
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), dia);
  if (d > hoje) d.setMonth(d.getMonth() - 1);
  document.getElementById('adiantamento-data').value = dataLocalISO(d);
  document.getElementById('adiantamento-descricao').value = `Vale do dia ${dia}`;
}

async function salvarAdiantamento() {
  const dados = {
    data: document.getElementById('adiantamento-data').value,
    valor: moedaParaNumero(document.getElementById('adiantamento-valor').value),
    descricao: document.getElementById('adiantamento-descricao').value.trim() || null,
  };
  if (!dados.data || !dados.valor) {
    toastAviso('Preencha data e valor.');
    return;
  }
  const res = adiantamentoEditando
    ? await put(`/adiantamentos/${adiantamentoEditando.id}`, dados)
    : await post('/adiantamentos', { motorista_id: motoristaSelecionado(), ...dados });
  if (res && res.detail) {
    toastErro('Erro: ' + extrairErro(res));
    return;
  }
  const corrigiuFechado = adiantamentoEditando && adiantamentoEditando.acerto_id;
  fecharModais();
  toastSucesso(adiantamentoEditando ? (corrigiuFechado ? 'Adiantamento corrigido e acerto recalculado.' : 'Adiantamento corrigido.') : 'Adiantamento lançado.');
  if (!adiantamentoEditando && dados.data > document.getElementById('acerto-fim').value) {
    toastAviso('A data do vale é depois do fim do período — ele vai entrar no próximo acerto.');
  }
  adiantamentoEditando = null;
  atualizarTudo();
}

async function excluirDiaria(id) {
  const d = diariasPorId.get(id);
  const extra = d && d.acerto_id ? ' Ela está num acerto fechado, que será recalculado.' : '';
  if (!(await confirmarAcao('Excluir esta diária?' + extra))) return;
  const res = await del(`/diarias/${id}`);
  if (res && res.detail) { toastErro('Erro: ' + extrairErro(res)); return; }
  atualizarTudo();
}

async function excluirAdiantamento(id) {
  const a = adiantamentosPorId.get(id);
  const extra = a && a.acerto_id ? ' Ele está num acerto fechado, que será recalculado.' : '';
  if (!(await confirmarAcao('Excluir este adiantamento?' + extra))) return;
  const res = await del(`/adiantamentos/${id}`);
  if (res && res.detail) { toastErro('Erro: ' + extrairErro(res)); return; }
  atualizarTudo();
}

/* ===================== VALOR POR EXTENSO (recibo) ===================== */
const EXT_UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const EXT_DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const EXT_CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function extensoAte999(n) {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), resto = n % 100;
  const partes = [];
  if (c) partes.push(EXT_CENTENAS[c]);
  if (resto < 20) { if (resto) partes.push(EXT_UNIDADES[resto]); }
  else {
    partes.push(EXT_DEZENAS[Math.floor(resto / 10)] + (resto % 10 ? ' e ' + EXT_UNIDADES[resto % 10] : ''));
  }
  return partes.join(' e ');
}

function inteiroPorExtenso(n) {
  if (n === 0) return 'zero';
  const milhoes = Math.floor(n / 1e6), milhares = Math.floor((n % 1e6) / 1000), resto = n % 1000;
  const partes = [];
  if (milhoes) partes.push(milhoes === 1 ? 'um milhão' : extensoAte999(milhoes) + ' milhões');
  if (milhares) partes.push(milhares === 1 ? 'mil' : extensoAte999(milhares) + ' mil');
  if (resto) partes.push(extensoAte999(resto));
  // "mil e quinhentos", "dois mil e trinta"; mas "dois mil, trezentos e dez" vira "dois mil trezentos e dez".
  if (partes.length > 1 && (resto < 100 || resto % 100 === 0)) {
    const ultimo = partes.pop();
    return partes.join(' ') + ' e ' + ultimo;
  }
  return partes.join(' ');
}

function valorPorExtenso(valor) {
  const centavosTotais = Math.round(Math.abs(valor) * 100);
  const reaisInt = Math.floor(centavosTotais / 100), centavos = centavosTotais % 100;
  const partes = [];
  if (reaisInt) partes.push(`${inteiroPorExtenso(reaisInt)} ${reaisInt === 1 ? 'real' : (reaisInt % 1e6 === 0 ? 'de reais' : 'reais')}`);
  if (centavos) partes.push(`${inteiroPorExtenso(centavos)} centavo${centavos === 1 ? '' : 's'}`);
  return partes.join(' e ') || 'zero real';
}

/* ===================== RECIBO EM PDF ===================== */
async function gerarRecibo(id) {
  const a = await get(`/acertos/${id}`);
  if (!a || a.detail) { toastErro('Erro: ' + extrairErro(a)); return; }
  const motorista = (await get(`/motoristas/${a.motorista_id}`)) || {};
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const largura = doc.internal.pageSize.getWidth();
  const geradoEm = new Date().toLocaleString('pt-BR');
  const numero = String(a.id).padStart(4, '0');
  const cabecalho = pdfCabecalhoRodape(doc, `Recibo de acerto nº ${numero}`, geradoEm);
  cabecalho();
  const rota = s => (s || '').replace('→', '»'); // "→" não existe na fonte padrão do jsPDF

  let y = 34;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...PDF_COR_PRIMARIA);
  doc.text('Recibo de acerto do motorista', 14, y);
  doc.setFontSize(11);
  doc.text(`Nº ${numero}`, largura - 14, y, { align: 'right' });
  y += 6;
  let x = 14;
  x += pdfPilula(doc, x, y, `Período: ${formatarData(a.periodo_inicio)} a ${formatarData(a.periodo_fim)}`) + 4;
  pdfPilula(doc, x, y, `Fechado em ${formatarDataHoraUtc(a.criado_em)}`);
  y += 16;

  doc.autoTable({
    ...PDF_ESTILO_TABELA,
    startY: y,
    theme: 'plain',
    body: [
      ['Motorista', motorista.nome || a.motorista || '—', 'CPF', motorista.cpf ? motorista.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '—'],
      ['CNH', motorista.cnh_numero ? `${motorista.cnh_numero} (cat. ${motorista.cnh_categoria})` : '—', 'Fechado por', a.fechado_por || '—'],
    ],
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 26 }, 2: { fontStyle: 'bold', cellWidth: 28 } },
    didDrawPage: cabecalho,
  });
  y = doc.lastAutoTable.finalY + 8;

  pdfTituloSecao(doc, 14, y, 'Composição do acerto', 11);
  doc.autoTable({
    ...PDF_ESTILO_TABELA,
    startY: y + 4,
    head: [['Item', 'Base de cálculo', 'Valor']],
    body: [
      ['(+) Comissão', `13% de ${reais(a.total_frete)} em ${a.qtd_viagens} viage${a.qtd_viagens === 1 ? 'm' : 'ns'}`, reais(a.comissao)],
      ['(+) Diárias', `1/3 de ${reais(a.total_diarias)} pagos pelos clientes`, reais(a.diarias_motorista)],
      ['(-) Adiantamentos', `${a.adiantamentos.length} vale${a.adiantamentos.length === 1 ? '' : 's'} (dias 5 e 15)`, reais(a.total_adiantamentos)],
    ],
    foot: [[a.saldo < 0 ? 'Saldo devedor do motorista' : 'Saldo pago ao motorista', '', reais(Math.abs(a.saldo))]],
    footStyles: { fillColor: PDF_COR_ACCENT, textColor: PDF_COR_PRIMARIA, fontStyle: 'bold', fontSize: 11 },
    columnStyles: { 2: { halign: 'right', cellWidth: 40 } },
    didDrawPage: cabecalho,
  });
  y = doc.lastAutoTable.finalY + 8;

  const secaoTabela = (titulo, head, body, opcoes = {}) => {
    if (!body.length) return;
    if (y > 245) { doc.addPage(); cabecalho(); y = 32; }
    pdfTituloSecao(doc, 14, y, titulo, 11);
    doc.autoTable({ ...PDF_ESTILO_TABELA, startY: y + 4, head: [head], body, didDrawPage: cabecalho, ...opcoes });
    y = doc.lastAutoTable.finalY + 8;
  };
  secaoTabela('Viagens', ['#', 'Concluída', 'Rota', 'Frete', 'Comissão'],
    a.viagens.map(v => [`#${v.id}`, formatarData(v.data), `${v.origem} » ${v.destino}`, reais(v.valor_frete), reais(v.comissao)]),
    { columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } } });
  secaoTabela('Diárias', ['Data', 'Entrega', 'Pago pelo cliente', 'Motorista', 'Caminhão', 'Empresa'],
    a.diarias.map(d => [formatarData(d.data), `#${d.entrega_id} ${rota(d.rota)}`, reais(d.valor), reais(d.parte_motorista), reais(d.parte_caminhao), reais(d.parte_empresa)]));
  secaoTabela('Adiantamentos', ['Data', 'Descrição', 'Valor'],
    a.adiantamentos.map(ad => [formatarData(ad.data), ad.descricao || '—', reais(ad.valor)]),
    { columnStyles: { 2: { halign: 'right' } } });

  // Declaração e assinaturas — sempre juntas na mesma página.
  if (y > 215) { doc.addPage(); cabecalho(); y = 36; }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COR_PRIMARIA);
  const declaracao = a.saldo < 0
    ? `Declaro estar ciente de que, neste acerto, os adiantamentos superaram a comissão e as diárias, ficando um saldo de ${reais(-a.saldo)} (${valorPorExtenso(a.saldo)}) a ser descontado no próximo acerto.`
    : `Declaro que recebi a importância de ${reais(a.saldo)} (${valorPorExtenso(a.saldo)}), referente ao acerto do período de ${formatarData(a.periodo_inicio)} a ${formatarData(a.periodo_fim)}, conforme a composição acima, dando plena quitação deste período.`;
  const linhas = doc.splitTextToSize(declaracao, largura - 28);
  doc.text(linhas, 14, y);
  y += linhas.length * 5 + 6;
  if (a.observacao) {
    const obs = doc.splitTextToSize(`Observação: ${a.observacao}`, largura - 28);
    doc.setTextColor(...PDF_COR_TEXTO_CLARO);
    doc.text(obs, 14, y);
    y += obs.length * 5 + 4;
  }
  doc.setTextColor(...PDF_COR_PRIMARIA);
  doc.text('Local e data: ____________________________________________', 14, y + 8);
  const yAss = y + 34;
  const meio = largura / 2;
  doc.setDrawColor(...PDF_COR_PRIMARIA);
  doc.setLineWidth(0.3);
  doc.line(18, yAss, meio - 8, yAss);
  doc.line(meio + 8, yAss, largura - 18, yAss);
  doc.setFontSize(9);
  doc.text(motorista.nome || a.motorista || 'Motorista', (18 + meio - 8) / 2, yAss + 5, { align: 'center' });
  doc.text('Motorista', (18 + meio - 8) / 2, yAss + 10, { align: 'center' });
  doc.text('Responsável pela empresa', (meio + 8 + largura - 18) / 2, yAss + 5, { align: 'center' });

  pdfFinalizarPaginas(doc);
  const nome = (motorista.nome || 'motorista').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
  doc.save(`recibo-acerto-${numero}-${nome}.pdf`);
}

iniciar();
