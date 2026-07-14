checarAuth();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';

async function carregarOcorrencias() {
  const data = await get('/ocorrencias') || [];
  const tbody = document.getElementById('tabela-ocorrencias');

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#888;">Nenhuma ocorrência registrada</td></tr>';
    return;
  }

  const tipos = {
    atraso: 'Atraso',
    acidente: 'Acidente',
    cliente_ausente: 'Cliente Ausente',
    problema_mecanico: 'Problema Mecânico',
    extravio: 'Extravio',
    outro: 'Outro'
  };

  tbody.innerHTML = data.map(o => `
    <tr>
      <td>#${o.id}</td>
      <td>Entrega #${o.entrega_id}</td>
      <td><span class="badge badge-atrasado">${tipos[o.tipo] || o.tipo}</span></td>
      <td>${o.descricao}</td>
      <td>${formatarDataHora(o.criado_em)}</td>
    </tr>
  `).join('');
}

function abrirModal() {
  document.getElementById('modal').classList.add('aberto');
}

function fecharModal() {
  document.getElementById('modal').classList.remove('aberto');
}

async function salvarOcorrencia() {
  const dados = {
    entrega_id: parseInt(document.getElementById('entrega-id').value),
    tipo: document.getElementById('tipo').value,
    descricao: document.getElementById('descricao').value,
  };

  if (!dados.entrega_id || !dados.tipo || !dados.descricao) {
    alert('Preencha todos os campos obrigatórios!');
    return;
  }

  const res = await post('/ocorrencias', dados);

  if (res.detail) {
    alert('Erro: ' + res.detail);
    return;
  }

  fecharModal();
  carregarOcorrencias();
}

carregarOcorrencias(); 