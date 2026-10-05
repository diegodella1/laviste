import {assert} from './engine.mjs';
const baseURL = 'https://api.invertironline.com';

export function normalizeSnapshot(account, portfolio) {
  assert(account && Array.isArray(account.cuentas), 'IOL devolvió un estado de cuenta incompleto.', 502);
  assert(portfolio && Array.isArray(portfolio.activos), 'IOL devolvió posiciones incompletas.', 502);
  assert(account.cuentas.every(item => item && typeof item.moneda === 'string' && Number.isFinite(item.disponible)), 'IOL devolvió un saldo sin moneda o importe válido.', 502);
  assert(portfolio.activos.every(item => item && Number.isFinite(item.cantidad) && typeof item.titulo?.simbolo === 'string' && typeof item.titulo?.mercado === 'string'), 'IOL devolvió un instrumento incompleto.', 502);
  return {provider:'iol', environment:'production', asOf:new Date().toISOString(), account, portfolio, capabilities:['balances','positions','quotes'], simulated:false};
}

export function createIOL(vault, store, {fetcher = fetch} = {}) {
  let refreshPromise;
  let generation = 0;
  async function tokens(fields) {
    const result = await fetcher(baseURL + '/token', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams(fields), signal:AbortSignal.timeout(20000)});
    assert(result.ok, 'IOL rechazó la conexión. Revisá credenciales y habilitación de API.', 502);
    const data = await result.json();
    assert(typeof data.access_token==='string' && typeof data.refresh_token==='string' && Number.isFinite(Number(data.expires_in)), 'Respuesta de autenticación IOL inválida.', 502);
    return {accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt:Date.now()+Number(data.expires_in)*1000};
  }
  async function accessToken(force = false) {
    const saved = vault.get('iol');
    assert(saved, 'Conectá IOL desde Configuración.', 503);
    if (!force && saved.expiresAt > Date.now()+60000) return saved.accessToken;
    if (!refreshPromise) {
      const started = generation;
      refreshPromise = tokens({refresh_token:saved.refreshToken,grant_type:'refresh_token'}).then(next => {
        assert(started === generation, 'La conexión IOL cambió. Reintentá.', 409);
        vault.set('iol', next);
        return next.accessToken;
      }).finally(()=>{refreshPromise = null;});
    }
    return refreshPromise;
  }
  async function get(path) {
    let token = await accessToken();
    const request = () => fetcher(baseURL + path, {method:'GET',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
    let result = await request();
    if (result.status === 401) {token = await accessToken(true); result = await request();}
    assert(result.ok, 'IOL no pudo actualizar los datos. El último resultado puede estar desactualizado.', 502);
    return result.json();
  }
  return {
    async connect(username, password) {
      assert(typeof username==='string' && username.length>0 && username.length<200 && typeof password==='string' && password.length>0 && password.length<300, 'Ingresá usuario y contraseña de IOL.');
      const current = ++generation;
      const next = await tokens({username,password,grant_type:'password'});
      assert(current===generation, 'La conexión cambió. Reintentá.', 409);
      vault.set('iol', next);
      store.deleteSetting('iolSnapshot');
      return {connected:true};
    },
    disconnect() {generation++; vault.remove('iol'); store.deleteSetting('iolSnapshot');},
    async snapshot() {
      const current = generation;
      const cached = store.setting('iolSnapshot');
      assert(vault.get('iol'), 'Conectá IOL desde Configuración.', 503);
      if (cached && Date.now()-Date.parse(cached.asOf)<60000) return cached;
      try {
        const [account,portfolio] = await Promise.all([get('/api/v2/estadocuenta'),get('/api/v2/portafolio/argentina')]);
        assert(current===generation, 'La conexión cambió. Reintentá.', 409);
        const data = normalizeSnapshot(account,portfolio);
        store.setSetting('iolSnapshot',data);
        return data;
      } catch (error) {
        if (cached && current===generation) return {...cached,stale:true,error:'No se pudo actualizar IOL. Revisá conexión y autorización.'};
        throw error;
      }
    },
    async quote(market, symbol) {
      assert(/^[A-Za-z0-9_]{2,30}$/.test(market) && /^[A-Za-z0-9.]{1,20}$/.test(symbol), 'Instrumento inválido.');
      const data = await get(`/api/v2/${encodeURIComponent(market)}/Titulos/${encodeURIComponent(symbol)}/Cotizacion`);
      assert(data && Number.isFinite(data.ultimoPrecio) && typeof data.fechaHora==='string', 'Cotización IOL incompleta.', 502);
      return {provider:'iol',environment:'production',market,symbol,asOf:new Date().toISOString(),data};
    },
  };
}
