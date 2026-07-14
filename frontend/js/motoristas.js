checarAuth();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';

let motoristaEditandoId = null;

async function carregarMotoristas() {
  const data = await get('/motoristas') || [];
  const tbody = document.getElementById('tabela-motoristas');

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#888;">Nenhum motorista cadastrado</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(m => {
    const validade = new Date(m.cnh_validade);
    const hoje = new Date();
    const dias = Math.ceil((validade - hoje) / (1000 * 60 * 60 * 24));
    const alertaCNH = dias <= 30 ? '⚠️ ' : '';

    return `
      <tr>
        <td>#${m.id}</td>
        <td>${m.nome || '—'}</td>
        <td>${m.cpf}</td>
        <td>${m.cnh_numero}</td>
        <td>${m.cnh_categoria}</td>
        <td>${alertaCNH}${formatarData(m.cnh_validade)}</td>
        <td>${m.telefone || '—'}</td>
        <td><span class="badge badge-${m.status === 'disponivel' ? 'entregue' : m.status === 'em_rota' ? 'em_rota' : 'cancelado'}">${m.status}</span></td>
        <td style="display:flex;gap:6px;">
          <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;" onclick="editarMotorista(${m.id}, '${m.nome || ''}', '${m.telefone || ''}', '${m.cnh_categoria}', '${m.cnh_validade}')">✏️ Editar</button>
          <button class="btn btn-danger" style="font-size:11px;padding:4px 10px;" onclick="excluirMotorista(${m.id})">🗑️ Excluir</button>
        </td>
      </tr>
    `;
  }).join('');
}

function abrirModal() {
  motoristaEditandoId = null;
  document.querySelector('#modal .modal-header h2').textContent = 'Novo Motorista';
  document.getElementById('nome').value = '';
  document.getElementById('email').value = '';
  document.getElementById('senha').value = '';
  document.getElementById('cpf').value = '';
  document.getElementById('cnh-numero').value = '';
  document.getElementById('cnh-categoria').value = '';
  document.getElementById('cnh-validade').value = '';
  document.getElementById('telefone').value = '';
  document.getElementById('campos-novo').style.display = 'block';
  document.getElementById('modal').classList.add('aberto');
}

function fecharModal() {
  document.getElementById('modal').classList.remove('aberto');
}

function editarMotorista(id, nome, telefone, cnhCategoria, cnhValidade) {
  motoristaEditandoId = id;
  document.querySelector('#modal .modal-header h2').textContent = 'Editar Motorista';
  document.getElementById('nome').value = nome;
  document.getElementById('telefone').value = telefone;
  document.getElementById('cnh-categoria').value = cnhCategoria;
  document.getElementById('cnh-validade').value = cnhValidade;
  document.getElementById('campos-novo').style.display = 'none';
  document.getElementById('modal').classList.add('aberto');
}

async function excluirMotorista(id) {
  if (!confirm('Deseja desativar este motorista?')) return;
  await del(`/motoristas/${id}`);
  carregarMotoristas();
}

async function salvarMotorista() {
  let res;

  if (motoristaEditandoId) {
    const dados = {
      nome: document.getElementById('nome').value,
      telefone: document.getElementById('telefone').value || null,
      cnh_categoria: document.getElementById('cnh-categoria').value,
      cnh_validade: document.getElementById('cnh-validade').value,
    };
    res = await put(`/motoristas/${motoristaEditandoId}`, dados);
  } else {
    const dados = {
      nome: document.getElementById('nome').value,
      email: document.getElementById('email').value,
      senha: document.getElementById('senha').value,
      cpf: document.getElementById('cpf').value,
      cnh_numero: document.getElementById('cnh-numero').value,
      cnh_categoria: document.getElementById('cnh-categoria').value,
      cnh_validade: document.getElementById('cnh-validade').value,
      telefone: document.getElementById('telefone').value || null,
    };

    if (!dados.nome || !dados.email || !dados.senha || !dados.cpf || !dados.cnh_numero || !dados.cnh_categoria || !dados.cnh_validade) {
      alert('Preencha todos os campos obrigatórios!');
      return;
    }

    res = await post('/motoristas', dados);
  }

  if (res.detail) {
    alert('Erro: ' + res.detail);
    return;
  }

  fecharModal();
  carregarMotoristas();
}

carregarMotoristas();