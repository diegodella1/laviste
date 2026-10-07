import http from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve, extname, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID, randomBytes, timingSafeEqual, createHash} from 'node:crypto';
import {createStore} from './lib/store.mjs';
import {assert, createTake, activate, review, updateSettings, rebalanceToTarget, applyAporte, applyRetiro, applyCorrection, setDraftWeights, applyDraftProposal, templates, catalog, value} from './lib/engine.mjs';
import {tickerLogoSvg} from './public/ticker-logo.mjs';
import {askOpenAI, DEFAULT_AGENT_INSTRUCTIONS} from './lib/ai.mjs';
import {
  AGENT_PROMPT_BODY_MAX, AGENT_PROMPT_NOTE_MAX,
  SAMPLE_THESIS, getActiveAgentInstructions, validateAgentPromptBody,
} from './lib/agent-prompt.mjs';
import {LOCKED_CHAT_SUFFIX_PREVIEW} from './lib/prompts.mjs';
import {createVault} from './lib/vault.mjs';
import {createIOL} from './lib/iol.mjs';
import {createScheduler} from './lib/scheduler.mjs';
import {iolEnabled} from './lib/features.mjs';
import {VERDICT_NO_ACTION} from './lib/copy.mjs';
import {createQuotesService, demoCatalogPrices, quotesOptionsFromConfig} from './lib/quotes.mjs';
import {chooseBenchmark} from './lib/benchmark.mjs';
import {prepareHoldingsQuotesForActivation, tryStampRealPricesAtActivation} from './lib/quote-migration.mjs';
import {response} from './lib/openai.mjs';
import {extractSources} from './lib/news.mjs';
import {recordActivationOps, recordRebalanceOps, recordAporteOp, recordRetiroOp, recordCorreccionOp, quotesApiFromService} from './lib/ops.mjs';
import {createPendingOrder, confirmPendingOrder, cancelPendingOrder} from './lib/orders.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const hash=value=>createHash('sha256').update(String(value)).digest();
const validLimit=value=>Number.isInteger(value)&&value>=1&&value<=1000;

export function createApp(options={}) {
  const config={
    host:process.env.HOST||'127.0.0.1',port:Number(process.env.PORT||3080),
    password:process.env.APP_PASSWORD_FILE?readFileSync(process.env.APP_PASSWORD_FILE,'utf8').trim():process.env.APP_PASSWORD||'',
    adminKey:process.env.ADMIN_KEY_FILE?readFileSync(process.env.ADMIN_KEY_FILE,'utf8').trim():options.adminKey||'',
    apiKey:process.env.OPENAI_API_KEY||'',model:process.env.OPENAI_MODEL||'gpt-5-mini',
    dailyLimit:Number(process.env.AI_DAILY_LIMIT||30),newsLimit:Number(process.env.NEWS_DAILY_LIMIT||10),
    secure:process.env.COOKIE_SECURE==='true',origin:process.env.APP_ORIGIN||'',
    masterKeyPath:process.env.MASTER_KEY_FILE||'',dataDir:resolve(root,process.env.DATA_DIR||'data'),...options,
  };
  assert(['127.0.0.1','localhost','::1'].includes(config.host)||config.password.length>=12,'Configurá una contraseña de al menos 12 caracteres.');
  assert(!config.origin||config.password.length>=12,'El origen público requiere contraseña.');
  assert(validLimit(config.dailyLimit)&&validLimit(config.newsLimit),'Límites de consumo inválidos.');
  const store=createStore(config.dataDir,{seed:config.seed===true});
  const vault=createVault(store,config.masterKeyPath);
  const sessions=new Map(),loginAttempts=new Map(),adminSessions=new Map(),adminLoginAttempts=new Map(),previewWindows=new Map();
  const adminEnabled=config.adminKey.length>=24;
  let aiBusy=false;
  const runtime=()=>{
    const settings=store.setting('openai')||{};
    const secret=vault.get('openai');
    const agent=getActiveAgentInstructions(store);
    return {...config,...settings,apiKey:secret?.apiKey||config.apiKey,fetcher:config.fetcher,instructionsOverride:agent.body};
  };
  const iol=createIOL(vault,store,{fetcher:config.iolFetcher});
  const quotes=createQuotesService(store,quotesOptionsFromConfig(config));
  const scheduler=createScheduler(store,runtime,{researcher:config.researcher,onCheck:(take,now)=>{
    quotes.syncTakePrices(take,now);
    const val=value(take);
    const point={at:now,value:val,benchmark:take.invested};
    const idx=quotes.indexSnapshot(take);
    if(idx!=null){point.index=idx;point.indexRecorded=true;}
    take.history.push(point);
    take.history=take.history.slice(-365);
    store.putTake(take);
  }});
  const liveQuotesScheduler=config.quotesLive!==false&&!quotes.isDemo();
  if(liveQuotesScheduler)quotes.startScheduler();
  else if(quotes.isDemo()||config.quotesFixture||config.quotesPrimary)quotes.refresh({force:true}).catch(()=>{});
  const liveCatalog=()=>catalog.map(row=>{
    const q=quotes.getCached(row.ticker);
    return {...row,price:q?.price??null,quoteAvailable:!!q};
  });
  const clientTakes=()=>store.takes().map(take=>{
    const copy=structuredClone(take);
    if(copy.phase==='active'&&copy.scenario==='normal'&&copy.realPricesAt)quotes.applyCatalogToHoldings(copy.holdings);
    return copy;
  });
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const cookie=req=>req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith('laviste_session='))?.split('=')[1];
  const adminCookie=req=>req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith('laviste_admin='))?.split('=')[1];
  const authed=req=>!config.password||(sessions.get(cookie(req))||0)>Date.now();
  const adminAuthed=req=>adminEnabled&&(adminSessions.get(adminCookie(req))||0)>Date.now();
  const aiRequired=()=>assert(runtime().apiKey,'Cargá tu clave OpenAI en Configuración para continuar.',503);
  async function body(req) {
    let raw='';
    for await(const chunk of req){raw+=chunk;assert(Buffer.byteLength(raw)<64000,'Solicitud demasiado grande.',413);}
    let data;try{data=JSON.parse(raw||'{}');}catch{throw Object.assign(new Error('JSON inválido.'),{status:400});}
    assert(data&&typeof data==='object'&&!Array.isArray(data),'Se esperaba un objeto JSON.');return data;
  }
  function integrationState() {
    const current=runtime();
    const qs=quotes.status();
    return {aiConfigured:!!current.apiKey,model:current.model,dailyLimit:current.dailyLimit,newsLimit:current.newsLimit,
      authEnabled:!!config.password,adminEnabled,market:qs.market,vaultReady:vault.available,rebalanceAvailable:true,
      openaiStatus:store.setting('openaiStatus')||{},iolEnabled:iolEnabled(),iolConfigured:iolEnabled()&&!!vault.get('iol'),
      quotes:{asOf:qs.asOf,stale:qs.stale,marketOpen:qs.marketOpen}};
  }
  function rememberChange(take) {
    take.version=(take.version||1)+1;
    store.version(take);store.putTake(take);
  }
  function agentPromptPayload() {
    const active=getActiveAgentInstructions(store);
    const pointer=store.setting('agentPrompt');
    const versions=store.agentPromptVersionsMeta().map(v=>({id:v.id,version:v.version,note:v.note,who:v.who,source:v.source,createdAt:v.created_at,charCount:v.char_count,isActive:pointer?.activeId===v.id}));
    const validation=validateAgentPromptBody(active.body);
    return {
      active:{id:active.version?.id??null,version:active.version?.version??null,body:active.body,note:active.version?.note??'',who:active.version?.who??'admin',source:active.version?.source??(active.isDefault?'default':'edit'),createdAt:active.version?.created_at??null,charCount:active.body.length,isDefault:active.isDefault},
      defaultBody:DEFAULT_AGENT_INSTRUCTIONS,versions,
      validationHints:{errors:validation.errors.map(item=>item.message),warnings:validation.warnings.map(item=>item.message)},
      lockedSuffix:LOCKED_CHAT_SUFFIX_PREVIEW,
    };
  }
  function assertAgentPromptBody(body,{allowWarnings=false}={}) {
    assert(typeof body==='string','Indicá el texto del agente.',400);
    const trimmed=body.trim();
    assert(trimmed.length>0&&trimmed.length<=AGENT_PROMPT_BODY_MAX,`El prompt debe tener entre 1 y ${AGENT_PROMPT_BODY_MAX} caracteres.`,400);
    const validation=validateAgentPromptBody(trimmed);
    assert(validation.ok,`Faltan instrucciones obligatorias: ${validation.errors.map(item=>item.message).join(', ')}.`,400);
    if(!allowWarnings&&validation.warnings.length)assert(false,`Advertencia: ${validation.warnings.map(item=>item.message).join(', ')}.`,409);
    return trimmed;
  }
  function trackPreviewWindow(req) {
    const key=adminCookie(req)||'anon';
    const now=Date.now();
    const recent=(previewWindows.get(key)||[]).filter(at=>now-at<3600000);
    assert(recent.length<10,'Demasiadas pruebas en la última hora. Esperá un momento.',429);
    recent.push(now);previewWindows.set(key,recent);
  }
  function idempotency(req,path,data) {
    const raw=req.headers['idempotency-key'];
    assert(!raw||/^[\w-]{8,100}$/.test(raw),'Idempotency-Key inválida.');
    const key=raw?path+':'+raw:null;
    const fingerprint=hash(JSON.stringify(data)).toString('hex');
    const existing=key&&store.idempotent(key);
    assert(!existing||existing.fingerprint===fingerprint,'La operación ya existe con otros datos.',409);
    return {cached:existing?.data,save:result=>{if(key)store.remember(key,fingerprint,result);}};
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    try {
      const url=new URL(req.url,'http://localhost'),path=url.pathname;
      if(!config.password)assert(['127.0.0.1','localhost','[::1]'].includes(new URL('http://'+req.headers.host).hostname),'Host no autorizado.',403);
      if(req.headers['sec-fetch-site']==='cross-site'&&(path.startsWith('/api/')||!['GET','HEAD'].includes(req.method)))return json(res,403,{error:'Acceso desde otro sitio rechazado.'});
      if(!['GET','HEAD'].includes(req.method)){
        assert(req.headers['content-type']?.split(';')[0]==='application/json','Content-Type debe ser application/json.',415);
        if(req.headers.origin)assert(config.origin?req.headers.origin===config.origin:new URL(req.headers.origin).host===req.headers.host,'Origen no autorizado.',403);
      }
      if(path==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,service:'laviste',revision:process.env.RELEASE_SHA||'development'});
      if(path==='/api/session'&&req.method==='GET')return json(res,200,{authenticated:authed(req),required:!!config.password,admin:{enabled:adminEnabled,unlocked:adminAuthed(req)}});
      if(path==='/api/login'&&req.method==='POST'){
        // Headers from arbitrary clients are not trusted. This private app uses a global login limit.
        const ip='personal';const attempt=loginAttempts.get(ip)||{count:0,at:Date.now()};
        if(Date.now()-attempt.at>600000){attempt.count=0;attempt.at=Date.now();}
        assert(attempt.count<10,'Demasiados intentos. Esperá diez minutos.',429);
        attempt.count++;loginAttempts.set(ip,attempt);const data=await body(req);
        assert(config.password&&timingSafeEqual(hash(data.password),hash(config.password)),'Contraseña incorrecta.',401);
        const token=randomBytes(32).toString('hex');sessions.set(token,Date.now()+43200000);loginAttempts.delete(ip);
        res.setHeader('Set-Cookie',`laviste_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${config.secure?'; Secure':''}`);return json(res,200,{ok:true});
      }
      if(path.startsWith('/api/admin')){
        assert(adminEnabled,'Administración no disponible.',503);
        if(path==='/api/admin/login'&&req.method==='POST'){
          assert(authed(req),'Iniciá sesión para continuar.',401);
          const ip='admin';const attempt=adminLoginAttempts.get(ip)||{count:0,at:Date.now()};
          if(Date.now()-attempt.at>600000){attempt.count=0;attempt.at=Date.now();}
          assert(attempt.count<10,'Demasiados intentos de clave admin. Esperá diez minutos.',429);
          attempt.count++;adminLoginAttempts.set(ip,attempt);
          const data=await body(req);
          assert(typeof data.key==='string'&&data.key.length>0,'Clave admin requerida.',400);
          assert(timingSafeEqual(hash(data.key),hash(config.adminKey)),'Clave de administración incorrecta.',401);
          const token=randomBytes(32).toString('hex');adminSessions.set(token,Date.now()+1800000);adminLoginAttempts.delete(ip);
          res.setHeader('Set-Cookie',`laviste_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800${config.secure?'; Secure':''}`);
          return json(res,200,{ok:true});
        }
        assert(authed(req),'Iniciá sesión para continuar.',401);
        assert(adminAuthed(req),'Clave de administración requerida.',401);
        const versionMatch=path.match(/^\/api\/admin\/agent-prompt\/versions\/([\w-]+)$/);
        if(versionMatch&&req.method==='GET'){
          const row=store.agentPromptVersionById(versionMatch[1]);assert(row,'Versión inexistente.',404);
          return json(res,200,{id:row.id,version:row.version,body:row.body,note:row.note,who:row.who,source:row.source,createdAt:row.created_at,charCount:row.char_count});
        }
        if(path==='/api/admin/agent-prompt'&&req.method==='GET')return json(res,200,agentPromptPayload());
        if(path==='/api/admin/agent-prompt'&&req.method==='PUT'){
          const data=await body(req);
          const trimmed=assertAgentPromptBody(data.body,{allowWarnings:data.force===true});
          const note=typeof data.note==='string'?data.note.trim().slice(0,AGENT_PROMPT_NOTE_MAX):'';
          const saved=store.appendAgentPromptVersion({body:trimmed,note:note||'Edición manual',source:'edit'});
          return json(res,200,{active:{id:saved.id,version:saved.version,body:saved.body,note:saved.note,who:saved.who,source:saved.source,createdAt:saved.created_at,charCount:saved.char_count,isDefault:false},version:saved.version});
        }
        if(path==='/api/admin/agent-prompt/restore'&&req.method==='POST'){
          const data=await body(req);
          const source=store.agentPromptVersionById(data.versionId);assert(source,'Versión inexistente.',404);
          const note=typeof data.note==='string'&&data.note.trim()?data.note.trim().slice(0,AGENT_PROMPT_NOTE_MAX):`Restaurado desde v${source.version}`;
          const saved=store.appendAgentPromptVersion({body:source.body,note,source:'restore'});
          return json(res,200,{active:{id:saved.id,version:saved.version,body:saved.body,note:saved.note,who:saved.who,source:saved.source,createdAt:saved.created_at,charCount:saved.char_count,isDefault:false},version:saved.version});
        }
        if(path==='/api/admin/agent-prompt/reset'&&req.method==='POST'){
          const data=await body(req);assert(data.confirm===true,'Confirmá el restablecimiento.',400);
          const saved=store.appendAgentPromptVersion({body:DEFAULT_AGENT_INSTRUCTIONS,note:'Restablecido al predeterminado del código',source:'reset'});
          return json(res,200,{active:{id:saved.id,version:saved.version,body:saved.body,note:saved.note,who:saved.who,source:saved.source,createdAt:saved.created_at,charCount:saved.char_count,isDefault:true},version:saved.version});
        }
        if(path==='/api/admin/agent-prompt/validate'&&req.method==='POST'){
          const data=await body(req);
          const trimmed=typeof data.body==='string'?data.body.trim():'';
          return json(res,200,validateAgentPromptBody(trimmed));
        }
        if(path==='/api/admin/agent-prompt/preview'&&req.method==='POST'){
          aiRequired();assert(!aiBusy,'Hay una solicitud IA en curso. Esperá un momento.',429);
          const data=await body(req);const current=runtime();
          assert(store.reserve('chat',current.dailyLimit),'Cuota diaria de chat agotada.',429);
          trackPreviewWindow(req);
          const draft=assertAgentPromptBody(data.body,{allowWarnings:true});
          let thesis=typeof data.thesis==='string'?data.thesis.trim():'';
          if(data.sampleId&&data.sampleId!=='custom'){assert(SAMPLE_THESIS[data.sampleId], 'Muestra desconocida.',400);thesis=SAMPLE_THESIS[data.sampleId];}
          assert(thesis.length>=20&&thesis.length<=4000,'La tesis debe tener entre 20 y 4000 caracteres.',400);
          const chatsBefore=store.chats().length,takesBefore=store.takes().length;
          aiBusy=true;
          try{
            const result=await askOpenAI([{role:'user',content:`Armá la propuesta de cartera de práctica para esta tesis: ${thesis}`}],null,{...current,assistantTurns:2,mustPropose:true,instructionsOverride:draft});
            store.tokens('chat',result.usage,0);
            assert(store.chats().length===chatsBefore&&store.takes().length===takesBefore,'La vista previa no debe persistir datos.',500);
            return json(res,200,{message:result.message,proposal:result.proposal,usage:result.usage});
          }finally{aiBusy=false;}
        }
        return json(res,404,{error:'Ruta no encontrada.'});
      }
      if(path.startsWith('/api/')){
        assert(authed(req),'Iniciá sesión para continuar.',401);
        if(path==='/api/logout'&&req.method==='POST'){sessions.delete(cookie(req));res.setHeader('Set-Cookie',`laviste_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${config.secure?'; Secure':''}`);return json(res,200,{ok:true});}
        if(path==='/api/state'&&req.method==='GET'){
          const usage=store.usage(),chat=usage.find(row=>row.kind==='chat')||{calls:0,input_tokens:0,output_tokens:0};
          return json(res,200,{takes:clientTakes(),chats:store.chats(),templates,catalog:liveCatalog(),config:integrationState(),usage:chat,consumption:usage,reviews:store.reviews().slice(0,100),jobs:store.jobs().slice(0,30),orders:store.pendingOrders(),quotes:quotes.status()});
        }
        if(path==='/api/integrations'&&req.method==='GET')return json(res,200,integrationState());
        if(path==='/api/integrations/openai'&&req.method==='POST'){
          const data=await body(req);
          assert(typeof data.model==='string'&&/^[a-zA-Z0-9._-]{1,100}$/.test(data.model),'Modelo inválido.');
          assert(validLimit(data.dailyLimit)&&validLimit(data.newsLimit),'Las cuotas deben estar entre 1 y 1000.');
          assert(!data.apiKey||(typeof data.apiKey==='string'&&data.apiKey.length>=15&&data.apiKey.length<=500&&!/\s/.test(data.apiKey)),'Clave inválida.');
          assert(data.apiKey||runtime().apiKey,'Ingresá una clave OpenAI.');
          store.transaction(()=>{
            if(data.apiKey)vault.set('openai',{apiKey:data.apiKey});
            store.setSetting('openai',{model:data.model,dailyLimit:data.dailyLimit,newsLimit:data.newsLimit});
            store.deleteSetting('openaiStatus');
          });return json(res,200,integrationState());
        }
        if(path==='/api/integrations/openai/remove'&&req.method==='POST'){
          vault.remove('openai');config.apiKey='';store.deleteSetting('openaiStatus');return json(res,200,{ok:true});
        }
        if(path==='/api/integrations/openai/test'&&req.method==='POST'){
          aiRequired();assert(!aiBusy,'Hay una solicitud IA en curso.',429);const data=await body(req);
          assert(['chat','news'].includes(data.target),'Prueba desconocida.');const current=runtime();
          assert(store.reserve('chat',current.dailyLimit),'Cuota diaria agotada.',429);aiBusy=true;
          try{
            const onUsage=(usage,searches)=>store.tokens('chat',usage,searches);
            if(data.target==='chat'){
              const result=await askOpenAI([{role:'user',content:'Respondé una frase confirmando que podemos explorar una idea. No generes cartera.'}],null,{...current,instructionsOverride:current.instructionsOverride});
              onUsage(result.usage,0);
            }else{
              const result=await response({tools:[{type:'web_search',search_context_size:'low'}],tool_choice:'required',max_tool_calls:1,include:['web_search_call.action.sources'],input:'Buscá la página oficial de relaciones con inversores de Microsoft y citá su URL. Una sola frase.'},{...current,onUsage});
              assert(extractSources(result).length,'La búsqueda no devolvió fuentes.',502);
            }
            store.setSetting('openaiStatus',{...(store.setting('openaiStatus')||{}),[data.target]:{ok:true,at:new Date().toISOString()}});
            return json(res,200,{ok:true,target:data.target});
          }catch(error){store.setSetting('openaiStatus',{...(store.setting('openaiStatus')||{}),[data.target]:{ok:false,at:new Date().toISOString()}});throw error;}finally{aiBusy=false;}
        }
        if(path==='/api/integrations/iol'&&req.method==='POST'){assert(iolEnabled(),'IOL no está habilitado en esta versión.',404);const data=await body(req);return json(res,200,await iol.connect(data.username,data.password));}
        if(path==='/api/integrations/iol/remove'&&req.method==='POST'){assert(iolEnabled(),'IOL no está habilitado en esta versión.',404);iol.disconnect();return json(res,200,{ok:true});}
        if(path==='/api/brokers/iol/snapshot'&&req.method==='GET'){assert(iolEnabled(),'IOL no está habilitado en esta versión.',404);return json(res,200,await iol.snapshot());}
        if(path==='/api/brokers/iol/quote'&&req.method==='GET'){assert(iolEnabled(),'IOL no está habilitado en esta versión.',404);return json(res,200,await iol.quote(url.searchParams.get('market')||'',url.searchParams.get('symbol')||''));}
        if(path==='/api/quotes/status'&&req.method==='GET')return json(res,200,quotes.status());
        if(path==='/api/quotes/refresh'&&req.method==='POST'){await quotes.refresh({force:true});quotes.syncAllTakes();return json(res,200,quotes.status());}
        if(path==='/api/export'&&req.method==='GET'){
          res.setHeader('Content-Disposition','attachment; filename="laviste-export.json"');
          return json(res,200,{version:4,exportedAt:new Date().toISOString(),takes:store.takes(),chats:store.chats(),versions:store.takes().flatMap(take=>store.versions(take.id)),reviews:store.reviews(),ops:store.takes().flatMap(take=>store.opsForTake(take.id)),orders:store.takes().flatMap(take=>store.ordersForTake(take.id))});
        }
        if(path==='/api/takes'&&req.method==='POST'){
          aiRequired();assert(store.takes().length<100,'Se admite hasta 100 tesis.');
          const data=await body(req),idem=idempotency(req,path,data);if(idem.cached)return json(res,200,idem.cached);
          if(data.sourceChatId){
            const chat=store.chat(data.sourceChatId);assert(chat?.proposal,'Propuesta inexistente.',404);
            const key='proposal:'+data.sourceChatId+':'+hash(JSON.stringify(chat.proposal)).toString('hex');
            const existing=store.setting(key);if(existing)return json(res,200,store.take(existing));
            const take=createTake(chat.proposal);store.transaction(()=>{store.putTake(take);store.version(take);store.setSetting(key,take.id);chat.takeId=take.id;store.putChat(chat);idem.save(take);});return json(res,201,take);
          }
          const take=createTake(data.proposal);store.transaction(()=>{store.putTake(take);store.version(take);idem.save(take);});return json(res,201,take);
        }
        const orderList=path.match(/^\/api\/takes\/([\w-]+)\/orders$/);
        if(orderList){
          const take=store.take(orderList[1]);assert(take,'No encontramos esa tesis.',404);
          if(req.method==='GET')return json(res,200,store.ordersForTake(take.id));
          assert(req.method==='POST','Método no permitido.',405);
          const data=await body(req);
          assert(Number.isInteger(data.version)&&data.version===take.version,'La tesis cambió. Actualizá la vista e intentá de nuevo.',409);
          const idem=idempotency(req,path,data);if(idem.cached)return json(res,200,idem.cached);
          let result;
          store.transaction(()=>{
            result=createPendingOrder(store,take,data,req.headers['idempotency-key']||null);
            idem.save(result);
          });
          return json(res,201,result);
        }
        const orderAct=path.match(/^\/api\/takes\/([\w-]+)\/orders\/([\w-]+)\/(confirm|cancel)$/);
        if(orderAct){
          let take=store.take(orderAct[1]);assert(take,'No encontramos esa tesis.',404);
          assert(req.method==='POST','Método no permitido.',405);
          const data=await body(req);
          const action=orderAct[3];
          if(action==='cancel'){
            let result;
            store.transaction(()=>{result=cancelPendingOrder(store,take,orderAct[2]);});
            return json(res,200,result);
          }
          const idem=idempotency(req,path,data);if(idem.cached)return json(res,200,idem.cached);
          assert(Number.isInteger(data.version)&&data.version===take.version,'La tesis cambió. Actualizá la vista e intentá de nuevo.',409);
          let result;
          store.transaction(()=>{
            take=store.take(orderAct[1]);
            result=confirmPendingOrder(store,take,orderAct[2],quotesApiFromService(quotes),req.headers['idempotency-key']||null);
            rememberChange(take);store.putTake(take);idem.save({take,order:result.order,ops:result.ops,preview:result.preview});
          });
          return json(res,200,{take,order:result.order,ops:result.ops,preview:result.preview});
        }
        const match=path.match(/^\/api\/takes\/([\w-]+)\/(activate|review|scenario|settings|idea|archive|versions|reviews|rebalance|ops|aporte|retiro|correccion|composition)$/);
        if(match){
          let take=store.take(match[1]);assert(take,'No encontramos esa tesis.',404);const action=match[2];
          if(req.method==='GET'&&action==='versions')return json(res,200,store.versions(take.id));
          if(req.method==='GET'&&action==='reviews')return json(res,200,store.reviews(take.id));
          if(req.method==='GET'&&action==='ops')return json(res,200,store.opsForTake(take.id));
          assert(req.method==='POST','Método no permitido.',405);const data=await body(req);take=store.take(match[1]);assert(take,'Tesis inexistente.',404);
          if(action==='scenario'){
            const clone=structuredClone(take);review(clone,data.scenario);return json(res,200,{...clone,preview:true});
          }
          if(action==='review'){aiRequired();const job=scheduler.enqueue(take,true);return json(res,202,job);}
          if(action==='rebalance'){
            const idem=idempotency(req,path,data);if(idem.cached)return json(res,200,idem.cached);
            assert(take.phase==='active','No podés rebalancear un borrador o una tesis archivada.',409);
            assert(Number.isInteger(data.version)&&data.version===take.version,'La tesis cambió. Actualizá la vista e intentá de nuevo.',409);
            let result;
            const version=take.version;
            store.transaction(()=>{
              result=rebalanceToTarget(take);
              recordRebalanceOps(store,take,result,quotesApiFromService(quotes),version);
              rememberChange(take);store.putTake(take);idem.save({take,result});
            });
            return json(res,200,{take,result});
          }
          if(action==='aporte'){
            const idem=idempotency(req,path,data);if(idem.cached)return json(res,200,idem.cached);
            assert(take.phase==='active','Solo podés aportar a una práctica activa.',409);
            assert(Number.isInteger(data.version)&&data.version===take.version,'La tesis cambió. Actualizá la vista e intentá de nuevo.',409);
            let ops;
            store.transaction(()=>{
              applyAporte(take,data.amount);
              ops=recordAporteOp(store,take,data.amount,req.headers['idempotency-key']||null).ops;
              rememberChange(take);store.putTake(take);idem.save({take,ops});
            });
            return json(res,200,{take,ops});
          }
          if(action==='retiro'){
            const idem=idempotency(req,path,data);if(idem.cached)return json(res,200,idem.cached);
            assert(take.phase==='active','Solo podés retirar de una práctica activa.',409);
            assert(Number.isInteger(data.version)&&data.version===take.version,'La tesis cambió. Actualizá la vista e intentá de nuevo.',409);
            let ops;
            store.transaction(()=>{
              applyRetiro(take,data.amount);
              ops=recordRetiroOp(store,take,data.amount,req.headers['idempotency-key']||null).ops;
              rememberChange(take);store.putTake(take);idem.save({take,ops});
            });
            return json(res,200,{take,ops});
          }
          if(action==='composition'){
            const idem=idempotency(req,path,data);if(idem.cached)return json(res,200,idem.cached);
            assert(take.phase==='draft','Solo podés ajustar a mano un borrador.',409);
            let result;
            store.transaction(()=>{
              result=setDraftWeights(take,data.weights);
              rememberChange(take);store.putTake(take);idem.save({take,result});
            });
            return json(res,200,{take,result});
          }
          if(action==='correccion'){
            const idem=idempotency(req,path,data);if(idem.cached)return json(res,200,idem.cached);
            assert(take.phase==='active','Solo podés corregir una práctica activa.',409);
            assert(Number.isInteger(data.version)&&data.version===take.version,'La tesis cambió. Actualizá la vista e intentá de nuevo.',409);
            assert(typeof data.note==='string'&&data.note.trim().length>=3,'Indicá el motivo de la corrección.');
            let ops;
            store.transaction(()=>{
              applyCorrection(take,{cashDelta:data.cashDelta||0,ticker:data.ticker||null,unitsDelta:data.unitsDelta||0});
              ops=recordCorreccionOp(store,take,{
                cashDelta:data.cashDelta||0,ticker:data.ticker||null,unitsDelta:data.unitsDelta||0,
                note:data.note.trim(),idempotencyKey:req.headers['idempotency-key']||null,
              }).ops;
              rememberChange(take);store.putTake(take);idem.save({take,ops});
            });
            return json(res,200,{take,ops});
          }
          assert(['activate','archive','settings','idea'].includes(action),'Método no permitido.',405);
          store.transaction(()=>{
            if(action==='activate'){
              aiRequired();
              prepareHoldingsQuotesForActivation(take, quotes);
              activate(take,data.amount);
              quotes.attachBenchmarkOnActivate(take,chooseBenchmark(take.holdings));
              tryStampRealPricesAtActivation(take, quotes);
              take.nextCheckAt=new Date().toISOString();
              recordActivationOps(store,take,quotesApiFromService(quotes));
            }
            if(action==='archive'){take.phase='archived';take.nextCheckAt=null;take.monitoringPaused=true;}
            if(action==='settings'){
              assert(typeof data.monitoringPaused==='boolean','Indicá si el seguimiento está pausado.');
              const prevCap=take.settings.cap,prevDrift=take.settings.drift;
              take.monitoringPaused=data.monitoringPaused;updateSettings(take,data);
              if(!take.monitoringPaused)aiRequired();rememberChange(take);
              if(prevCap!==take.settings.cap||prevDrift!==take.settings.drift){
                const now=new Date().toISOString();
                take.events.unshift({id:randomUUID(),at:now,type:'rules',title:'Reglas actualizadas',body:`Tope por posición ${take.settings.cap}% · desvío ${take.settings.drift} pp.`,ruleCite:`Regla (La idea): tope ${take.settings.cap}% · desvío ${take.settings.drift} pp`,verdict:'none',verdictText:VERDICT_NO_ACTION});
                take.events=take.events.slice(0,150);
              }
            }
            if(action==='idea'){
              assert(typeof data.thesis==='string'&&data.thesis.trim().length>=20&&data.thesis.length<=5000,'La tesis debe tener entre 20 y 5000 caracteres.');
              assert(typeof data.invalidation==='string'&&data.invalidation.trim().length>=10&&data.invalidation.length<=2000,'Definí qué invalidaría la tesis (10 a 2000 caracteres).');
              take.thesis=data.thesis.trim();take.invalidation=data.invalidation.trim();rememberChange(take);
            }
            store.putTake(take);
          });return json(res,200,take);
        }
        const jobMatch=path.match(/^\/api\/jobs\/([\w-]+)$/);
        if(jobMatch&&req.method==='GET'){const job=store.job(jobMatch[1]);assert(job,'Trabajo inexistente.',404);return json(res,200,job);}
        if(path==='/api/chats'&&req.method==='POST'){
          aiRequired();const data=await body(req),idem=idempotency(req,path,data);if(idem.cached)return json(res,200,idem.cached);
          if(data.takeId)assert(store.take(data.takeId),'Tesis inexistente.',404);
          assert(store.chats().length<200,'Se admite hasta 200 conversaciones.');
          const chat={id:randomUUID(),title:'Nueva conversación',takeId:data.takeId||null,messages:[],proposal:null,createdAt:new Date().toISOString()};
          store.transaction(()=>{store.putChat(chat);idem.save(chat);});return json(res,201,chat);
        }
        const chatMatch=path.match(/^\/api\/chats\/([\w-]+)\/messages$/);
        if(chatMatch&&req.method==='POST'){
          aiRequired();const data=await body(req),idem=idempotency(req,path,data);if(idem.cached)return json(res,200,idem.cached);
          assert(!aiBusy,'Hay una respuesta en curso. Esperá un momento.',429);
          const chat=store.chat(chatMatch[1]);assert(chat,'Conversación inexistente.',404);
          assert(typeof data.message==='string'&&data.message.trim().length>0&&data.message.length<=4000,'El mensaje debe tener entre 1 y 4000 caracteres.');
          assert(chat.messages.length<100,'Esta conversación llegó al límite. Abrí una nueva.');
          const current=runtime(),day=new Date().toISOString().slice(0,10);assert(store.reserve('chat',current.dailyLimit),'Alcanzaste el límite diario de chat.',429);aiBusy=true;
          try{
            const message={role:'user',content:data.message.trim(),at:new Date().toISOString()};
            const take=chat.takeId?store.take(chat.takeId):null;
            const context=take?{title:take.title,thesis:take.thesis,invalidation:take.invalidation,phase:take.phase,attention:take.attention,holdings:take.holdings,value:value(take),cash:take.cash,reviews:store.reviews(take.id).filter(item=>item.applied).slice(0,2)}:{openingContext:chat.messages.slice(0,8),lastProposal:chat.proposal};
            const assistantTurns=chat.messages.filter(m=>m.role==='assistant').length;
            const mustPropose=assistantTurns>=2&&!chat.proposal;
            const adjusting=typeof data.adjusting==='boolean'?data.adjusting:false;
            const result=await askOpenAI([...chat.messages,message],context,{...current,assistantTurns,mustPropose,adjusting,instructionsOverride:current.instructionsOverride});store.tokens('chat',result.usage,0,day);
            chat.messages.push(message,{role:'assistant',content:result.message,at:new Date().toISOString()});
            if(chat.messages.length===2)chat.title=message.content.slice(0,65);
            if(result.proposal&&(!take||take.phase==='draft'))chat.proposal=result.proposal;
            store.transaction(()=>{
              store.putChat(chat);
              if(result.proposal&&take?.phase==='draft'){
                applyDraftProposal(take,result.proposal);
                rememberChange(take);
              }
              idem.save(chat);
            });return json(res,200,chat);
          }finally{aiBusy=false;}
        }
        return json(res,404,{error:'Ruta no encontrada.'});
      }
      assert(['GET','HEAD'].includes(req.method),'Método no permitido.',405);
      const logoMatch=path.match(/^\/logos\/([A-Za-z0-9.]{1,8})\.svg$/);
      if(logoMatch){
        const svg=tickerLogoSvg(logoMatch[1]);
        res.writeHead(200,{'Content-Type':'image/svg+xml; charset=utf-8','Cache-Control':'public, max-age=86400'});
        res.end(req.method==='HEAD'?undefined:svg);
        return;
      }
      const assets={'/':'home.html','/app':'index.html','/app/':'index.html','/como-funciona':'how.html','/acerca':'about.html','/about':'about.html','/privacidad':'privacy.html','/alcance':'scope.html','/site.css':'site.css','/brand.css':'brand.css','/terminal.css':'terminal.css','/icons.js':'icons.js','/fonts/space-grotesk-700.ttf':'fonts/space-grotesk-700.ttf','/fonts/plex-mono-400.ttf':'fonts/plex-mono-400.ttf','/fonts/instrument-sans-400.woff2':'fonts/instrument-sans-400.woff2','/fonts/instrument-sans-500.woff2':'fonts/instrument-sans-500.woff2','/fonts/instrument-sans-600.woff2':'fonts/instrument-sans-600.woff2','/fonts/instrument-sans-700.woff2':'fonts/instrument-sans-700.woff2','/app-theme.css':'app-theme.css','/site.js':'site.js','/pulse.js':'pulse.js','/format.mjs':'format.mjs','/portfolio.mjs':'portfolio.mjs','/por-que.mjs':'por-que.mjs','/wbar.mjs':'wbar.mjs','/chart-suizo.mjs':'chart-suizo.mjs','/ticker-logo.mjs':'ticker-logo.mjs','/social-card.png':'social-card.png','/robots.txt':'robots.txt','/sitemap.xml':'sitemap.xml','/fonts/dm-sans-400.ttf':'fonts/dm-sans-400.ttf','/fonts/dm-sans-700.ttf':'fonts/dm-sans-700.ttf','/app.js':'app.js','/copy.mjs':'copy.mjs','/chart-copy.mjs':'chart-copy.mjs','/math.js':'math.js','/timeline.mjs':'timeline.mjs','/integrations.js':'integrations.js','/admin-agent.mjs':'admin-agent.mjs','/styles.css':'styles.css','/favicon.svg':'favicon.svg'};
      const file=assets[path];assert(file,'Archivo no encontrado.',404);
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2','.png':'image/png','.txt':'text/plain; charset=utf-8','.xml':'application/xml; charset=utf-8'};
      res.writeHead(200,{'Content-Type':types[extname(file)],'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:readFileSync(resolve(root,'public',file)));
    }catch(error){
      if(!error.status)console.error(JSON.stringify({event:'request_failed',type:error.name,path:req.url?.split('?')[0]}));
      if(!res.headersSent)json(res,error.status||500,{error:error.status?error.message:error.name==='TimeoutError'?'El proveedor tardó demasiado. Reintentá.':'No se pudo completar la solicitud.'});else res.end();
    }
  });
  const cleanup=setInterval(()=>{
    for(const [key,until] of sessions)if(until<Date.now())sessions.delete(key);
    for(const [key,until] of adminSessions)if(until<Date.now())adminSessions.delete(key);
  },60000);cleanup.unref();
  return {server,store,config,vault,scheduler,quotes,close:async()=>{clearInterval(cleanup);quotes.stopScheduler();const drained=new Promise(resolve=>server.close(resolve));await scheduler.close();await drained;store.close();}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=createApp();app.server.listen(app.config.port,app.config.host,()=>console.log(`La Viste lista · puerto ${app.config.port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
}
