const API = 'http://127.0.0.1:8000';

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

    window.location.href = 'pages/dashboard.html';

  } catch (err) {
    erro.textContent = err.message;
    erro.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}); 