checarAuth();
checarStaff();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';

let conjuntoEditandoId = null;
let conjuntosCarregados = [];
let motoristasCarregados = [];
let veiculosCarregados = [];

/* ===================== LISTA "CONJUNTOS ATIVOS" ===================== */

async function carregarConjuntos() {
  const data = await get('/conjuntos') || [];
  conjuntosCarregados = data;
  renderizarListaConjuntos();
}

function conjuntoCombinaBusca(c, termo) {
  if (!termo) return true;
  const alvo = [
    c.nome,
    c.motorista && c.motorista.nome,
    c.cavalo && `${c.cavalo.placa} ${c.cavalo.marca} ${c.cavalo.modelo}`,
    c.semirreboque1 && `${c.semirreboque1.placa} ${c.semirreboque1.modelo}`,
    c.semirreboque2 && `${c.semirreboque2.placa} ${c.semirreboque2.modelo}`,
  ].filter(Boolean).join(' ').toLowerCase();
  return alvo.includes(termo);
}

function pecaConjunto(rotulo, icone, principal, secundario) {
  const vazia = !principal;
  return `
    <div class="conjunto-peca${vazia ? ' vazia' : ''}">
      <span class="conjunto-peca-icone">${svgIcone(icone, 16)}</span>
      <div class="conjunto-peca-texto">
        <span class="conjunto-peca-rotulo">${rotulo}</span>
        <span class="conjunto-peca-principal">${vazia ? 'Não definido' : escapeHtml(principal)}</span>
        ${secundario ? `<span class="conjunto-peca-sec">${escapeHtml(secundario)}</span>` : ''}
      </div>
    </div>`;
}

function renderizarListaConjuntos() {
  const container = document.getElementById('lista-conjuntos');
  const termo = (document.getElementById('busca-conjuntos').value || '').trim().toLowerCase();
  const visiveis = conjuntosCarregados.filter(c => conjuntoCombinaBusca(c, termo));

  const emViagem = conjuntosCarregados.filter(c => c.viagem_atual).length;
  document.getElementById('conjuntos-resumo').textContent = conjuntosCarregados.length
    ? `${conjuntosCarregados.length} no total · ${emViagem} em viagem · ${conjuntosCarregados.length - emViagem} disponíveis`
    : '';

  if (conjuntosCarregados.length === 0) {
    container.innerHTML = estadoVazio(null, 'Nenhum conjunto cadastrado', 'Clique em "Novo conjunto" para vincular motorista, cavalo mecânico e semirreboques.', 'link');
    return;
  }
  if (visiveis.length === 0) {
    container.innerHTML = estadoVazio(null, 'Nenhum conjunto encontrado', 'Nenhum conjunto bate com a busca. Tente outra placa ou nome.', 'link');
    return;
  }

  const cardsHtml = visiveis.map(c => {
    const v = c.viagem_atual;
    const estado = v
      ? `<span class="conjunto-estado em-viagem" title="${escapeHtml(v.cliente)}"><i></i>Em viagem · ${escapeHtml(v.destino)}</span>`
      : `<span class="conjunto-estado disponivel"><i></i>Disponível</span>`;
    return `
    <div class="conjunto-card">
      <div class="conjunto-card-topo">
        <div class="conjunto-linha-foto" data-upload-foto ${c.foto_path ? '' : `onclick="acionarUploadFoto(this)" title="Clique para adicionar a foto"`}>
          ${c.foto_path
            ? `<img src="${urlFoto(c.foto_path)}" alt="Foto do conjunto ${escapeHtml(c.nome)}" onclick="abrirFotoTelaCheia('${urlFoto(c.foto_path)}')" title="Clique para ampliar" />`
            : svgIcone('caminhao', 28)}
          <span class="conjunto-linha-foto-overlay" onclick="event.stopPropagation(); acionarUploadFoto(this)" title="${c.foto_path ? 'Trocar' : 'Adicionar'} foto">${svgIcone('camera', 14)}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onchange="enviarFotoConjunto(${c.id}, this.files[0])" />
        </div>
        <div class="conjunto-card-titulo">
          <div class="conjunto-card-nome">${escapeHtml(c.nome)}</div>
          ${estado}
        </div>
        <div class="conjunto-linha-acoes">
          <button class="btn-icone" title="Editar" onclick="editarConjunto(${c.id})">${svgIcone('editar', 15)}</button>
          <button class="btn-icone perigo" title="Excluir" onclick="excluirConjunto(${c.id})">${svgIcone('excluir', 15)}</button>
        </div>
      </div>
      <div class="conjunto-card-pecas">
        ${pecaConjunto('Motorista', 'usuario', c.motorista && (c.motorista.nome || 'Sem nome'), '')}
        ${pecaConjunto('Cavalo', 'caminhao', c.cavalo && c.cavalo.placa, c.cavalo && `${c.cavalo.marca} ${c.cavalo.modelo}`)}
        ${pecaConjunto('Semirreboque 1', 'reboque', c.semirreboque1 && c.semirreboque1.placa, c.semirreboque1 && c.semirreboque1.modelo)}
        ${pecaConjunto('Semirreboque 2', 'reboque', c.semirreboque2 && c.semirreboque2.placa, c.semirreboque2 && c.semirreboque2.modelo)}
      </div>
    </div>`;
  }).join('');
  container.innerHTML = `<div class="conjuntos-grade">${cardsHtml}</div>`;
}

function alternarBuilder(abrir) {
  const painel = document.getElementById('conjunto-builder');
  const mostrar = abrir === undefined ? painel.hidden : abrir;
  painel.hidden = !mostrar;
  document.getElementById('btn-novo-conjunto').hidden = mostrar;
  if (mostrar) painel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function enviarFotoConjunto(id, arquivo) {
  if (!arquivo) return;

  const tiposAceitos = ['image/jpeg', 'image/png', 'image/webp'];
  if (!tiposAceitos.includes(arquivo.type)) {
    toastAviso('Formato de imagem inválido. Envie JPEG, PNG ou WebP.');
    return;
  }
  if (arquivo.size > 5 * 1024 * 1024) {
    toastAviso('A imagem deve ter no máximo 5MB.');
    return;
  }

  const formData = new FormData();
  formData.append('foto', arquivo);
  const res = await enviarArquivo(`/conjuntos/${id}/foto`, formData);

  if (res && res.detail) {
    toastErro('Erro: ' + extrairErro(res));
    return;
  }

  await carregarConjuntos();
}

async function excluirConjunto(id) {
  if (!(await confirmarAcao('Deseja desativar este conjunto?'))) return;
  await del(`/conjuntos/${id}`);
  await carregarConjuntos();
  await carregarBuilder();
}

/* ===================== BUILDER "COMPOR NOVO CONJUNTO" ===================== */

function veiculosEmUso(excluirConjuntoId) {
  const mapa = {};
  conjuntosCarregados.forEach(c => {
    if (excluirConjuntoId && c.id === excluirConjuntoId) return;
    [c.cavalo_id, c.semirreboque1_id, c.semirreboque2_id].forEach(id => { if (id) mapa[id] = c.nome; });
  });
  return mapa;
}

function preencherSelectVeiculoBuilder(selId, tipoEsperado) {
  const sel = document.getElementById(selId);
  const valorAtual = sel.value;
  const emUso = veiculosEmUso();
  sel.innerHTML = '<option value="">+ Selecionar</option>' + veiculosCarregados
    .filter(v => v.tipo === tipoEsperado)
    .map(v => {
      const bloqueado = emUso[v.id] && String(v.id) !== valorAtual;
      return `<option value="${v.id}" ${bloqueado ? 'disabled' : ''}>${escapeHtml(v.placa)} — ${escapeHtml(v.modelo)}${bloqueado ? ` (em uso em "${escapeHtml(emUso[v.id])}")` : ''}</option>`;
    }).join('');
  if ([...sel.options].some(o => o.value === valorAtual)) sel.value = valorAtual;
}

function preencherSelectMotoristaBuilder() {
  const sel = document.getElementById('build-motorista-id');
  const valorAtual = sel.value;
  sel.innerHTML = '<option value="">+ Selecionar</option>' + motoristasCarregados
    .map(m => `<option value="${m.id}">${escapeHtml(m.nome || 'Sem nome')}</option>`).join('');
  if ([...sel.options].some(o => o.value === valorAtual)) sel.value = valorAtual;
}

const CAMPOS_SLOT = {
  motorista: { select: 'build-motorista-id', sub: 'build-motorista-sub', slot: 'slot-motorista' },
  cavalo: { select: 'build-cavalo-id', sub: 'build-cavalo-sub', slot: 'slot-cavalo' },
  semirreboque1: { select: 'build-semi1-id', sub: 'build-semi1-sub', slot: 'slot-semi1' },
  semirreboque2: { select: 'build-semi2-id', sub: 'build-semi2-sub', slot: 'slot-semi2' },
};

function atualizarSubBuilder(tipo) {
  const campos = CAMPOS_SLOT[tipo];
  const id = parseInt(document.getElementById(campos.select).value) || null;

  if (tipo === 'motorista') {
    const m = motoristasCarregados.find(m => m.id === id);
    document.getElementById(campos.sub).textContent = m ? `CNH categoria ${m.cnh_categoria}` : '';
  } else {
    const v = veiculosCarregados.find(v => v.id === id);
    document.getElementById(campos.sub).textContent = v ? `${escapeHtml(v.marca)} ${escapeHtml(v.modelo)}` : '';
  }

  document.getElementById(campos.slot).classList.toggle('vazio', !id);
}

function limparBuilder() {
  Object.values(CAMPOS_SLOT).forEach(({ select, sub, slot }) => {
    document.getElementById(select).value = '';
    document.getElementById(sub).textContent = '';
    document.getElementById(slot).classList.add('vazio');
  });
}

async function carregarBuilder() {
  motoristasCarregados = await get('/motoristas') || [];
  veiculosCarregados = await get('/veiculos') || [];
  preencherSelectMotoristaBuilder();
  preencherSelectVeiculoBuilder('build-cavalo-id', 'cavalo');
  preencherSelectVeiculoBuilder('build-semi1-id', 'semirreboque');
  preencherSelectVeiculoBuilder('build-semi2-id', 'semirreboque');
}

function proximoNomeConjunto() {
  const nomesExistentes = new Set(conjuntosCarregados.map(c => c.nome));
  let n = conjuntosCarregados.length + 1;
  while (nomesExistentes.has(`Conjunto ${String(n).padStart(2, '0')}`)) n++;
  return `Conjunto ${String(n).padStart(2, '0')}`;
}

async function salvarConjuntoBuilder() {
  const dados = {
    nome: proximoNomeConjunto(),
    motorista_id: parseInt(document.getElementById('build-motorista-id').value) || null,
    cavalo_id: parseInt(document.getElementById('build-cavalo-id').value) || null,
    semirreboque1_id: parseInt(document.getElementById('build-semi1-id').value) || null,
    semirreboque2_id: parseInt(document.getElementById('build-semi2-id').value) || null,
  };

  if (!dados.motorista_id && !dados.cavalo_id) {
    toastAviso('Selecione ao menos um motorista ou cavalo-mecânico para montar o conjunto!');
    return;
  }

  const res = await post('/conjuntos', dados);
  if (res && res.detail) {
    toastErro('Erro: ' + extrairErro(res));
    return;
  }

  toastSucesso(`"${dados.nome}" criado com sucesso!`);
  limparBuilder();
  alternarBuilder(false);
  await carregarConjuntos();
  await carregarBuilder();
}

/* ===================== MODAL DE EDIÇÃO ===================== */

function preencherSelectsModal(excluirConjuntoId) {
  const emUso = veiculosEmUso(excluirConjuntoId);
  const tipoPorSelect = { 'cavalo-id': 'cavalo', 'semirreboque1-id': 'semirreboque', 'semirreboque2-id': 'semirreboque' };
  Object.keys(tipoPorSelect).forEach(selId => {
    const sel = document.getElementById(selId);
    const tipoEsperado = tipoPorSelect[selId];
    sel.innerHTML = '<option value="">Sem veículo</option>';
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

  const selMotorista = document.getElementById('motorista-id');
  selMotorista.innerHTML = '<option value="">Sem motorista</option>' + motoristasCarregados
    .map(m => `<option value="${m.id}">${escapeHtml(m.nome || 'Sem nome')} — CPF: ${escapeHtml(m.cpf)}</option>`).join('');
}

function fecharModal() {
  document.getElementById('modal').classList.remove('aberto');
}

function editarConjunto(id) {
  const c = conjuntosCarregados.find(c => c.id === id);
  if (!c) return;
  conjuntoEditandoId = id;
  preencherSelectsModal(id);
  document.getElementById('nome').value = c.nome;
  document.getElementById('motorista-id').value = c.motorista_id || '';
  document.getElementById('cavalo-id').value = c.cavalo_id || '';
  document.getElementById('semirreboque1-id').value = c.semirreboque1_id || '';
  document.getElementById('semirreboque2-id').value = c.semirreboque2_id || '';
  document.getElementById('modal').classList.add('aberto');
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

  const res = await put(`/conjuntos/${conjuntoEditandoId}`, dados);

  if (res && res.detail) {
    toastErro('Erro: ' + extrairErro(res));
    return;
  }

  fecharModal();
  await carregarConjuntos();
  await carregarBuilder();
}

async function iniciar() {
  await carregarConjuntos();
  await carregarBuilder();
}
iniciar();
