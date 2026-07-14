checarAuth();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';

let entregas = [];
let entregaIdSelecionada = null;

async function carregarEntregas() {
  entregas = await get('/entregas') || [];
  renderizar(entregas);
}

async function carregarMotoristas() {
  const data = await get('/motoristas') || [];
  const sel = document.getElementById('motorista-id');
  data.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.cpf} — CNH ${m.cnh_numero}`;
    sel.appendChild(opt);
  });
}

async function carregarVeiculos() {
  const data = await get('/veiculos') || [];
  const sel = document.getElementById('veiculo-id');
  data.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = `${v.placa} — ${v.modelo}`;
    sel.appendChild(opt);
  });
}

function renderizar(lista) {
  const tbody = document.getElementById('tabela-entregas');
  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;">Nenhuma entrega encontrada</td></tr>';
    return;
  }
  tbody.innerHTML = lista.map(e => `
    <tr>
      <td>#${e.id}</td>
      <td>${e.cliente}</td>
      <td>${e.origem}</td>
      <td>${e.destino}</td>
      <td>${badgeStatus(e.status)}</td>
      <td>${formatarDataHora(e.previsao)}</td>
      <td>
        <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;" onclick="abrirModalStatus(${e.id})">
          Status
        </button>
      </td>
    </tr>
  `).join('');
}

function filtrar() {
  const status = document.getElementById('filtro-status').value;
  const cliente = document.getElementById('filtro-cliente').value.toLowerCase();
  const filtradas = entregas.filter(e => {
    return (!status || e.status === status) &&
           (!cliente || e.cliente.toLowerCase().includes(cliente));
  });
  renderizar(filtradas);
}

function abrirModal() {
  document.getElementById('modal').classList.add('aberto');
}

function fecharModal() {
  document.getElementById('modal').classList.remove('aberto');
}

function abrirModalStatus(id) {
  entregaIdSelecionada = id;
  document.getElementById('modal-status').classList.add('aberto');
}

function fecharModalStatus() {
  document.getElementById('modal-status').classList.remove('aberto');
  entregaIdSelecionada = null;
}

async function salvarEntrega() {
  const dados = {
    cliente: document.getElementById('cliente').value,
    origem: document.getElementById('origem').value,
    destino: document.getElementById('destino').value,
    previsao: document.getElementById('previsao').value,
    descricao_carga: document.getElementById('descricao').value || null,
    peso_kg: parseFloat(document.getElementById('peso').value) || null,
    motorista_id: parseInt(document.getElementById('motorista-id').value) || null,
    veiculo_id: parseInt(document.getElementById('veiculo-id').value) || null,
  };

  if (!dados.cliente || !dados.origem || !dados.destino || !dados.previsao) {
    alert('Preencha todos os campos obrigatórios!');
    return;
  }

  await post('/entregas', dados);
  fecharModal();
  carregarEntregas();
}

async function confirmarStatus() {
  const status = document.getElementById('novo-status').value;
  await fetch(`http://127.0.0.1:8000/entregas/${entregaIdSelecionada}/status?status=${status}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
  });
  fecharModalStatus();
  carregarEntregas();
}

carregarEntregas();
carregarMotoristas();
carregarVeiculos(); 