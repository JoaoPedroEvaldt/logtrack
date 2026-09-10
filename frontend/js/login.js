const API = location.protocol === 'file:' ? 'http://127.0.0.1:8000' : location.origin;

const ICONE_OLHO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICONE_OLHO_FECHADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.9 18.9 0 0 1 4.22-5.44M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.9 18.9 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

function alternarMostrarSenha() {
  const input = document.getElementById('senha');
  const btn = document.getElementById('btn-mostrar-senha');
  const mostrando = input.type === 'text';
  input.type = mostrando ? 'password' : 'text';
  btn.innerHTML = mostrando ? ICONE_OLHO : ICONE_OLHO_FECHADO;
  btn.title = mostrando ? 'Mostrar senha' : 'Esconder senha';
  btn.setAttribute('aria-label', btn.title);
}

(async function carregarStatsPublicas() {
  try {
    const res = await fetch(`${API}/dashboard/publico/resumo`);
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById('stat-entregas').textContent = data.entregas_ativas;
    document.getElementById('stat-motoristas').textContent = data.motoristas;
    document.getElementById('stat-veiculos').textContent = data.veiculos;
  } catch (e) {
    /* backend offline: mantém o traço estático já presente no HTML */
  }
})();

document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value;
  const senha = document.getElementById('senha').value;
  const btn = document.getElementById('btn-login');
  const erro = document.getElementById('erro-msg');

  btn.disabled = true;
  btn.textContent = 'Entrando...';
  erro.style.display = 'none';

  try {
    const formData = new FormData();
    formData.append('username', email);
    formData.append('password', senha);

    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || 'Erro ao fazer login');
    }

    localStorage.setItem('token', data.access_token);
    localStorage.setItem('perfil', data.perfil);
    localStorage.setItem('nome', data.nome || '');

    window.location.href = 'pages/dashboard.html';

  } catch (err) {
    erro.textContent = err.message;
    erro.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}); 