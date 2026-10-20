import {icon} from './icons.js';
import {ACCOUNT_LINK, SETTINGS_ACCESS_LEAD, SETTINGS_ACCESS_TITLE} from './copy.mjs';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const tested = result => !result ? 'Sin probar' : result.ok ? 'Verificado' : 'Falló la última prueba';

export function settingsView(state) {
  const config = state.config;
  const usage = state.consumption || [];
  const iolBlock=config.iolEnabled?`<section class="settings-section"><div class="settings-status"><h2 class="icon-heading">${icon('bank')}Mi cuenta IOL</h2><span class="pill">${config.iolConfigured?'Conectada · consulta real':'Sin conectar · opcional'}</span></div>
      <p>Consultá saldos, posiciones y cotizaciones de Argentina. No se envían órdenes. Tu cuenta real permanece separada de la cartera de práctica.</p>
      <form id="iol-settings"><label class="field">Usuario IOL<input class="input" name="username" autocomplete="off" required maxlength="200"></label><label class="field">Contraseña IOL<input class="input" type="password" name="password" autocomplete="new-password" required maxlength="300"></label><p class="small muted">La contraseña se usa para obtener tokens y no se guarda. IOL debe tener habilitado el acceso API. Si vence la autorización, conectá nuevamente.</p><button class="btn" type="submit" ${config.vaultReady?'':'disabled'}>${config.iolConfigured?'Reconectar':'Conectar IOL'}</button></form>
      <div class="form-actions"><button class="btn" data-action="iol-snapshot" ${config.iolConfigured?'':'disabled'}>Consultar mi cuenta</button><button class="btn" data-action="remove-iol" ${config.iolConfigured?'':'disabled'}>Desconectar IOL</button></div>
      <a class="small" href="https://api.invertironline.com/Help" target="_blank" rel="noopener noreferrer">Cómo habilitar la API en IOL ↗</a>
    </section>`:'';
  return `<div class="page-heading"><div><div class="eyebrow greeting">Tu espacio privado</div><h1>Conectá tu criterio.</h1><p>OpenAI analiza tus tesis y noticias. La práctica usa precios demorados de mercado en ARS.</p></div></div>
  <div class="settings-grid">
    <section class="settings-section"><div class="settings-status"><h2 class="icon-heading">${icon('chip')}OpenAI</h2><span class="pill">${config.aiConfigured?'Clave guardada':'Configuración pendiente'}</span></div>
      <p>La clave se cifra en tu servidor. Tus mensajes y el contexto de las tesis se envían a OpenAI. La búsqueda web usa temas y compañías de la tesis.</p>
      ${!config.vaultReady?'<p class="callout amber">Falta instalar la clave maestra del servidor.</p>':''}
      <form id="openai-settings"><label class="field">Clave API<input class="input" type="password" name="apiKey" autocomplete="new-password" placeholder="${config.aiConfigured?'Guardada · dejar vacío para conservar':'sk-…'}" ${config.aiConfigured?'':'required'} maxlength="500"></label>
      <label class="field">Modelo<input class="input" name="model" required value="${esc(config.model)}" maxlength="100"></label>
      <p class="small muted">Las cuotas por usuario (20 chat, 5 revisiones, 100 mil tokens, 3 tesis en seguimiento) se editan en Admin. Estos números siguen el contador global UTC.</p>
      <div class="two-cols"><label class="field">Intentos de chat por día<input class="input" type="number" name="dailyLimit" min="1" max="1000" required value="${config.dailyLimit}"></label><label class="field">Revisiones de noticias por día<input class="input" type="number" name="newsLimit" min="1" max="1000" required value="${config.newsLimit}"></label></div>
      <button class="btn primary" type="submit" ${config.vaultReady?'':'disabled'}>Guardar conexión</button></form>
      <div class="form-actions"><button class="btn" data-action="test-openai" data-value="chat" ${config.aiConfigured?'':'disabled'}>Probar conversación</button><button class="btn" data-action="test-openai" data-value="news" ${config.aiConfigured?'':'disabled'}>Probar búsqueda web</button><button class="btn" data-action="remove-openai" ${config.aiConfigured?'':'disabled'}>Desconectar</button></div>
      <p class="small">Conversación: ${tested(config.openaiStatus?.chat)} · Búsqueda: ${tested(config.openaiStatus?.news)}</p>
      <p><a class="small" href="#/admin/agente">Editar prompt del agente →</a></p>
      <p><a class="small" href="#/admin/fuentes">Fuentes de noticias →</a></p>
      <p><a class="small" href="#/admin/agente">Precios de modelo y uso por usuario →</a></p>
      <p class="small muted">Las pruebas consumen API. Cuotas globales, reinicio 00:00 UTC. Cada revisión usa hasta dos llamadas de modelo y dos búsquedas. Un límite de intentos no es un presupuesto monetario.</p>
      <div class="usage-grid">${['chat','news'].map(kind=>{const row=usage.find(item=>item.kind===kind)||{};return `<div><strong>${row.calls||0} / ${kind==='chat'?config.dailyLimit:config.newsLimit}</strong><div>${kind==='chat'?'Chat y pruebas':'Revisiones de noticias'}</div><small class="muted">${row.input_tokens||0} entrada · ${row.output_tokens||0} salida · ${row.searches||0} búsquedas</small></div>`;}).join('')}</div>
    </section>
    ${iolBlock}
    <section class="settings-section"><h2 class="icon-heading">${icon('layers')}Tus datos</h2><p>Conversaciones, versiones y evidencia quedan en este servidor. La exportación no incluye credenciales ni tokens.</p><a class="btn" href="/api/export" download>${icon('download')}Exportar mi espacio</a></section>
    <section class="settings-section"><h2 class="icon-heading">${icon('lock')}${SETTINGS_ACCESS_TITLE}</h2><p>${SETTINGS_ACCESS_LEAD}</p><p><a class="btn" href="#/cuenta">${ACCOUNT_LINK}</a></p><button class="btn ghost" data-action="logout">${icon('exit')}Cerrar sesión</button></section>
  </div>`;
}

export function accountView(snapshot) {
  const accounts = snapshot.account.cuentas;
  const holdings = snapshot.portfolio.activos;
  return `<p class="callout ${snapshot.stale?'amber':''}">${snapshot.stale?'Datos anteriores: no se pudo actualizar.':'Consulta real · sin permisos de operación.'} Última lectura: ${esc(new Date(snapshot.asOf).toLocaleString('es-AR'))}.</p>
    <h3>Saldos por moneda</h3><div class="table-scroll"><table class="position-table"><thead><tr><th>Cuenta / tipo</th><th>Moneda</th><th>Disponible</th><th>Saldo</th></tr></thead><tbody>${accounts.map(account=>`<tr><td>${esc(account.numero || account.tipo || 'No informado')}</td><td>${esc(account.moneda || 'No informada')}</td><td>${esc(account.disponible ?? 'No informado')}</td><td>${esc(account.saldo ?? 'No informado')}</td></tr>`).join('')}</tbody></table></div>
    <h3>Posiciones · Argentina</h3><div class="table-scroll"><table class="position-table"><thead><tr><th>Instrumento</th><th>Cantidad</th><th>Último precio informado</th><th></th></tr></thead><tbody>${holdings.map(position=>{const instrument=position.titulo||{};return `<tr><td>${esc(instrument.simbolo)}<br><small>${esc(instrument.descripcion)} · ${esc(instrument.mercado)} · ${esc(instrument.moneda||'Moneda no informada')}</small></td><td>${esc(position.cantidad??'No informada')}</td><td>${esc(position.ultimoPrecio??'No informado')}</td><td><button class="btn" data-action="iol-quote" data-market="${esc(instrument.mercado)}" data-symbol="${esc(instrument.simbolo)}">Cotización</button></td></tr>`;}).join('')}</tbody></table></div><p class="small muted">Los saldos no se suman entre monedas ni se incorporan a la práctica.</p>`;
}
