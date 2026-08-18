checarAuth();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';

let conjuntoEditandoId = null;
let conjuntosCarregados = [];
let veiculosCarregados = [];

async function carregarConjuntos() {
  const data = await get('/conjuntos') || [];
  conjuntosCarregados = data;
  const container = document.getElementById('cards-conjuntos');

  if (data.length === 0) {
    container.innerHTML = `<div style="grid-column:1/-1;">${estadoVazio(null, 'Nenhum conjunto cadastrado', 'Monte seu primeiro conjunto vinculando motorista, cavalo mecânico e semirreboques.', 'link')}</div>`;
    return;
  }

  container.innerHTML = data.map(c => `
    <div class="card" style="border-left:4px solid var(--primary);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
        <div>
          <div style="font-size:16px;font-weight:600;color:var(--text);display:flex;align-items:center;gap:8px;">${svgIcone('link', 17)} ${escapeHtml(c.nome)}</div>
          <span class="badge badge-entregue" style="margin-top:6px;">ativo</span>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;" onclick="editarConjunto(${c.id})">${svgIcone('editar', 12)} Editar</button>
          <button class="btn btn-danger" style="font-size:11px;padding:4px 10px;" onclick="excluirConjunto(${c.id})">${svgIcone('excluir', 12)} Excluir</button>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg);border-radius:8px;">
          <span class="info-icon">${svgIcone('usuario', 16)}</span>
          <div>
            <div style="font-size:11px;color:var(--text-light);text-transform:uppercase;">Motorista</div>
            <div style="font-size:13px;font-weight:500;color:var(--text);">
              ${c.motorista ? `${escapeHtml(c.motorista.nome) || 'Sem nome'} <span style="color:var(--text-light);font-weight:400;">— CPF: ${escapeHtml(c.motorista.cpf)}</span>` : '<span style="color:var(--text-light);">Não atribuído</span>'}
            </div>
          </div>
        </div>

        ${c.motorista ? `
        <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg);border-radius:8px;">
          <span class="info-icon">${svgIcone('caminhao', 16)}</span>
          <div>
            <div style="font-size:11px;color:var(--text-light);text-transform:uppercase;">Viagem atual</div>
            <div style="font-size:13px;font-weight:500;color:var(--text);">
              ${c.viagem_atual
                ? `${escapeHtml(c.viagem_atual.cliente)} → ${escapeHtml(c.viagem_atual.destino)} ${badgeStatus(c.viagem_atual.status)}`
                : '<span class="badge badge-entregue">Disponível</span>'}
            </div>
          </div>
        </div>` : ''}

        <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg);border-radius:8px;">
          <span class="info-icon">${svgIcone('caminhao', 16)}</span>
          <div>
            <div style="font-size:11px;color:var(--text-light);text-transform:uppercase;">Cavalo Mecânico</div>
            <div style="font-size:13px;font-weight:500;color:var(--text);">
              ${c.cavalo ? `${escapeHtml(c.cavalo.placa)} — ${escapeHtml(c.cavalo.modelo)} ${escapeHtml(c.cavalo.marca)}` : '<span style="color:var(--text-light);">Não atribuído</span>'}
            </div>
          </div>
        </div>

        ${c.semirreboque1 ? `
        <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg);border-radius:8px;">
          <span class="info-icon">${svgIcone('reboque', 16)}</span>
          <div>
            <div style="font-size:11px;color:var(--text-light);text-transform:uppercase;">Semirreboque 1</div>
            <div style="font-size:13px;font-weight:500;color:var(--text);">${escapeHtml(c.semirreboque1.placa)} — ${escapeHtml(c.semirreboque1.modelo)} ${escapeHtml(c.semirreboque1.marca)}</div>
          </div>
        </div>` : ''}

        ${c.semirreboque2 ? `
        <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg);border-radius:8px;">
          <span class="info-icon">${svgIcone('reboque', 16)}</span>
          <div>
            <div style="font-size:11px;color:var(--text-light);text-transform:uppercase;">Semirreboque 2</div>
            <div style="font-size:13px;font-weight:500;color:var(--text);">${escapeHtml(c.semirreboque2.placa)} — ${escapeHtml(c.semirreboque2.modelo)} ${escapeHtml(c.semirreboque2.marca)}</div>
          </div>
        </div>` : ''}
      </div>
    </div>
  `).join('');
}

async function carregarSelects() {
  const motoristas = await get('/motoristas') || [];
  veiculosCarregados = await get('/veiculos') || [];

  const selMotorista = document.getElementById('motorista-id');
  while (selMotorista.options.length > 1) selMotorista.remove(1);
  motoristas.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.nome || 'Sem nome'} — CPF: ${m.cpf}`;
    selMotorista.appendChild(opt);
  });

  preencherSelectsVeiculo();
}

/* Mapa veiculoId -> nome do conjunto ativo que já o está usando.
   excluirConjuntoId ignora o próprio conjunto (para não travar seus próprios veículos ao editar). */
function veiculosEmUso(excluirConjuntoId) {
  const mapa = {};
  conjuntosCarregados.forEach(c => {
    if (excluirConjuntoId && c.id === excluirConjuntoId) return;
    [c.cavalo_id, c.semirreboque1_id, c.semirreboque2_id].forEach(id => {
      if (id) mapa[id] = c.nome;
    });
  });
  return mapa;
}

function preencherSelectsVeiculo(excluirConjuntoId) {
  const emUso = veiculosEmUso(excluirConjuntoId);
  const tipoPorSelect = { 'cavalo-id': 'cavalo', 'semirreboque1-id': 'semirreboque', 'semirreboque2-id': 'semirreboque' };
  Object.keys(tipoPorSelect).forEach(selId => {
    const sel = document.getElementById(selId);
    const tipoEsperado = tipoPorSelect[selId];
    while (sel.options.length > 1) sel.remove(1);
    veiculosCarregados.filter(v => v.tipo === tipoEsperado).forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.id;
      const conjuntoQueUsa = emUso[v.id];
      opt.textContent = conjuntoQueUsa
        ? `${v.placa} — ${v.modelo} ${v.marca} (em uso em "${conjuntoQueUsa}")`
        : `${v.placa} — ${v.modelo} ${v.marca}`;
      if (conjuntoQueUsa) opt.disabled = true;
      sel.appendChild(opt);
    });
  });
}

function abrirModal() {
  conjuntoEditandoId = null;
  document.getElementById('modal-titulo').textContent = 'Novo Conjunto';
  document.getElementById('nome').value = '';
  document.getElementById('motorista-id').value = '';
  preencherSelectsVeiculo();
  document.getElementById('cavalo-id').value = '';
  document.getElementById('semirreboque1-id').value = '';
  document.getElementById('semirreboque2-id').value = '';
  document.getElementById('modal').classList.add('aberto');
}

function fecharModal() {
  document.getElementById('modal').classList.remove('aberto');
}

function editarConjunto(id) {
  const c = conjuntosCarregados.find(c => c.id === id);
  if (!c) return;
  conjuntoEditandoId = id;
  document.getElementById('modal-titulo').textContent = 'Editar Conjunto';
  document.getElementById('nome').value = c.nome;
  document.getElementById('motorista-id').value = c.motorista_id || '';
  preencherSelectsVeiculo(id);
  document.getElementById('cavalo-id').value = c.cavalo_id || '';
  document.getElementById('semirreboque1-id').value = c.semirreboque1_id || '';
  document.getElementById('semirreboque2-id').value = c.semirreboque2_id || '';
  document.getElementById('modal').classList.add('aberto');
}

async function excluirConjunto(id) {
  if (!(await confirmarAcao('Deseja desativar este conjunto?'))) return;
  await del(`/conjuntos/${id}`);
  carregarConjuntos();
}

async function salvarConjunto() {
  const dados = {
    nome: document.getElementById('nome').value,
    motorista_id: parseInt(document.getElementById('motorista-id').value) || null,
    cavalo_id: parseInt(document.getElementById('cavalo-id').value) || null,
    semirreboque1_id: parseInt(document.getElementById('semirreboque1-id').value) || null,
    semirreboque2_id: parseInt(document.getElementById('semirreboque2-id').value) || null,
  };

  if (!dados.nome) {
    toastAviso('Preencha o nome do conjunto!');
    return;
  }

  let res;
  if (conjuntoEditandoId) {
    res = await put(`/conjuntos/${conjuntoEditandoId}`, dados);
  } else {
    res = await post('/conjuntos', dados);
  }

  if (res && res.detail) {
    toastErro('Erro: ' + extrairErro(res));
    return;
  }

  fecharModal();
  carregarConjuntos();
}

async function iniciar() {
  await carregarConjuntos();
  await carregarSelects();
}
iniciar();