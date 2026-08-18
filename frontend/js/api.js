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

function checarAdmin() {
  if (localStorage.getItem('perfil') !== 'administrador') {
    window.location.href = 'dashboard.html';
  }
}

function obterIdUsuarioLogado() {
  const token = getToken();
  if (!token) return null;
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(atob(base64).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    return parseInt(JSON.parse(json).sub, 10);
  } catch (e) {
    return null;
  }
}

function aplicarVisibilidadePorPerfil() {
  const perfil = localStorage.getItem('perfil');
  document.querySelectorAll('[data-admin-only]').forEach(el => {
    if (perfil !== 'administrador') el.style.display = 'none';
  });
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

function escapeHtml(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* ===================== ESTADOS VAZIO / CARREGANDO ===================== */
function estadoVazio(colspan, titulo, subtitulo, icone) {
  const conteudo = `
    <div class="empty-state">
      ${svgIcone(icone || 'vazio', 38)}
      <div class="empty-titulo">${titulo}</div>
      ${subtitulo ? `<div class="empty-sub">${subtitulo}</div>` : ''}
    </div>`;
  return colspan ? `<tr><td colspan="${colspan}" style="padding:0;">${conteudo}</td></tr>` : conteudo;
}

function estadoCarregando(colspan) {
  const conteudo = `<div class="loading-state"><span class="spinner"></span> Carregando...</div>`;
  return colspan ? `<tr><td colspan="${colspan}" style="padding:0;">${conteudo}</td></tr>` : conteudo;
}

function formatarData(data) {
  if (!data) return '—';
  return new Date(data).toLocaleDateString('pt-BR');
}

function formatarDataHora(data) {
  if (!data) return '—';
  return new Date(data).toLocaleString('pt-BR');
}

/* ===================== MOEDA (R$) ===================== */
function aplicarMascaraMoeda(input) {
  input.addEventListener('input', () => {
    const digitos = input.value.replace(/\D/g, '');
    if (!digitos) { input.value = ''; return; }
    const numero = parseInt(digitos, 10) / 100;
    input.value = numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });
}

function moedaParaNumero(valor) {
  if (!valor) return null;
  const numero = parseFloat(valor.replace(/\./g, '').replace(',', '.'));
  return isNaN(numero) ? null : numero;
}

/* ===================== MÁSCARAS SOMENTE NÚMEROS ===================== */
function aplicarMascaraSomenteDigitos(input, maxLength) {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, maxLength);
  });
}

function aplicarMascaraCPF(input) {
  input.addEventListener('input', () => {
    let digitos = input.value.replace(/\D/g, '').slice(0, 11);
    digitos = digitos.replace(/(\d{3})(\d)/, '$1.$2');
    digitos = digitos.replace(/(\d{3})(\d)/, '$1.$2');
    digitos = digitos.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    input.value = digitos;
  });
}

/* Extrai uma mensagem legível de um erro da API, seja ele
   {detail: "texto"} (HTTPException) ou {detail: [{msg: "..."}]} (validação do Pydantic). */
function extrairErro(res) {
  if (!res || !res.detail) return 'Erro desconhecido';
  if (typeof res.detail === 'string') return res.detail;
  if (Array.isArray(res.detail)) {
    return res.detail.map(e => e.msg || JSON.stringify(e)).join('; ');
  }
  return 'Erro desconhecido';
}

function numeroParaMoeda(numero) {
  if (numero === null || numero === undefined || numero === '') return '';
  return parseFloat(numero).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

/* Mesmas cores usadas nos badges/kanban (.badge-*, .kanban-card-*) em style.css,
   para que os gráficos (Chart.js) fiquem sempre consistentes com o resto da interface. */
const CORES_STATUS = {
  aguardando: '#3B6D11',
  em_rota: '#1E4D78',
  entregue: '#0F6E56',
  atrasado: '#993C1D',
  ocorrencia: '#854F0B',
  cancelado: '#888888'
};

function corPorStatus(status) {
  return CORES_STATUS[status] || '#95A5A6';
}

/* ===================== TEMA ===================== */
function alternarTema() {
  const dark = document.body.classList.toggle('dark');
  localStorage.setItem('tema', dark ? 'dark' : 'light');
  atualizarBtnTema(dark);
}

const ICONE_LUA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const ICONE_SOL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

function atualizarBtnTema(dark) {
  const btn = document.getElementById('btn-tema');
  if (btn) btn.innerHTML = `${dark ? ICONE_SOL : ICONE_LUA} <span>${dark ? 'Tema Claro' : 'Tema Escuro'}</span>`;
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
aplicarVisibilidadePorPerfil();

document.addEventListener('DOMContentLoaded', () => {
  aplicarTema();
  aplicarVisibilidadePorPerfil();
});