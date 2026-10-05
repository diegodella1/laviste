import http from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve, extname, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID, randomBytes, timingSafeEqual, createHash} from 'node:crypto';
import {createStore} from './lib/store.mjs';
import {assert, createTake, activate, review, updateSettings, rebalanceToTarget, templates, catalog, value} from './lib/engine.mjs';
import {askOpenAI} from './lib/ai.mjs';
import {createVault} from './lib/vault.mjs';
import {createIOL} from './lib/iol.mjs';
import {createScheduler} from './lib/scheduler.mjs';
import {response} from './lib/openai.mjs';
import {extractSources} from './lib/news.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const hash=value=>createHash('sha256').update(String(value)).digest();
const validLimit=value=>Number.isInteger(value)&&value>=1&&value<=1000;

export function createApp(options={}) {
  const config={
    host:process.env.HOST||'127.0.0.1',port:Number(process.env.PORT||3080),
    password:process.env.APP_PASSWORD_FILE?readFileSync(process.env.APP_PASSWORD_FILE,'utf8').trim():process.env.APP_PASSWORD||'',
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
  const sessions=new Map(),loginAttempts=new Map();
  let aiBusy=false;
  const runtime=()=>{
    const settings=store.setting('openai')||{};
    const secret=vault.get('openai');
    return {...config,...settings,apiKey:secret?.apiKey||config.apiKey,fetcher:config.fetcher};
  };
  const iol=createIOL(vault,store,{fetcher:config.iolFetcher});
  const scheduler=createScheduler(store,runtime,{researcher:config.researcher});
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const cookie=req=>req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith('laviste_session='))?.split('=')[1];
  const authed=req=>!config.password||(sessions.get(cookie(req))||0)>Date.now();
  const aiRequired=()=>assert(runtime().apiKey,'Cargá tu clave OpenAI en Configuración para continuar.',503);
  async function body(req) {
    let raw='';
    for await(const chunk of req){raw+=chunk;assert(Buffer.byteLength(raw)<64000,'Solicitud demasiado grande.',413);}
    let data;try{data=JSON.parse(raw||'{}');}catch{throw Object.assign(new Error('JSON inválido.'),{status:400});}
    assert(data&&typeof data==='object'&&!Array.isArray(data),'Se esperaba un objeto JSON.');return data;
  }
  function integrationState() {
    const current=runtime();
    return {aiConfigured:!!current.apiKey,model:current.model,dailyLimit:current.dailyLimit,newsLimit:current.newsLimit,
      authEnabled:!!config.password,market:'simulation',vaultReady:vault.available,rebalanceAvailable:true,
      openaiStatus:store.setting('openaiStatus')||{},iolConfigured:!!vault.get('iol')};
  }
  function rememberChange(take) {
    take.version=(take.version||1)+1;
    store.version(take);store.putTake(take);
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
      if(path==='/api/session'&&req.method==='GET')return json(res,200,{authenticated:authed(req),required:!!config.password});
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
      if(path.startsWith('/api/')){
        assert(authed(req),'Iniciá sesión para continuar.',401);
        if(path==='/api/logout'&&req.method==='POST'){sessions.delete(cookie(req));res.setHeader('Set-Cookie',`laviste_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${config.secure?'; Secure':''}`);return json(res,200,{ok:true});}
        if(path==='/api/state'&&req.method==='GET'){
          const usage=store.usage(),chat=usage.find(row=>row.kind==='chat')||{calls:0,input_tokens:0,output_tokens:0};
          return json(res,200,{takes:store.takes(),chats:store.chats(),templates,catalog,config:integrationState(),usage:chat,consumption:usage,reviews:store.reviews().slice(0,100),jobs:store.jobs().slice(0,30)});
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
              const result=await askOpenAI([{role:'user',content:'Respondé una frase confirmando que podemos explorar una idea. No generes cartera.'}],null,current);
              onUsage(result.usage,0);
            }else{
              const result=await response({tools:[{type:'web_search',search_context_size:'low'}],tool_choice:'required',max_tool_calls:1,include:['web_search_call.action.sources'],input:'Buscá la página oficial de relaciones con inversores de Microsoft y citá su URL. Una sola frase.'},{...current,onUsage});
              assert(extractSources(result).length,'La búsqueda no devolvió fuentes.',502);
            }
            store.setSetting('openaiStatus',{...(store.setting('openaiStatus')||{}),[data.target]:{ok:true,at:new Date().toISOString()}});
            return json(res,200,{ok:true,target:data.target});
          }catch(error){store.setSetting('openaiStatus',{...(store.setting('openaiStatus')||{}),[data.target]:{ok:false,at:new Date().toISOString()}});throw error;}finally{aiBusy=false;}
        }
        if(path==='/api/integrations/iol'&&req.method==='POST'){const data=await body(req);return json(res,200,await iol.connect(data.username,data.password));}
        if(path==='/api/integrations/iol/remove'&&req.method==='POST'){iol.disconnect();return json(res,200,{ok:true});}
        if(path==='/api/brokers/iol/snapshot'&&req.method==='GET')return json(res,200,await iol.snapshot());
        if(path==='/api/brokers/iol/quote'&&req.method==='GET')return json(res,200,await iol.quote(url.searchParams.get('market')||'',url.searchParams.get('symbol')||''));
        if(path==='/api/export'&&req.method==='GET'){
          res.setHeader('Content-Disposition','attachment; filename="laviste-export.json"');
          return json(res,200,{version:2,exportedAt:new Date().toISOString(),takes:store.takes(),chats:store.chats(),versions:store.takes().flatMap(take=>store.versions(take.id)),reviews:store.reviews()});
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
        const match=path.match(/^\/api\/takes\/([\w-]+)\/(activate|review|scenario|settings|idea|archive|versions|reviews|rebalance)$/);
        if(match){
          let take=store.take(match[1]);assert(take,'No encontramos esa tesis.',404);const action=match[2];
          if(req.method==='GET'&&action==='versions')return json(res,200,store.versions(take.id));
          if(req.method==='GET'&&action==='reviews')return json(res,200,store.reviews(take.id));
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
            store.transaction(()=>{result=rebalanceToTarget(take);rememberChange(take);store.putTake(take);idem.save(take);});
            return json(res,200,{take,result});
          }
          assert(['activate','archive','settings','idea'].includes(action),'Método no permitido.',405);
          store.transaction(()=>{
            if(action==='activate'){aiRequired();activate(take,data.amount);take.nextCheckAt=new Date().toISOString();}
            if(action==='archive'){take.phase='archived';take.nextCheckAt=null;take.monitoringPaused=true;}
            if(action==='settings'){
              assert(typeof data.monitoringPaused==='boolean','Indicá si el seguimiento está pausado.');
              const prevCap=take.settings.cap,prevDrift=take.settings.drift;
              take.monitoringPaused=data.monitoringPaused;updateSettings(take,data);
              if(!take.monitoringPaused)aiRequired();rememberChange(take);
              if(prevCap!==take.settings.cap||prevDrift!==take.settings.drift){
                const now=new Date().toISOString();
                take.events.unshift({id:randomUUID(),at:now,type:'rules',title:'Reglas actualizadas',body:`Tope por posición ${take.settings.cap}% · desvío ${take.settings.drift} pp.`,ruleCite:`Regla (La idea): tope ${take.settings.cap}% · desvío ${take.settings.drift} pp`,verdict:'none',verdictText:'No necesitás hacer nada'});
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
            const result=await askOpenAI([...chat.messages,message],context,{...current,assistantTurns,mustPropose,adjusting});store.tokens('chat',result.usage,0,day);
            chat.messages.push(message,{role:'assistant',content:result.message,at:new Date().toISOString()});
            if(chat.messages.length===2)chat.title=message.content.slice(0,65);
            if(result.proposal&&(!take||take.phase==='draft'))chat.proposal=result.proposal;
            store.transaction(()=>{store.putChat(chat);idem.save(chat);});return json(res,200,chat);
          }finally{aiBusy=false;}
        }
        return json(res,404,{error:'Ruta no encontrada.'});
      }
      assert(['GET','HEAD'].includes(req.method),'Método no permitido.',405);
      const assets={'/':'home.html','/app':'index.html','/app/':'index.html','/como-funciona':'how.html','/acerca':'about.html','/about':'about.html','/privacidad':'privacy.html','/alcance':'scope.html','/site.css':'site.css','/brand.css':'brand.css','/terminal.css':'terminal.css','/icons.js':'icons.js','/fonts/space-grotesk-700.ttf':'fonts/space-grotesk-700.ttf','/fonts/plex-mono-400.ttf':'fonts/plex-mono-400.ttf','/app-theme.css':'app-theme.css','/site.js':'site.js','/pulse.js':'pulse.js','/format.mjs':'format.mjs','/portfolio.mjs':'portfolio.mjs','/por-que.mjs':'por-que.mjs','/social-card.png':'social-card.png','/robots.txt':'robots.txt','/sitemap.xml':'sitemap.xml','/fonts/dm-sans-400.ttf':'fonts/dm-sans-400.ttf','/fonts/dm-sans-700.ttf':'fonts/dm-sans-700.ttf','/app.js':'app.js','/math.js':'math.js','/timeline.mjs':'timeline.mjs','/integrations.js':'integrations.js','/styles.css':'styles.css','/favicon.svg':'favicon.svg'};
      const file=assets[path];assert(file,'Archivo no encontrado.',404);
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ttf':'font/ttf','.png':'image/png','.txt':'text/plain; charset=utf-8','.xml':'application/xml; charset=utf-8'};
      res.writeHead(200,{'Content-Type':types[extname(file)],'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:readFileSync(resolve(root,'public',file)));
    }catch(error){
      if(!error.status)console.error(JSON.stringify({event:'request_failed',type:error.name,path:req.url?.split('?')[0]}));
      if(!res.headersSent)json(res,error.status||500,{error:error.status?error.message:error.name==='TimeoutError'?'El proveedor tardó demasiado. Reintentá.':'No se pudo completar la solicitud.'});else res.end();
    }
  });
  const cleanup=setInterval(()=>{for(const [key,until] of sessions)if(until<Date.now())sessions.delete(key);},60000);cleanup.unref();
  return {server,store,config,vault,scheduler,close:async()=>{clearInterval(cleanup);const drained=new Promise(resolve=>server.close(resolve));await scheduler.close();await drained;store.close();}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=createApp();app.server.listen(app.config.port,app.config.host,()=>console.log(`La Viste lista · puerto ${app.config.port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
}
