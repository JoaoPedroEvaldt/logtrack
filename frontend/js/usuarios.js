checarAuth();
checarAdmin();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';

let usuarioEditandoId = null;
let usuarioLogadoId = null;

const LABEL_PERFIL = { administrador: 'Administrador', operador: 'Operador', motorista: 'Motorista' };

async function carregarUsuarios() {
  const data = await get('/usuarios') || [];
  const tbody = document.getElementById('tabela-usuarios');

  const staff = data.filter(u => u.perfil !== 'motorista');
  usuarioLogadoId = obterIdUsuarioLogado();

  if (staff.length === 0) {
    tbody.innerHTML = estadoVazio(6, 'Nenhum usuário cadastrado', 'Crie o primeiro login de acesso ao sistema.', 'usuario');
    return;
  }

  tbody.innerHTML = staff.map(u => `
    <tr>
      <td>#${u.id}</td>
      <td>${escapeHtml(u.nome)}${u.id === usuarioLogadoId ? ' <span style="color:var(--text-light);font-size:12px;">(você)</span>' : ''}</td>
      <td>${escapeHtml(u.email)}</td>
      <td><span class="badge badge-tipo-${u.perfil === 'administrador' ? 1 : 3}">${LABEL_PERFIL[u.perfil] || escapeHtml(u.perfil)}</span></td>
      <td><span class="badge badge-${u.ativo ? 'entregue' : 'cancelado'}">${u.ativo ? 'Ativo' : 'Inativo'}</span></td>
      <td style="display:flex;gap:6px;">
        <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;" onclick="editarUsuario(${u.id})">${svgIcone('editar', 12)} Editar</button>
        ${u.id === usuarioLogadoId
          ? ''
          : `<button class="btn ${u.ativo ? 'btn-danger' : 'btn-outline'}" style="font-size:11px;padding:4px 10px;" onclick="alternarAtivo(${u.id}, ${u.ativo})">${u.ativo ? 'Desativar' : 'Reativar'}</button>`}
      </td>
    </tr>
  `).join('');
}

function abrirModal() {
  usuarioEditandoId = null;
  document.getElementById('modal-titulo').textContent = 'Novo Usuário';
  document.getElementById('nome').value = '';
  document.getElementById('email').value = '';
  document.getElementById('senha').value = '';
  document.getElementById('perfil').value = '';
  document.getElementById('label-senha').textContent = 'Senha *';
  document.getElementById('senha').placeholder = 'Mínimo 8 caracteres';
  document.getElementById('dica-senha-edicao').style.display = 'none';
  document.getElementById('grupo-perfil').style.display = 'block';
  document.getElementById('modal').classList.add('aberto');
}

async function editarUsuario(id) {
  const data = await get('/usuarios') || [];
  const u = data.find(u => u.id === id);
  if (!u) return;

  usuarioEditandoId = id;
  document.getElementById('modal-titulo').textContent = 'Editar Usuário';
  document.getElementById('nome').value = u.nome;
  document.getElementById('email').value = u.email;
  document.getElementById('senha').value = '';
  document.getElementById('perfil').value = u.perfil;
  document.getElementById('label-senha').textContent = 'Nova senha';
  document.getElementById('senha').placeholder = 'Deixe em branco para não alterar';
  document.getElementById('dica-senha-edicao').style.display = 'block';
  document.getElementById('grupo-perfil').style.display = 'block';
  document.getElementById('modal').classList.add('aberto');
}

function fecharModal() {
  document.getElementById('modal').classList.remove('aberto');
}

async function alternarAtivo(id, ativoAtual) {
  const acao = ativoAtual ? 'desativar' : 'reativar';
  if (!(await confirmarAcao(`Deseja ${acao} este usuário?`))) return;
  const res = await put(`/usuarios/${id}`, { ativo: !ativoAtual });
  if (res && res.detail) {
    toastErro('Erro: ' + extrairErro(res));
    return;
  }
  carregarUsuarios();
}

async function salvarUsuario() {
  const nome = document.getElementById('nome').value;
  const email = document.getElementById('email').value;
  const senha = document.getElementById('senha').value;
  const perfil = document.getElementById('perfil').value;

  let res;

  if (usuarioEditandoId) {
    if (!nome || !email || !perfil) {
      toastAviso('Preencha todos os campos obrigatórios!');
      return;
    }
    const dados = { nome, email, perfil };
    if (senha) dados.senha = senha;
    res = await put(`/usuarios/${usuarioEditandoId}`, dados);
  } else {
    if (!nome || !email || !senha || !perfil) {
      toastAviso('Preencha todos os campos obrigatórios!');
      return;
    }
    res = await post('/usuarios', { nome, email, senha, perfil });
  }

  if (res && res.detail) {
    toastErro('Erro: ' + extrairErro(res));
    return;
  }

  fecharModal();
  carregarUsuarios();
}

carregarUsuarios();
