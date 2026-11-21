/* Session-only setup: no submission to the hosting provider. */
(() => {
  'use strict';
  const form = document.getElementById('scoreConnection');
  const input = document.getElementById('ingestionToken');
  const error = document.getElementById('error');
  const button = document.getElementById('connectScores');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const token = input.value.trim();
    error.hidden = true;
    if (!token) {
      error.textContent = 'Pega el token de Instabloom para continuar.';
      error.hidden = false;
      input.focus();
      return;
    }
    try {
      sessionStorage.setItem(window.TelaTetrisScoreClient.TOKEN_KEY, token);
      input.value = '';
      button.disabled = true;
      window.location.assign('index.html');
    } catch {
      button.disabled = false;
      error.textContent = 'Chrome no pudo guardar el token. Permite el almacenamiento de esta pestaña e inténtalo de nuevo.';
      error.hidden = false;
    }
  });
})();
