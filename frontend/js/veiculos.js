checarAuth();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';

let veiculoEditandoId = null;
let veiculosCarregados = [];

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
  veiculosCarregados = data;
  const tbody = document.getElementById('tabela-veiculos');

  if (data.length === 0) {
    tbody.innerHTML = estadoVazio(11, 'Nenhum veículo cadastrado', 'Clique em "Novo Veículo" para adicionar o primeiro da sua frota.', 'caminhao');
    return;
  }

  const statusBadge = {
    disponivel: 'entregue',
    em_rota: 'em_rota',
    em_manutencao: 'atrasado',
    inativo: 'cancelado'
  };

  const tipoLabel = {
    cavalo: 'Cavalo',
    semirreboque: 'Semirreboque',
    van: 'Van',
    utilitario: 'Utilitário',
    moto: 'Moto',
    caminhao: 'Caminhão',
    carro: 'Carro'
  };

  const tipoBadge = { cavalo: 1, semirreboque: 2, van: 3, utilitario: 4, moto: 5, caminhao: 6, carro: 7 };

  tbody.innerHTML = data.map(v => {
    const subtipo = v.subtipo ? ` — ${v.subtipo}` : '';
    const eixos = v.eixos ? ` | ${v.eixos} eixos` : '';
    const tipoEixo = v.tipo_eixo ? ` (${v.tipo_eixo.toUpperCase()})` : '';

    return `
      <tr>
        <td>#${v.id}</td>
        <td><strong>${escapeHtml(v.placa)}</strong></td>
        <td>${escapeHtml(v.modelo)}</td>
        <td>${escapeHtml(v.marca)}</td>
        <td>${v.ano}</td>
        <td><span class="badge badge-tipo-${tipoBadge[v.tipo] || 7}">${tipoLabel[v.tipo] || escapeHtml(v.tipo)}</span></td>
        <td>${escapeHtml(v.subtipo) || '—'}</td>
        <td>${v.eixos ? v.eixos + eixos.replace(` | ${v.eixos} eixos`, '') + tipoEixo : '—'}</td>
        <td>${v.capacidade_kg} kg</td>
        <td><span class="badge badge-${statusBadge[v.status] || 'aguardando'}">${escapeHtml(v.status)}</span></td>
        <td style="display:flex;gap:6px;">
          <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;" onclick="editarVeiculo(${v.id})">${svgIcone('editar', 12)} Editar</button>
          <button class="btn btn-danger" style="font-size:11px;padding:4px 10px;" onclick="excluirVeiculo(${v.id})">${svgIcone('excluir', 12)} Excluir</button>
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

function editarVeiculo(id) {
  const v = veiculosCarregados.find(v => v.id === id);
  if (!v) return;
  veiculoEditandoId = id;
  document.getElementById('modal-titulo').textContent = 'Editar Veículo';
  document.getElementById('placa').value = v.placa;
  document.getElementById('modelo').value = v.modelo;
  document.getElementById('marca').value = v.marca;
  document.getElementById('ano').value = v.ano;
  document.getElementById('tipo').value = v.tipo;
  document.getElementById('capacidade').value = v.capacidade_kg;
  document.getElementById('cor').value = v.cor || '';
  document.getElementById('subtipo').value = v.subtipo || '';
  document.getElementById('eixos').value = v.eixos || '';
  document.getElementById('tipo-eixo').value = v.tipo_eixo || '';

  const tipo = v.tipo;
  const eixos = String(v.eixos || '');
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
  if (!(await confirmarAcao('Deseja desativar este veículo?'))) return;
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
    toastAviso('Preencha todos os campos obrigatórios!');
    return;
  }

  let res;
  if (veiculoEditandoId) {
    res = await put(`/veiculos/${veiculoEditandoId}`, dados);
  } else {
    res = await post('/veiculos', dados);
  }

  if (res.detail) {
    toastErro('Erro: ' + res.detail);
    return;
  }

  fecharModal();
  carregarVeiculos();
}

carregarVeiculos();