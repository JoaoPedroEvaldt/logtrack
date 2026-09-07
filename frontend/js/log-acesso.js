checarAuth();
checarAdmin();
document.getElementById('usuario-perfil').textContent = localStorage.getItem('perfil') || '';

function renderizarLogAcesso(lista) {
  document.getElementById('stat-sucesso').textContent = lista.filter(l => l.tentativa_ok).length;
  document.getElementById('stat-falha').textContent = lista.filter(l => !l.tentativa_ok).length;

  const tbody = document.getElementById('tabela-log-acesso');
  if (lista.length === 0) {
    tbody.innerHTML = estadoVazio(5, 'Nenhuma tentativa de login registrada', null, 'vazio');
    return;
  }

  tbody.innerHTML = lista.map(l => `
    <tr>
      <td>${formatarDataHora(l.criado_em)}</td>
      <td>${escapeHtml(l.email_tentado)}</td>
      <td>${l.usuario_nome ? escapeHtml(l.usuario_nome) : '<span style="color:var(--text-light);">—</span>'}</td>
      <td>${l.ip ? escapeHtml(l.ip) : '—'}</td>
      <td>${l.tentativa_ok
        ? '<span class="badge badge-entregue">Sucesso</span>'
        : '<span class="badge badge-ocorrencia">Falha</span>'}</td>
    </tr>
  `).join('');
}

async function carregarLogAcesso() {
  const lista = await get('/log-acesso/') || [];
  renderizarLogAcesso(lista);
}

carregarLogAcesso();
