checarAuth();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';
aplicarMascaraCPF(document.getElementById('cpf'));
aplicarMascaraSomenteDigitos(document.getElementById('cnh-numero'), 11);

let motoristaEditandoId = null;
let motoristasCarregados = [];

function formatarCPF(valor) {
  const digitos = (valor || '').replace(/\D/g, '');
  if (digitos.length !== 11) return valor || '';
  return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

const PALETA_AVATAR = ['#5B6478', '#8B5CF6', '#10B981', '#EC4899', '#64748B', '#0EA5A4', '#3B82F6', '#F59E0B'];
function corAvatar(id) { return PALETA_AVATAR[id % PALETA_AVATAR.length]; }
function iniciaisNome(nome) {
  const partes = (nome || '').trim().split(/\s+/);
  return ((partes[0] ? partes[0][0] : '') + (partes[1] ? partes[1][0] : '')).toUpperCase() || '?';
}

const STATUS_LABEL_MOTORISTA = { disponivel: 'Disponível', em_rota: 'Em viagem' };
const STATUS_BADGE_MOTORISTA = { disponivel: 'entregue', em_rota: 'em_rota' };

let entregasAtivasPorMotorista = new Set();

/* O cadastro de motorista só guarda "disponivel"/"inativo" — "em viagem" não é um
   campo salvo, é derivado de ter (ou não) uma entrega em_rota associada agora. */
function statusEfetivo(m) {
  return entregasAtivasPorMotorista.has(m.id) ? 'em_rota' : m.status;
}

async function carregarMotoristas() {
  const [motoristas, entregas] = await Promise.all([get('/motoristas'), get('/entregas')]);
  motoristasCarregados = motoristas || [];
  entregasAtivasPorMotorista = new Set(
    (entregas || []).filter(e => e.status === 'em_rota' && e.motorista_id).map(e => e.motorista_id)
  );
  filtrarMotoristas();
}

function filtrarMotoristas() {
  const busca = document.getElementById('busca-motorista').value.toLowerCase();
  const status = document.getElementById('filtro-status-motorista').value;

  const filtrados = motoristasCarregados.filter(m => {
    if (status && statusEfetivo(m) !== status) return false;
    if (busca && !`${m.nome} ${m.cnh_numero}`.toLowerCase().includes(busca)) return false;
    return true;
  });

  renderizarMotoristas(filtrados);
}

function renderizarMotoristas(data) {
  const tbody = document.getElementById('tabela-motoristas');

  if (data.length === 0) {
    tbody.innerHTML = estadoVazio(7, 'Nenhum motorista encontrado', 'Ajuste a busca ou clique em "Novo Motorista" para cadastrar.', 'usuario');
    return;
  }

  tbody.innerHTML = data.map(m => {
    const validade = new Date(m.cnh_validade);
    const hoje = new Date();
    const dias = Math.ceil((validade - hoje) / (1000 * 60 * 60 * 24));
    const alertaCNH = dias <= 30 ? `<span style="color:var(--warning);display:inline-flex;vertical-align:-3px;margin-right:3px;">${svgIcone('alerta', 13)}</span>` : '';

    return `
      <tr>
        <td>
          <div class="tabela-pessoa">
            <span class="avatar-mini" style="background:${corAvatar(m.id)};">${iniciaisNome(m.nome)}</span>
            ${escapeHtml(m.nome) || '—'}
          </div>
        </td>
        <td>${alertaCNH}${escapeHtml(m.cnh_numero)}</td>
        <td>${escapeHtml(m.cnh_categoria)}</td>
        <td>${escapeHtml(m.telefone) || '—'}</td>
        <td><span class="badge badge-${STATUS_BADGE_MOTORISTA[statusEfetivo(m)] || 'cancelado'}">${STATUS_LABEL_MOTORISTA[statusEfetivo(m)] || escapeHtml(m.status)}</span></td>
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
  document.getElementById('cpf').value = formatarCPF(m.cpf);
  document.getElementById('cnh-numero').value = m.cnh_numero || '';
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
    const original = motoristasCarregados.find(m => m.id === motoristaEditandoId);
    /* Compara só dígitos dos dois lados: cadastros antigos podem ter o CPF/CNH salvo com
       ponto/traço no meio, tamanho errado, ou dígito verificador que nunca foi validado.
       Se o usuário não mexeu no valor (mesmos dígitos de antes), não reaplicamos as regras
       novas nem reenviamos o campo — só travamos quando ele digita algo realmente diferente. */
    const cpfOriginalDigitos = ((original && original.cpf) || '').replace(/\D/g, '');
    const cnhOriginalDigitos = ((original && original.cnh_numero) || '').replace(/\D/g, '');
    const cpfDigitado = document.getElementById('cpf').value.replace(/\D/g, '');
    const cnhDigitada = document.getElementById('cnh-numero').value.replace(/\D/g, '');
    const cpfMudou = cpfDigitado !== cpfOriginalDigitos;
    const cnhMudou = cnhDigitada !== cnhOriginalDigitos;

    if (!document.getElementById('nome').value || !cpfDigitado || !cnhDigitada || !document.getElementById('cnh-categoria').value || !document.getElementById('cnh-validade').value) {
      toastAviso('Preencha todos os campos obrigatórios!');
      return;
    }
    if (cpfMudou && cpfDigitado.length !== 11) {
      toastAviso(`CPF incompleto! Você digitou ${cpfDigitado.length} dígito(s), são necessários 11.`);
      return;
    }
    if (cnhMudou && cnhDigitada.length !== 11) {
      toastAviso(`Número da CNH incompleto! Você digitou ${cnhDigitada.length} dígito(s), são necessários 11.`);
      return;
    }

    const dados = {
      nome: document.getElementById('nome').value,
      telefone: document.getElementById('telefone').value || null,
      cnh_categoria: document.getElementById('cnh-categoria').value,
      cnh_validade: document.getElementById('cnh-validade').value,
    };
    if (cpfMudou) dados.cpf = cpfDigitado;
    if (cnhMudou) dados.cnh_numero = cnhDigitada;

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
      toastAviso(`CPF incompleto! Você digitou ${dados.cpf.replace(/\D/g, '').length} dígito(s), são necessários 11.`);
      return;
    }
    if (dados.cnh_numero.length !== 11) {
      toastAviso(`Número da CNH incompleto! Você digitou ${dados.cnh_numero.length} dígito(s), são necessários 11.`);
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