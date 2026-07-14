checarAuth();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';

let veiculoEditandoId = null;

function atualizarSubtipo() {
  const tipo = document.getElementById('tipo').value;
  const grupoSubtipo = document.getElementById('grupo-subtipo');
  const grupoEixos = document.getElementById('grupo-eixos');
  const grupoTipoEixo = document.getElementById('grupo-tipo-eixo');

  if (tipo === 'semirreboque') {
    grupoSubtipo.style.display = 'block';
    grupoEixos.style.display = 'block';
  } else {
    grupoSubtipo.style.display = 'none';
    grupoEixos.style.display = 'none';
    grupoTipoEixo.style.display = 'none';
  }
}

function atualizarTipoEixo() {
  const eixos = document.getElementById('eixos').value;
  const grupoTipoEixo = document.getElementById('grupo-tipo-eixo');
  grupoTipoEixo.style.display = eixos === '3' ? 'block' : 'none';
}

async function carregarVeiculos() {
  const data = await get('/veiculos') || [];
  const tbody = document.getElementById('tabela-veiculos');

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#888;">Nenhum veículo cadastrado</td></tr>';
    return;
  }

  const statusBadge = {
    disponivel: 'entregue',
    em_rota: 'em_rota',
    em_manutencao: 'atrasado',
    inativo: 'cancelado'
  };

  const tipoLabel = {
    cavalo: '🚛 Cavalo',
    semirreboque: '🚌 Semirreboque',
    van: '🚐 Van',
    utilitario: '🚙 Utilitário',
    moto: '🏍️ Moto'
  };

  tbody.innerHTML = data.map(v => {
    const subtipo = v.subtipo ? ` — ${v.subtipo}` : '';
    const eixos = v.eixos ? ` | ${v.eixos} eixos` : '';
    const tipoEixo = v.tipo_eixo ? ` (${v.tipo_eixo.toUpperCase()})` : '';

    return `
      <tr>
        <td>#${v.id}</td>
        <td><strong>${v.placa}</strong></td>
        <td>${v.modelo}</td>
        <td>${v.marca}</td>
        <td>${v.ano}</td>
        <td>${tipoLabel[v.tipo] || v.tipo}</td>
        <td>${v.subtipo || '—'}</td>
        <td>${v.eixos ? v.eixos + eixos.replace(` | ${v.eixos} eixos`, '') + tipoEixo : '—'}</td>
        <td>${v.capacidade_kg} kg</td>
        <td><span class="badge badge-${statusBadge[v.status] || 'aguardando'}">${v.status}</span></td>
        <td style="display:flex;gap:6px;">
          <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;" onclick="editarVeiculo(${v.id}, '${v.placa}', '${v.modelo}', '${v.marca}', ${v.ano}, '${v.tipo}', ${v.capacidade_kg}, '${v.subtipo || ''}', '${v.eixos || ''}', '${v.tipo_eixo || ''}', '${v.cor || ''}')">✏️ Editar</button>
          <button class="btn btn-danger" style="font-size:11px;padding:4px 10px;" onclick="excluirVeiculo(${v.id})">🗑️ Excluir</button>
        </td>
      </tr>
    `;
  }).join('');
}

function abrirModal() {
  veiculoEditandoId = null;
  document.getElementById('modal-titulo').textContent = 'Novo Veículo';
  document.getElementById('placa').value = '';
  document.getElementById('modelo').value = '';
  document.getElementById('marca').value = '';
  document.getElementById('ano').value = '';
  document.getElementById('tipo').value = '';
  document.getElementById('subtipo').value = '';
  document.getElementById('eixos').value = '';
  document.getElementById('tipo-eixo').value = '';
  document.getElementById('capacidade').value = '';
  document.getElementById('cor').value = '';
  document.getElementById('crlv-validade').value = '';
  document.getElementById('seguro-validade').value = '';
  document.getElementById('grupo-subtipo').style.display = 'none';
  document.getElementById('grupo-eixos').style.display = 'none';
  document.getElementById('grupo-tipo-eixo').style.display = 'none';
  document.getElementById('modal').classList.add('aberto');
}

function fecharModal() {
  document.getElementById('modal').classList.remove('aberto');
}

function editarVeiculo(id, placa, modelo, marca, ano, tipo, capacidade, subtipo, eixos, tipoEixo, cor) {
  veiculoEditandoId = id;
  document.getElementById('modal-titulo').textContent = 'Editar Veículo';
  document.getElementById('placa').value = placa;
  document.getElementById('modelo').value = modelo;
  document.getElementById('marca').value = marca;
  document.getElementById('ano').value = ano;
  document.getElementById('tipo').value = tipo;
  document.getElementById('capacidade').value = capacidade;
  document.getElementById('cor').value = cor;
  document.getElementById('subtipo').value = subtipo;
  document.getElementById('eixos').value = eixos;
  document.getElementById('tipo-eixo').value = tipoEixo;

  if (tipo === 'semirreboque') {
    document.getElementById('grupo-subtipo').style.display = 'block';
    document.getElementById('grupo-eixos').style.display = 'block';
    document.getElementById('grupo-tipo-eixo').style.display = eixos === '3' ? 'block' : 'none';
  } else {
    document.getElementById('grupo-subtipo').style.display = 'none';
    document.getElementById('grupo-eixos').style.display = 'none';
    document.getElementById('grupo-tipo-eixo').style.display = 'none';
  }

  document.getElementById('modal').classList.add('aberto');
}

async function excluirVeiculo(id) {
  if (!confirm('Deseja desativar este veículo?')) return;
  await del(`/veiculos/${id}`);
  carregarVeiculos();
}

async function salvarVeiculo() {
  const tipo = document.getElementById('tipo').value;
  const dados = {
    placa: document.getElementById('placa').value,
    modelo: document.getElementById('modelo').value,
    marca: document.getElementById('marca').value,
    ano: parseInt(document.getElementById('ano').value),
    tipo: tipo,
    capacidade_kg: parseFloat(document.getElementById('capacidade').value),
    cor: document.getElementById('cor').value || null,
    subtipo: tipo === 'semirreboque' ? document.getElementById('subtipo').value || null : null,
    eixos: tipo === 'semirreboque' ? parseInt(document.getElementById('eixos').value) || null : null,
    tipo_eixo: tipo === 'semirreboque' && document.getElementById('eixos').value === '3' ? document.getElementById('tipo-eixo').value || null : null,
    crlv_validade: document.getElementById('crlv-validade').value || null,
    seguro_validade: document.getElementById('seguro-validade').value || null,
  };

  if (!dados.placa || !dados.modelo || !dados.marca || !dados.ano || !dados.tipo || !dados.capacidade_kg) {
    alert('Preencha todos os campos obrigatórios!');
    return;
  }

  let res;
  if (veiculoEditandoId) {
    res = await put(`/veiculos/${veiculoEditandoId}`, dados);
  } else {
    res = await post('/veiculos', dados);
  }

  if (res.detail) {
    alert('Erro: ' + res.detail);
    return;
  }

  fecharModal();
  carregarVeiculos();
}

carregarVeiculos();