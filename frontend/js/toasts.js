// ===================== SISTEMA DE NOTIFICAÇÕES (TOASTS) =====================
// Substitui alert() e confirm() nativos do navegador por componentes
// estilizados e consistentes com o tema (claro/escuro) do sistema.

function garantirContainerToast() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

function mostrarToast(mensagem, tipo = 'info', duracao = 4000) {
  const container = garantirContainerToast();

  const icones = {
    success: svgIcone('check', 17),
    error: svgIcone('erro', 17),
    warning: svgIcone('alerta', 17),
    info: svgIcone('info', 17)
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.innerHTML = `
    <span class="toast-icon">${icones[tipo] || icones.info}</span>
    <span class="toast-msg"></span>
    <button class="toast-fechar" aria-label="Fechar">${svgIcone('fechar_x', 14)}</button>
  `;
  toast.querySelector('.toast-msg').textContent = mensagem;

  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('toast-visivel'));

  const remover = () => {
    toast.classList.remove('toast-visivel');
    toast.classList.add('toast-saindo');
    setTimeout(() => toast.remove(), 250);
  };

  toast.querySelector('.toast-fechar').onclick = remover;

  if (duracao > 0) {
    setTimeout(remover, duracao);
  }

  return toast;
}

function toastSucesso(msg, duracao) { return mostrarToast(msg, 'success', duracao); }
function toastErro(msg, duracao) { return mostrarToast(msg, 'error', duracao ?? 6000); }
function toastAviso(msg, duracao) { return mostrarToast(msg, 'warning', duracao); }
function toastInfo(msg, duracao) { return mostrarToast(msg, 'info', duracao); }

// ===================== MODAL DE CONFIRMAÇÃO (substitui confirm()) =====================

function confirmarAcao(mensagem, opcoes = {}) {
  const titulo = opcoes.titulo || 'Confirmar ação';
  const textoConfirmar = opcoes.textoConfirmar || 'Confirmar';
  const textoCancelar = opcoes.textoCancelar || 'Cancelar';
  const perigo = opcoes.perigo !== false; // por padrão, botão vermelho (ações destrutivas)

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay aberto';
    overlay.innerHTML = `
      <div class="modal" style="max-width:380px;">
        <div class="modal-header">
          <h2></h2>
        </div>
        <p class="confirmar-msg" style="color:var(--text);font-size:14px;line-height:1.5;"></p>
        <div style="margin-top:24px;display:flex;gap:12px;justify-content:flex-end;">
          <button class="btn btn-outline" data-acao="cancelar"></button>
          <button class="btn ${perigo ? 'btn-danger' : 'btn-primary'}" data-acao="confirmar"></button>
        </div>
      </div>
    `;
    overlay.querySelector('.modal-header h2').textContent = titulo;
    overlay.querySelector('.confirmar-msg').textContent = mensagem;
    overlay.querySelector('[data-acao="cancelar"]').textContent = textoCancelar;
    overlay.querySelector('[data-acao="confirmar"]').textContent = textoConfirmar;

    document.body.appendChild(overlay);

    const fechar = (resultado) => {
      overlay.remove();
      resolve(resultado);
    };

    overlay.querySelector('[data-acao="confirmar"]').onclick = () => fechar(true);
    overlay.querySelector('[data-acao="cancelar"]').onclick = () => fechar(false);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) fechar(false);
    });
  });
}