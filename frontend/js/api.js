const API = 'http://127.0.0.1:8000';

function getToken() {
  return localStorage.getItem('token');
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('perfil');
  window.location.href = '../index.html';
}

function checarAuth() {
  if (!getToken()) {
    window.location.href = '../index.html';
  }
}

async function get(endpoint) {
  const res = await fetch(`${API}${endpoint}`, {
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
  if (res.status === 401) { logout(); return; }
  return res.json();
}

async function post(endpoint, dados) {
  const res = await fetch(`${API}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(dados)
  });
  return res.json();
}

async function put(endpoint, dados) {
  const res = await fetch(`${API}${endpoint}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(dados)
  });
  return res.json();
}

async function del(endpoint) {
  const res = await fetch(`${API}${endpoint}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
  return res.json();
}

function formatarData(data) {
  if (!data) return '—';
  return new Date(data).toLocaleDateString('pt-BR');
}

function formatarDataHora(data) {
  if (!data) return '—';
  return new Date(data).toLocaleString('pt-BR');
}

function badgeStatus(status) {
  const labels = {
    aguardando: 'Aguardando',
    em_rota: 'Em Rota',
    entregue: 'Entregue',
    atrasado: 'Atrasado',
    ocorrencia: 'Ocorrência',
    cancelado: 'Cancelado'
  };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

/* ===================== TEMA ===================== */
function alternarTema() {
  const dark = document.body.classList.toggle('dark');
  localStorage.setItem('tema', dark ? 'dark' : 'light');
  atualizarBtnTema(dark);
}

function atualizarBtnTema(dark) {
  const btn = document.getElementById('btn-tema');
  if (btn) btn.textContent = dark ? '☀️ Tema Claro' : '🌙 Tema Escuro';
}

function aplicarTema() {
  const dark = localStorage.getItem('tema') === 'dark';
  if (dark) document.body.classList.add('dark');
  atualizarBtnTema(dark);
}

/* ===================== MENU MOBILE ===================== */
function toggleMenu() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  sidebar.classList.toggle('aberta');
  overlay.classList.toggle('ativo');
}

function fecharMenu() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  sidebar.classList.remove('aberta');
  overlay.classList.remove('ativo');
}

aplicarTema();

document.addEventListener('DOMContentLoaded', () => {
  aplicarTema();
});