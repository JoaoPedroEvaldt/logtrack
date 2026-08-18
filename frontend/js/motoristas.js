checarAuth();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';
aplicarMascaraCPF(document.getElementById('cpf'));
aplicarMascaraSomenteDigitos(document.getElementById('cnh-numero'), 11);

let motoristaEditandoId = null;
let motoristasCarregados = [];

async function carregarMotoristas() {
  const data = await get('/motoristas') || [];
  motoristasCarregados = data;
  const tbody = document.getElementById('tabela-motoristas');

  if (data.length === 0) {
    tbody.innerHTML = estadoVazio(10, 'Nenhum motorista cadastrado', 'Clique em "Novo Motorista" para cadastrar o primeiro da equipe.', 'usuario');
    return;
  }

  tbody.innerHTML = data.map(m => {
    const validade = new Date(m.cnh_validade);
    const hoje = new Date();
    const dias = Math.ceil((validade - hoje) / (1000 * 60 * 60 * 24));
    const alertaCNH = dias <= 30 ? `<span style="color:var(--warning);display:inline-flex;vertical-align:-3px;margin-right:3px;">${svgIcone('alerta', 13)}</span>` : '';

    return `
      <tr>
        <td>#${m.id}</td>
        <td>${escapeHtml(m.nome) || '—'}</td>
        <td>${escapeHtml(m.cpf)}</td>
        <td>${escapeHtml(m.cnh_numero)}</td>
        <td>${escapeHtml(m.cnh_categoria)}</td>
        <td>${alertaCNH}${formatarData(m.cnh_validade)}</td>
        <td>${escapeHtml(m.telefone) || '—'}</td>
        <td><span class="badge badge-${m.status === 'disponivel' ? 'entregue' : m.status === 'em_rota' ? 'em_rota' : 'cancelado'}">${escapeHtml(m.status)}</span></td>
        <td>${m.possui_login ? `<span class="badge badge-entregue" title="${escapeHtml(m.email || '')}">Com acesso</span>` : '<span class="badge badge-cancelado">Sem acesso</span>'}</td>
        <td style="display:flex;gap:6px;">
          <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;" onclick="editarMotorista(${m.id})">${svgIcone('editar', 12)} Editar</button>
          <button class="btn btn-danger" style="font-size:11px;padding:4px 10px;" onclick="excluirMotorista(${m.id})">${svgIcone('excluir', 12)} Excluir</button>
        </td>
      </tr>
    `;
  }).join('');
}

function alternarCamposAcesso() {
  const marcado = document.getElementById('criar-acesso').checked;
  document.getElementById('campos-acesso').style.display = marcado ? 'grid' : 'none';
  if (!marcado) {
    document.getElementById('email').value = '';
    document.getElementById('senha').value = '';
  }
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
  document.getElementById('criar-acesso').checked = false;
  document.getElementById('campos-acesso').style.display = 'none';
  document.getElementById('campos-novo').style.display = 'block';
  document.getElementById('modal').classList.add('aberto');
}

function fecharModal() {
  document.getElementById('modal').classList.remove('aberto');
}

function editarMotorista(id) {
  const m = motoristasCarregados.find(m => m.id === id);
  if (!m) return;
  motoristaEditandoId = id;
  document.querySelector('#modal .modal-header h2').textContent = 'Editar Motorista';
  document.getElementById('nome').value = m.nome || '';
  document.getElementById('telefone').value = m.telefone || '';
  document.getElementById('cnh-categoria').value = m.cnh_categoria;
  document.getElementById('cnh-validade').value = m.cnh_validade;
  document.getElementById('campos-novo').style.display = 'none';
  document.getElementById('modal').classList.add('aberto');
}

async function excluirMotorista(id) {
  if (!(await confirmarAcao('Deseja desativar este motorista?'))) return;
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
    const criarAcesso = document.getElementById('criar-acesso').checked;
    const dados = {
      nome: document.getElementById('nome').value,
      cpf: document.getElementById('cpf').value,
      cnh_numero: document.getElementById('cnh-numero').value,
      cnh_categoria: document.getElementById('cnh-categoria').value,
      cnh_validade: document.getElementById('cnh-validade').value,
      telefone: document.getElementById('telefone').value || null,
      email: criarAcesso ? document.getElementById('email').value : null,
      senha: criarAcesso ? document.getElementById('senha').value : null,
    };

    if (!dados.nome || !dados.cpf || !dados.cnh_numero || !dados.cnh_categoria || !dados.cnh_validade) {
      toastAviso('Preencha todos os campos obrigatórios!');
      return;
    }
    if (dados.cpf.replace(/\D/g, '').length !== 11) {
      toastAviso('CPF incompleto! Informe os 11 dígitos.');
      return;
    }
    if (dados.cnh_numero.length !== 11) {
      toastAviso('Número da CNH incompleto! Informe os 11 dígitos.');
      return;
    }
    if (criarAcesso && (!dados.email || !dados.senha)) {
      toastAviso('Para criar acesso, preencha e-mail e senha!');
      return;
    }
    if (criarAcesso && dados.senha.length < 8) {
      toastAviso('A senha de acesso deve ter no mínimo 8 caracteres!');
      return;
    }

    res = await post('/motoristas', dados);
  }

  if (res.detail) {
    toastErro('Erro: ' + extrairErro(res));
    return;
  }

  fecharModal();
  carregarMotoristas();
}

carregarMotoristas();