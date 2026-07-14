checarAuth();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';

let conjuntoEditandoId = null;

async function carregarConjuntos() {
  const data = await get('/conjuntos') || [];
  const container = document.getElementById('cards-conjuntos');

  if (data.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-light);padding:40px;grid-column:span 3;">Nenhum conjunto cadastrado</div>';
    return;
  }

  container.innerHTML = data.map(c => `
    <div class="card" style="border-left:4px solid var(--primary);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
        <div>
          <div style="font-size:16px;font-weight:600;color:var(--text);">🔗 ${c.nome}</div>
          <span class="badge badge-entregue" style="margin-top:6px;">ativo</span>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;" onclick="editarConjunto(${c.id}, '${c.nome}', ${c.motorista_id || 'null'}, ${c.cavalo_id || 'null'}, ${c.semirreboque1_id || 'null'}, ${c.semirreboque2_id || 'null'})">✏️</button>
          <button class="btn btn-danger" style="font-size:11px;padding:4px 10px;" onclick="excluirConjunto(${c.id})">🗑️</button>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg);border-radius:8px;">
          <span style="font-size:20px;">👤</span>
          <div>
            <div style="font-size:11px;color:var(--text-light);text-transform:uppercase;">Motorista</div>
            <div style="font-size:13px;font-weight:500;color:var(--text);">
              ${c.motorista ? `${c.motorista.cpf}` : '<span style="color:var(--text-light);">Não atribuído</span>'}
            </div>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg);border-radius:8px;">
          <span style="font-size:20px;">🚛</span>
          <div>
            <div style="font-size:11px;color:var(--text-light);text-transform:uppercase;">Cavalo Mecânico</div>
            <div style="font-size:13px;font-weight:500;color:var(--text);">
              ${c.cavalo ? `${c.cavalo.placa} — ${c.cavalo.modelo} ${c.cavalo.marca}` : '<span style="color:var(--text-light);">Não atribuído</span>'}
            </div>
          </div>
        </div>

        ${c.semirreboque1 ? `
        <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg);border-radius:8px;">
          <span style="font-size:20px;">🚌</span>
          <div>
            <div style="font-size:11px;color:var(--text-light);text-transform:uppercase;">Semirreboque 1</div>
            <div style="font-size:13px;font-weight:500;color:var(--text);">${c.semirreboque1.placa} — ${c.semirreboque1.modelo} ${c.semirreboque1.marca}</div>
          </div>
        </div>` : ''}

        ${c.semirreboque2 ? `
        <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg);border-radius:8px;">
          <span style="font-size:20px;">🚌</span>
          <div>
            <div style="font-size:11px;color:var(--text-light);text-transform:uppercase;">Semirreboque 2</div>
            <div style="font-size:13px;font-weight:500;color:var(--text);">${c.semirreboque2.placa} — ${c.semirreboque2.modelo} ${c.semirreboque2.marca}</div>
          </div>
        </div>` : ''}
      </div>
    </div>
  `).join('');
}

async function carregarSelects() {
  const motoristas = await get('/motoristas') || [];
  const veiculos = await get('/veiculos') || [];

  const selMotorista = document.getElementById('motorista-id');
  while (selMotorista.options.length > 1) selMotorista.remove(1);
  motoristas.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.nome || 'Sem nome'} — CPF: ${m.cpf}`;
    selMotorista.appendChild(opt);
  });

  const cavalosSel = ['cavalo-id', 'semirreboque1-id', 'semirreboque2-id'];
  cavalosSel.forEach(selId => {
    const sel = document.getElementById(selId);
    while (sel.options.length > 1) sel.remove(1);
    veiculos.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = `${v.placa} — ${v.modelo} ${v.marca}`;
      sel.appendChild(opt);
    });
  });
}

function abrirModal() {
  conjuntoEditandoId = null;
  document.getElementById('modal-titulo').textContent = 'Novo Conjunto';
  document.getElementById('nome').value = '';
  document.getElementById('motorista-id').value = '';
  document.getElementById('cavalo-id').value = '';
  document.getElementById('semirreboque1-id').value = '';
  document.getElementById('semirreboque2-id').value = '';
  document.getElementById('modal').classList.add('aberto');
}

function fecharModal() {
  document.getElementById('modal').classList.remove('aberto');
}

function editarConjunto(id, nome, motoristaId, cavaloId, semi1Id, semi2Id) {
  conjuntoEditandoId = id;
  document.getElementById('modal-titulo').textContent = 'Editar Conjunto';
  document.getElementById('nome').value = nome;
  document.getElementById('motorista-id').value = motoristaId || '';
  document.getElementById('cavalo-id').value = cavaloId || '';
  document.getElementById('semirreboque1-id').value = semi1Id || '';
  document.getElementById('semirreboque2-id').value = semi2Id || '';
  document.getElementById('modal').classList.add('aberto');
}

async function excluirConjunto(id) {
  if (!confirm('Deseja desativar este conjunto?')) return;
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
    alert('Preencha o nome do conjunto!');
    return;
  }

  let res;
  if (conjuntoEditandoId) {
    res = await put(`/conjuntos/${conjuntoEditandoId}`, dados);
  } else {
    res = await post('/conjuntos', dados);
  }

  if (res.detail) {
    alert('Erro: ' + res.detail);
    return;
  }

  fecharModal();
  carregarConjuntos();
}

carregarConjuntos();
carregarSelects();