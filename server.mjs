import http from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve, extname, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID, randomBytes, timingSafeEqual, createHash} from 'node:crypto';
import {createStore} from './lib/store.mjs';
import {
  createAuth, sessionCookieHeader, clearSessionCookieHeader, SESSION_TTL_MS,
  clientIp, hashIp, resetLinkOrigin,
} from './lib/auth.mjs';
import {allowGoogleSuperadmin, createGoogleAuth, readGoogleSecrets} from './lib/google-auth.mjs';
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
import {createAutoRunner} from './lib/auto/runner.mjs';
import {autoAllowedForUser} from './lib/auto/flags.mjs';
import {VERDICT_NO_ACTION} from './lib/copy.mjs';
import {ADMIN_RESET_SELF} from './public/copy.mjs';
import {createQuotesService, demoCatalogPrices, quotesOptionsFromConfig} from './lib/quotes.mjs';
import {chooseBenchmark} from './lib/benchmark.mjs';
import {prepareHoldingsQuotesForActivation, tryStampRealPricesAtActivation} from './lib/quote-migration.mjs';
import {response} from './lib/openai.mjs';
import {extractSources, loadEnabledFeedDigest} from './lib/news.mjs';
import {recordActivationOps, recordRebalanceOps, recordAporteOp, recordRetiroOp, recordCorreccionOp, quotesApiFromService} from './lib/ops.mjs';
import {createPendingOrder, confirmPendingOrder, cancelPendingOrder} from './lib/orders.mjs';
import {assertPublicFeedUrl, probeFeed, validateFeedFields} from './lib/feeds.mjs';
import {ROLE_FORBIDDEN} from './lib/route-scope.mjs';
import {validatePublicAlias} from './lib/public-alias.mjs';
import {createDailyMarksJob} from './lib/daily-marks.mjs';
import {
  getLeaderboardItem, LEADERBOARD_CACHE_CONTROL, listLeaderboard,
} from './lib/leaderboard.mjs';
import {
  recomputePublicTakeStats, refreshPublicStatsAlias, switchProgress,
} from './lib/leaderboard-stats.mjs';
import {publicHomeRedirectLocation} from './public/home-route.mjs';
import {
  withUserQuota, createRpmTracker, assertMonitoredRoom, chatSizeError,
  CHAT_SIZE_CAP, CHAT_MESSAGE_MAX, TOKEN_RESERVE_UNITS,
} from './lib/quota.mjs';
import {withAiGate} from './lib/budget.mjs';
import {createAiSemaphore, DEFAULT_AI_GLOBAL_SLOTS, resolveInt} from './lib/ai-lock.mjs';
import {createFeedDigestCache, FEED_DIGEST_TTL_MS} from './lib/feed-digest-cache.mjs';
import {
  APP_HTML_POST_MAX, applyHtmlRevision, deployRevision, drainCapped, hasSessionCookieHeader,
  isDeployRevision, loadStaticAssets, notModified, parseAssetRequest, SESSION_HTML_FILE,
  staleRevisionLocation, STATE_CACHE, stateEtag, staticCacheControl, staticRepresentation, withGzip,
} from './lib/http-cache.mjs';

export {publicHomeRedirectLocation};

const root=dirname(fileURLToPath(import.meta.url));
const hash=value=>createHash('sha256').update(String(value)).digest();
const validLimit=value=>Number.isInteger(value)&&value>=1&&value<=1000;
const STATIC_ASSETS={'/':'home.html','/preguntas':'home.html','/app':'index.html','/app/':'index.html','/como-funciona':'how.html','/acerca':'about.html','/about':'about.html','/privacidad':'privacy.html','/alcance':'scope.html','/site.css':'site.css','/brand.css':'brand.css','/terminal.css':'terminal.css','/icons.js':'icons.js','/fonts/space-grotesk-700.ttf':'fonts/space-grotesk-700.ttf','/fonts/plex-mono-400.ttf':'fonts/plex-mono-400.ttf','/fonts/instrument-sans-400.woff2':'fonts/instrument-sans-400.woff2','/fonts/instrument-sans-500.woff2':'fonts/instrument-sans-500.woff2','/fonts/instrument-sans-600.woff2':'fonts/instrument-sans-600.woff2','/fonts/instrument-sans-700.woff2':'fonts/instrument-sans-700.woff2','/fonts/plus-jakarta-sans-400.woff2':'fonts/plus-jakarta-sans-400.woff2','/fonts/plus-jakarta-sans-600.woff2':'fonts/plus-jakarta-sans-600.woff2','/fonts/plus-jakarta-sans-700.woff2':'fonts/plus-jakarta-sans-700.woff2','/fonts/plus-jakarta-sans-800.woff2':'fonts/plus-jakarta-sans-800.woff2','/fonts/inter-400.woff2':'fonts/inter-400.woff2','/fonts/inter-600.woff2':'fonts/inter-600.woff2','/fonts/jetbrains-mono-500.woff2':'fonts/jetbrains-mono-500.woff2','/fonts/jetbrains-mono-600.woff2':'fonts/jetbrains-mono-600.woff2','/app-theme.css':'app-theme.css','/site.js':'site.js','/pulse.js':'pulse.js','/format.mjs':'format.mjs','/portfolio.mjs':'portfolio.mjs','/thesis-state.mjs':'thesis-state.mjs','/novedades.mjs':'novedades.mjs','/por-que.mjs':'por-que.mjs','/wbar.mjs':'wbar.mjs','/chart-suizo.mjs':'chart-suizo.mjs','/ticker-logo.mjs':'ticker-logo.mjs','/social-card.png':'social-card.png','/robots.txt':'robots.txt','/sitemap.xml':'sitemap.xml','/fonts/dm-sans-400.ttf':'fonts/dm-sans-400.ttf','/fonts/dm-sans-700.ttf':'fonts/dm-sans-700.ttf','/app.js':'app.js','/copy.mjs':'copy.mjs','/def-short.mjs':'def-short.mjs','/rev.mjs':'rev.mjs','/app-critical.css':'app-critical.css','/auto.mjs':'auto.mjs','/ajustes.mjs':'ajustes.mjs','/tesis-detalle.mjs':'tesis-detalle.mjs','/take-route.mjs':'take-route.mjs','/home-route.mjs':'home-route.mjs','/chart-copy.mjs':'chart-copy.mjs','/math.js':'math.js','/timeline.mjs':'timeline.mjs','/integrations.js':'integrations.js','/admin-agent.mjs':'admin-agent.mjs','/admin-fuentes.mjs':'admin-fuentes.mjs','/styles.css':'styles.css','/favicon.svg':'favicon.svg'};
const STATIC_TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2','.png':'image/png','.txt':'text/plain; charset=utf-8','.xml':'application/xml; charset=utf-8'};
const staticFiles=loadStaticAssets(resolve(root,'public'),STATIC_ASSETS);

export function createApp(options={}) {
  const config={
    host:process.env.HOST||'127.0.0.1',port:Number(process.env.PORT||3080),
    password:process.env.APP_PASSWORD_FILE?readFileSync(process.env.APP_PASSWORD_FILE,'utf8').trim():process.env.APP_PASSWORD||'',
    adminKey:process.env.ADMIN_KEY_FILE?readFileSync(process.env.ADMIN_KEY_FILE,'utf8').trim():options.adminKey||'',
    apiKey:process.env.OPENAI_API_KEY||'',model:process.env.OPENAI_MODEL||'gpt-5-mini',
    dailyLimit:Number(process.env.AI_DAILY_LIMIT||30),newsLimit:Number(process.env.NEWS_DAILY_LIMIT||10),
    secure:process.env.COOKIE_SECURE==='true',origin:process.env.APP_ORIGIN||'',
    ownerEmail:process.env.OWNER_EMAIL||'',
    masterKeyPath:process.env.MASTER_KEY_FILE||'',dataDir:resolve(root,process.env.DATA_DIR||'data'),...options,
  };
  if(config.gzipStatic==null)config.gzipStatic=process.env.GZIP_STATIC==='1';
  const revision=deployRevision(process.env,config.releaseSha);
  assert(['127.0.0.1','localhost','::1'].includes(config.host)||config.password.length>=12,'Configurá una contraseña de al menos 12 caracteres.');
  assert(!config.origin||config.password.length>=12,'El origen público requiere contraseña.');
  assert(validLimit(config.dailyLimit)&&validLimit(config.newsLimit),'Límites de consumo inválidos.');
  const store=createStore(config.dataDir,{
    seed:config.seed===true,
    ownerEmail:config.ownerEmail||undefined,
    ownerPassword:config.password,
  });
  const vault=createVault(store,config.masterKeyPath);
  const auth=createAuth(store,{now:options.now});
  auth.bootstrapOwnerPassword(config.password);
  const googleSecrets=readGoogleSecrets({
    clientId:config.googleClientId,
    clientSecret:config.googleClientSecret,
    clientIdFile:config.googleClientIdFile??process.env.GOOGLE_CLIENT_ID_FILE,
    clientSecretFile:config.googleClientSecretFile??process.env.GOOGLE_CLIENT_SECRET_FILE,
  });
  const google=createGoogleAuth(store,auth,{
    ...googleSecrets,
    allowSuperadmin:config.googleAllowSuperadmin??allowGoogleSuperadmin(),
    fetcher:config.googleFetcher,
    secure:config.secure,
    origin:config.origin,
    now:options.now,
    tokenTimeoutMs:config.googleTokenTimeoutMs,
  });
  const files=withGzip(applyHtmlRevision(staticFiles,revision,{google:google.enabled}),config.gzipStatic);
  const adminSessions=new Map(),adminLoginAttempts=new Map(),previewWindows=new Map(),feedProbeWindows=new Map();
  const rpm=createRpmTracker();
  const adminEnabled=config.adminKey.length>=24;
  const aiLock=options.aiLock||createAiSemaphore({
    globalSlots:resolveInt(options.aiConcurrency,'AI_CONCURRENCY',DEFAULT_AI_GLOBAL_SLOTS,{min:1,max:8}),
    leaseMs:options.aiLeaseMs,
    now:options.now,
  });
  const feedDigestCache=options.feedDigestCache||createFeedDigestCache({
    ttlMs:resolveInt(options.rssDigestTtlMs,'RSS_DIGEST_TTL_MS',FEED_DIGEST_TTL_MS,{min:1000,max:600000}),
    load:(cfg,opts)=>loadEnabledFeedDigest(cfg,opts),
    now:options.now,
  });
  function assertUserRpm(user) {
    const limits=store.effectiveLimits(user.id,user.role);
    if(limits.exempt)return;
    rpm.assertRpm(user.id,limits.rpm);
  }
  const runtime=()=>{
    const settings=store.setting('openai')||{};
    const secret=vault.get('openai');
    const agent=getActiveAgentInstructions(store);
    return {...config,...settings,apiKey:secret?.apiKey||config.apiKey,fetcher:config.fetcher,instructionsOverride:agent.body,feedDigestCache};
  };
  const iol=createIOL(vault,store,{fetcher:config.iolFetcher});
  const env=options.env||process.env;
  let autoRunner=null;
  const quotes=createQuotesService(store,{
    ...quotesOptionsFromConfig(config),
    onSynced:takeId=>autoRunner?.onSynced(takeId),
  });
  autoRunner=createAutoRunner({
    store,quotesApi:quotes,now:options.now||(()=>Date.now()),env,
    startTimer:options.autoStartTimer!==false,inject:options.autoInject||{},
  });
  const scheduler=createScheduler(store,runtime,{
    researcher:config.researcher,aiLock,digestCache:feedDigestCache,
    jobsPerHour:options.jobsPerHour,rssDigestTtlMs:options.rssDigestTtlMs,now:options.now,
    onAutoReview:(takeId,result)=>autoRunner?.onReview(takeId,result),
    onCheck:(take,now)=>{
    quotes.syncTakePrices(take,now);
    const val=value(take);
    const point={at:now,value:val,benchmark:take.invested};
    const idx=quotes.indexSnapshot(take);
    if(idx!=null){point.index=idx;point.indexRecorded=true;}
    take.history.push(point);
    take.history=take.history.slice(-365);
  }});
  const liveQuotesScheduler=config.quotesLive!==false&&!quotes.isDemo();
  if(liveQuotesScheduler)quotes.startScheduler();
  else if(quotes.isDemo()||config.quotesFixture||config.quotesPrimary)quotes.refresh({force:true}).catch(()=>{});
  const dailyMarks=createDailyMarksJob({
    store,quotes,now:options.now||Date.now,
    startTimer:options.dailyMarksStartTimer!==false,
  });
  const liveCatalog=()=>catalog.map(row=>{
    const q=quotes.getCached(row.ticker);
    return {...row,price:q?.price??null,quoteAvailable:!!q};
  });
  const clientTakes=scoped=>scoped.takes().map(take=>{
    const copy=structuredClone(take);
    if(copy.phase==='active'&&copy.scenario==='normal'&&copy.realPricesAt)quotes.applyCatalogToHoldings(copy.holdings);
    return copy;
  });
  const json=(res,status,data,headers={})=>{
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});
    res.end(JSON.stringify(data));
  };
  const cookie=req=>req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith('laviste_session='))?.split('=')[1];
  const adminCookie=req=>req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith('laviste_admin='))?.split('=')[1];
  const currentSession=req=>auth.sessionFromToken(cookie(req));
  const sessionUser=req=>currentSession(req)?.user||(!config.password?auth.publicOwner():null);
  const authed=req=>!config.password||!!currentSession(req);
  const adminAuthed=req=>adminEnabled&&(adminSessions.get(adminCookie(req))||0)>Date.now();
  const aiRequired=()=>{
    if(runtime().apiKey)return;
    throw Object.assign(new Error('Cargá tu clave OpenAI en Configuración para continuar.'),{status:503,code:'ai_required'});
  };
  async function body(req) {
    let raw='';
    for await(const chunk of req){raw+=chunk;assert(Buffer.byteLength(raw)<64000,'Solicitud demasiado grande.',413);}
    let data;try{data=JSON.parse(raw||'{}');}catch{throw Object.assign(new Error('JSON inválido.'),{status:400});}
    assert(data&&typeof data==='object'&&!Array.isArray(data),'Se esperaba un objeto JSON.');return data;
  }
  function integrationState(role) {
    const current=runtime();
    const qs=quotes.status();
    const full={aiConfigured:!!current.apiKey,model:current.model,dailyLimit:current.dailyLimit,newsLimit:current.newsLimit,
      authEnabled:!!config.password,adminEnabled,market:qs.market,vaultReady:vault.available,rebalanceAvailable:true,
      openaiStatus:store.setting('openaiStatus')||{},iolEnabled:iolEnabled(),iolConfigured:iolEnabled()&&!!vault.get('iol'),
      quotes:{asOf:qs.asOf,stale:qs.stale,marketOpen:qs.marketOpen}};
    if(role!=='superadmin'){
      return {aiConfigured:full.aiConfigured,authEnabled:full.authEnabled,adminEnabled:false,market:full.market,
        rebalanceAvailable:true,quotes:full.quotes,iolEnabled:full.iolEnabled};
    }
    return full;
  }
  function rememberChange(dbStore,take) {
    take.version=(take.version||1)+1;
    dbStore.version(take);dbStore.putTake(take);
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
  function trackFeedProbe(req) {
    const key=adminCookie(req)||'anon';
    const now=Date.now();
    const recent=(feedProbeWindows.get(key)||[]).filter(at=>now-at<3600000);
    assert(recent.length<30,'Demasiadas pruebas. Esperá un momento.',429);
    recent.push(now);feedProbeWindows.set(key,recent);
  }
  function uniqueFeedWrite(fn) {
    try { return fn(); }
    catch (error) {
      if (/UNIQUE/i.test(error.message||'') || /CONSTRAINT/i.test(error.code||'')) assert(false,'Ya existe una fuente con esa URL.',409);
      throw error;
    }
  }
  async function runFeedProbe(url) {
    return probeFeed(url,{fetcher:config.feedFetcher,lookupFn:config.feedLookup});
  }
  function idempotency(dbStore,req,path,data) {
    const raw=req.headers['idempotency-key'];
    assert(!raw||/^[\w-]{8,100}$/.test(raw),'Idempotency-Key inválida.');
    const key=raw?path+':'+raw:null;
    const fingerprint=hash(JSON.stringify(data)).toString('hex');
    const existing=key&&dbStore.idempotent(key);
    assert(!existing||existing.fingerprint===fingerprint,'La operación ya existe con otros datos.',409);
    return {cached:existing?.data,save:result=>{if(key)dbStore.remember(key,fingerprint,result);}};
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://cloudflareinsights.com; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    try {
      const url=new URL(req.url,'http://localhost'),path=url.pathname;
      if(!config.password)assert(['127.0.0.1','localhost','[::1]'].includes(new URL('http://'+req.headers.host).hostname),'Host no autorizado.',403);
      const googleCallback=req.method==='GET'&&path==='/api/auth/google/callback';
      const appHtmlPost=(path==='/app'||path==='/app/')&&req.method==='POST';
      if(!googleCallback&&req.headers['sec-fetch-site']==='cross-site'&&(path.startsWith('/api/')||!['GET','HEAD'].includes(req.method)))return json(res,403,{error:'Acceso desde otro sitio rechazado.'});
      if(!['GET','HEAD'].includes(req.method)&&!appHtmlPost){
        assert(req.headers['content-type']?.split(';')[0]==='application/json','Content-Type debe ser application/json.',415);
        if(req.headers.origin)assert(config.origin?req.headers.origin===config.origin:new URL(req.headers.origin).host===req.headers.host,'Origen no autorizado.',403);
      }
      if(path==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,service:'laviste',revision});
      if(path==='/api/session'&&req.method==='GET'){
        const sess=currentSession(req);
        const authenticated=authed(req);
        const user=sess?.user||(!config.password?auth.publicOwner():null);
        return json(res,200,{
          authenticated,required:!!config.password,
          ...(user?{user,role:user.role}:{}),
          admin:{enabled:adminEnabled,unlocked:adminAuthed(req)},
          google:google.sessionFlag(),
          passwordReset:{enabled:false},
        });
      }
      if(path==='/api/auth/google/start'&&req.method==='GET')return google.handleStart(req,res);
      if(path==='/api/auth/google/callback'&&req.method==='GET')return await google.handleCallback(req,res);
      if(path==='/api/login'&&req.method==='POST'){
        const data=await body(req);
        const result=auth.login({
          email:data.email,password:data.password,ip:clientIp(req),
          ua:req.headers['user-agent'],
        });
        res.setHeader('Set-Cookie',sessionCookieHeader(result.token,{maxAge:SESSION_TTL_MS/1000,secure:config.secure}));
        return json(res,200,{ok:true,user:result.user,role:result.role});
      }
      if(path==='/api/auth/reset/check'&&req.method==='POST'){
        const data=await body(req);
        return json(res,200,auth.checkResetToken(data.token,{ip:clientIp(req)}));
      }
      if(path==='/api/auth/reset'&&req.method==='POST'){
        const data=await body(req);
        const result=auth.consumeResetToken(data.token,{next:data.next,ip:clientIp(req),ua:req.headers['user-agent']});
        res.setHeader('Set-Cookie',sessionCookieHeader(result.token,{maxAge:SESSION_TTL_MS/1000,secure:config.secure}));
        return json(res,200,{ok:true,user:result.user,role:result.role});
      }
      if(path.startsWith('/api/admin')){
        assert(adminEnabled,'Administración no disponible.',503);
        const adminUser=sessionUser(req);
        assert(adminUser,'Iniciá sesión para continuar.',401);
        assert(adminUser.role==='superadmin',ROLE_FORBIDDEN,403);
        if(path==='/api/admin/login'&&req.method==='POST'){
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
        if(path==='/api/admin/model-prices'&&req.method==='GET')return json(res,200,store.modelPrices());
        if(path==='/api/admin/model-prices'&&req.method==='PUT'){
          const data=await body(req);
          return json(res,200,store.setModelPrices(data));
        }
        if(path==='/api/admin/usage'&&req.method==='GET'){
          const userId=url.searchParams.get('userId')||undefined;
          if(userId)assert(/^[0-9a-f-]{36}$/i.test(userId),'Usuario inválido.',400);
          return json(res,200,store.listUserUsage({
            from:url.searchParams.get('from')||undefined,
            to:url.searchParams.get('to')||undefined,
            userId,
          }));
        }
        if(path==='/api/admin/limits'&&req.method==='GET')return json(res,200,store.listQuotaState());
        if(path==='/api/admin/ai'&&req.method==='GET'){
          store.syncBudgetAlerts({actorUserId:adminUser.id,ipHash:hashIp(clientIp(req))});
          return json(res,200,store.adminBudgetPayload());
        }
        if(path==='/api/admin/ai'&&req.method==='PUT'){
          const data=await body(req);
          return json(res,200,store.setAiControl(data,{updatedBy:adminUser.id,ipHash:hashIp(clientIp(req))}));
        }
        const limitsMatch=path.match(/^\/api\/admin\/limits\/([0-9a-f-]{36})$/i);
        if(limitsMatch&&req.method==='PUT'){
          const data=await body(req);
          return json(res,200,store.setUserLimits(limitsMatch[1],data,{updatedBy:adminUser.id}));
        }
        const resetAccessMatch=path.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/reset-access$/i);
        if(resetAccessMatch&&req.method==='POST'){
          await body(req);
          const targetId=resetAccessMatch[1];
          if(targetId===adminUser.id){
            throw Object.assign(new Error(ADMIN_RESET_SELF),{status:409,code:'reset_self'});
          }
          auth.checkAdminResetLimit(adminUser.id);
          const result=auth.createResetLink(targetId,{
            origin:resetLinkOrigin(req,config),
            createdBy:adminUser.id,
            actorUserId:adminUser.id,
            source:'admin',
            ip:clientIp(req),
          });
          return json(res,200,{link:result.link,email:result.email,expiresAt:result.expiresAt});
        }
        if(path==='/api/admin/agent-prompt/preview'&&req.method==='POST'){
          aiRequired();store.assertAiAllowed({kind:'preview',model:runtime().model});
          const data=await body(req);const current=runtime();
          assertUserRpm(adminUser);
          trackPreviewWindow(req);
          const draft=assertAgentPromptBody(data.body,{allowWarnings:true});
          let thesis=typeof data.thesis==='string'?data.thesis.trim():'';
          if(data.sampleId&&data.sampleId!=='custom'){assert(SAMPLE_THESIS[data.sampleId], 'Muestra desconocida.',400);thesis=SAMPLE_THESIS[data.sampleId];}
          assert(thesis.length>=20&&thesis.length<=4000,'La tesis debe tener entre 20 y 4000 caracteres.',400);
          const chatsBefore=store.admin.chats().length,takesBefore=store.admin.takes().length;
          const result=await aiLock.withSlot(adminUser.id,()=>withAiGate(store,{kind:'preview',model:current.model},()=>withUserQuota(store,adminUser,[{kind:'chat',n:1},{kind:'tokens',n:TOKEN_RESERVE_UNITS}],async()=>{
            const out=await askOpenAI([{role:'user',content:`Armá la propuesta de cartera de práctica para esta tesis: ${thesis}`}],null,{
              ...current,assistantTurns:2,mustPropose:true,instructionsOverride:draft,
              userId:adminUser.id,usageKind:'preview',
              onUsage:(usage)=>store.recordUserUsage({userId:adminUser.id,kind:'preview',usage,model:current.model}),
            });
            store.tokens('chat',out.usage,0);
            return out;
          })));
          assert(store.admin.chats().length===chatsBefore&&store.admin.takes().length===takesBefore,'La vista previa no debe persistir datos.',500);
          return json(res,200,{message:result.message,proposal:result.proposal,usage:result.usage});
        }
        if(path==='/api/admin/feeds'&&req.method==='GET')return json(res,200,{feeds:store.listNewsFeeds()});
        if(path==='/api/admin/feeds'&&req.method==='POST'){
          const data=await body(req);
          const fields=validateFeedFields(data,{partial:false});
          await assertPublicFeedUrl(fields.url,{lookupFn:config.feedLookup});
          const feed=uniqueFeedWrite(()=>store.insertNewsFeed(fields));
          return json(res,201,feed);
        }
        if(path==='/api/admin/feeds/probe'&&req.method==='POST'){
          const data=await body(req);
          const href=(await assertPublicFeedUrl(data.url,{lookupFn:config.feedLookup})).href;
          trackFeedProbe(req);
          try{
            const result=await runFeedProbe(href);
            return json(res,200,result);
          }catch(error){
            const detail=error.status?error.message:'No se pudo leer el feed.';
            if(error.status===400)throw error;
            return json(res,200,{ok:false,detail});
          }
        }
        const feedProbeMatch=path.match(/^\/api\/admin\/feeds\/([\w-]+)\/(?:probe|probar)$/);
        if(feedProbeMatch&&req.method==='POST'){
          const feed=store.newsFeed(feedProbeMatch[1]);assert(feed,'Fuente inexistente.',404);
          trackFeedProbe(req);
          try{
            const result=await runFeedProbe(feed.url);
            const saved=store.recordNewsFeedProbe(feed.id,{ok:true,etag:result.etag,lastModified:result.lastModified});
            return json(res,200,{...result,feed:saved});
          }catch(error){
            const detail=error.status?error.message:'No se pudo leer el feed.';
            const saved=store.recordNewsFeedProbe(feed.id,{ok:false,error:detail});
            if(error.status===400)throw error;
            return json(res,200,{ok:false,detail,feed:saved});
          }
        }
        const feedMatch=path.match(/^\/api\/admin\/feeds\/([\w-]+)$/);
        if(feedMatch&&req.method==='PATCH'){
          const current=store.newsFeed(feedMatch[1]);assert(current,'Fuente inexistente.',404);
          const data=await body(req);
          const fields=validateFeedFields(data,{partial:true});
          if(fields.url)await assertPublicFeedUrl(fields.url,{lookupFn:config.feedLookup});
          const feed=uniqueFeedWrite(()=>store.updateNewsFeed(current.id,fields));
          return json(res,200,feed);
        }
        if(feedMatch&&req.method==='DELETE'){
          await body(req);
          assert(store.deleteNewsFeed(feedMatch[1]),'Fuente inexistente.',404);
          return json(res,200,{ok:true});
        }
        return json(res,404,{error:'Ruta no encontrada.'});
      }
      if(path.startsWith('/api/')){
        assert(authed(req),'Iniciá sesión para continuar.',401);
        const user=sessionUser(req);assert(user,'Iniciá sesión para continuar.',401);
        const scoped=store.forUser(user.id);
        const superadmin=user.role==='superadmin';
        if(path==='/api/logout'&&req.method==='POST'){
          auth.revoke(cookie(req));
          res.setHeader('Set-Cookie',clearSessionCookieHeader({secure:config.secure}));
          return json(res,200,{ok:true});
        }
        if(path==='/api/me'&&req.method==='GET'){
          return json(res,200,{...auth.me(user.id),googleEnabled:google.sessionFlag().enabled});
        }
        if(path==='/api/me/alias'&&req.method==='PUT'){
          const data=await body(req);
          const alias=validatePublicAlias(data.alias,{email:user.email});
          scoped.transaction(()=>{
            scoped.setPublicAlias(alias);
            refreshPublicStatsAlias(store,user.id,alias);
          });
          store.writeAudit({actorUserId:user.id,action:'user.alias',target:user.id,meta:{}});
          return json(res,200,{alias,publicAlias:alias});
        }
        if(path==='/api/me/password'&&req.method==='POST'){
          const data=await body(req);
          const result=auth.changePassword(user.id,{
            current:data.current,next:data.next,ip:clientIp(req),ua:req.headers['user-agent'],
          });
          res.setHeader('Set-Cookie',sessionCookieHeader(result.token,{maxAge:SESSION_TTL_MS/1000,secure:config.secure}));
          return json(res,200,{ok:true,revokedSessions:result.revokedSessions});
        }
        if(path==='/api/me/sessions/revoke-others'&&req.method==='POST'){
          await body(req);
          const sess=currentSession(req);
          const revoked=auth.revokeOthers(user.id,sess?.tokenHash);
          store.writeAudit({
            actorUserId:user.id,action:'auth.sessions_revoked_others',target:user.id,
            meta:{revoked},ipHash:hashIp(clientIp(req)),
          });
          return json(res,200,{revoked});
        }
        if(path==='/api/state'&&req.method==='GET'){
          const usage=scoped.usage(),chat=usage.find(row=>row.kind==='chat')||{calls:0,input_tokens:0,output_tokens:0};
          const quota=scoped.quotaSnapshotFor(user.id,user.role,scoped.takes());
          const ai=store.publicAi(user.role);
          const data={takes:clientTakes(scoped),chats:scoped.chats(),templates,catalog:liveCatalog(),config:integrationState(user.role),usage:chat,consumption:usage,quota,ai,reviews:scoped.reviews().slice(0,100),jobs:scoped.jobs().slice(0,30),orders:scoped.pendingOrders(),quotes:quotes.status()};
          const etag=stateEtag(user.id,JSON.stringify(data));
          const cacheHeaders={'Cache-Control':STATE_CACHE,ETag:etag,Vary:'Cookie'};
          if(notModified(req,{etag})){res.writeHead(304,cacheHeaders);res.end();return;}
          return json(res,200,data,cacheHeaders);
        }
        if(path.startsWith('/api/integrations'))assert(superadmin,ROLE_FORBIDDEN,403);
        if(path==='/api/integrations'&&req.method==='GET')return json(res,200,integrationState(user.role));
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
          });return json(res,200,integrationState(user.role));
        }
        if(path==='/api/integrations/openai/remove'&&req.method==='POST'){
          vault.remove('openai');config.apiKey='';store.deleteSetting('openaiStatus');return json(res,200,{ok:true});
        }
        if(path==='/api/integrations/openai/test'&&req.method==='POST'){
          aiRequired();const data=await body(req);
          assert(['chat','news'].includes(data.target),'Prueba desconocida.');
          store.assertAiAllowed({kind:data.target==='news'?'news':'chat',model:runtime().model});const current=runtime();
          assertUserRpm(user);
          try{
            const kinds=data.target==='news'
              ?[{kind:'news',n:1},{kind:'tokens',n:TOKEN_RESERVE_UNITS}]
              :[{kind:'chat',n:1},{kind:'tokens',n:TOKEN_RESERVE_UNITS}];
            await aiLock.withSlot(user.id,()=>withAiGate(store,{kind:data.target==='news'?'news':'chat',model:current.model},()=>withUserQuota(store,user,kinds,async()=>{
              const onUsage=(usage,searches,meta)=>{
                store.tokens('chat',usage,searches);
                store.recordUserUsage({
                  userId:user.id,
                  kind:data.target==='news'?(meta?.kind||'research'):'chat',
                  usage,
                  model:current.model,
                });
              };
              if(data.target==='chat'){
                const result=await askOpenAI([{role:'user',content:'Respondé una frase confirmando que podemos explorar una idea. No generes cartera.'}],null,{
                  ...current,instructionsOverride:current.instructionsOverride,
                  userId:user.id,usageKind:'chat',
                });
                onUsage(result.usage,0,{userId:user.id,kind:'chat',model:current.model});
                return result;
              }
              const result=await response({tools:[{type:'web_search',search_context_size:'low'}],tool_choice:'required',max_tool_calls:1,include:['web_search_call.action.sources'],input:'Buscá la página oficial de relaciones con inversores de Microsoft y citá su URL. Una sola frase.'},{...current,onUsage,userId:user.id,usageKind:'research'});
              assert(extractSources(result).length,'La búsqueda no devolvió fuentes.',502);
              return result;
            })));
            store.setSetting('openaiStatus',{...(store.setting('openaiStatus')||{}),[data.target]:{ok:true,at:new Date().toISOString()}});
            return json(res,200,{ok:true,target:data.target});
          }catch(error){
            if(error.code!=='ai_paused')store.setSetting('openaiStatus',{...(store.setting('openaiStatus')||{}),[data.target]:{ok:false,at:new Date().toISOString()}});
            throw error;
          }
        }
        if(path==='/api/integrations/iol'&&req.method==='POST'){assert(iolEnabled(),'IOL no está habilitado en esta versión.',404);const data=await body(req);return json(res,200,await iol.connect(data.username,data.password));}
        if(path==='/api/integrations/iol/remove'&&req.method==='POST'){assert(iolEnabled(),'IOL no está habilitado en esta versión.',404);iol.disconnect();return json(res,200,{ok:true});}
        if(path==='/api/brokers/iol/snapshot'&&req.method==='GET'){assert(iolEnabled(),'IOL no está habilitado en esta versión.',404);return json(res,200,await iol.snapshot());}
        if(path==='/api/brokers/iol/quote'&&req.method==='GET'){assert(iolEnabled(),'IOL no está habilitado en esta versión.',404);return json(res,200,await iol.quote(url.searchParams.get('market')||'',url.searchParams.get('symbol')||''));}
        if(path==='/api/quotes/status'&&req.method==='GET')return json(res,200,quotes.status());
        if(path==='/api/quotes/refresh'&&req.method==='POST'){
          assert(superadmin,ROLE_FORBIDDEN,403);
          await quotes.refresh({force:true});quotes.syncAllTakes();return json(res,200,quotes.status());
        }
        if(path==='/api/leaderboard'&&req.method==='GET'){
          return json(res,200,listLeaderboard(store,{page:url.searchParams.get('page'),userId:user.id}),{'Cache-Control':LEADERBOARD_CACHE_CONTROL});
        }
        const boardOne=path.match(/^\/api\/leaderboard\/([A-Za-z0-9]+)$/);
        if(boardOne&&req.method==='GET'){
          const item=getLeaderboardItem(store,boardOne[1],{userId:user.id});
          assert(item,'No encontramos esa tesis pública.',404);
          return json(res,200,item,{'Cache-Control':LEADERBOARD_CACHE_CONTROL});
        }
        if(path==='/api/export'&&req.method==='GET'){
          res.setHeader('Content-Disposition','attachment; filename="laviste-export.json"');
          return json(res,200,{version:4,exportedAt:new Date().toISOString(),takes:scoped.takes(),chats:scoped.chats(),versions:scoped.takes().flatMap(take=>scoped.versions(take.id)),reviews:scoped.reviews(),ops:scoped.takes().flatMap(take=>scoped.opsForTake(take.id)),orders:scoped.takes().flatMap(take=>scoped.ordersForTake(take.id)),autoTrades:scoped.takes().flatMap(take=>scoped.autoTradesForTake(take.id)),autoSignals:scoped.takes().flatMap(take=>scoped.autoSignalsForTake(take.id))});
        }
        if(path==='/api/auto/trades'&&req.method==='GET'){
          assert(autoAllowedForUser(store,user.id,env),'No encontrado.',404);
          const policies=Object.fromEntries((scoped.autoPolicies()||[]).map(p=>[p.takeId,p]));
          return json(res,200,{trades:scoped.autoTrades(),policies});
        }
        const autoUndoPreview=path.match(/^\/api\/auto\/trades\/([\w-]+)\/undo\/preview$/);
        if(autoUndoPreview&&req.method==='GET'){
          assert(autoAllowedForUser(store,user.id,env),'No encontrado.',404);
          return json(res,200,autoRunner.previewUndo(scoped,autoUndoPreview[1]));
        }
        const autoUndo=path.match(/^\/api\/auto\/trades\/([\w-]+)\/undo$/);
        if(autoUndo&&req.method==='POST'){
          assert(autoAllowedForUser(store,user.id,env),'No encontrado.',404);
          const data=await body(req);
          const idem=idempotency(scoped,req,path,data);if(idem.cached)return json(res,200,idem.cached);
          const result=autoRunner.undoTrade(scoped,autoUndo[1],{version:data.version,fingerprint:data.fingerprint});
          idem.save(result);
          return json(res,200,result);
        }
        const autoTake=path.match(/^\/api\/takes\/([\w-]+)\/auto$/);
        if(autoTake){
          assert(autoAllowedForUser(store,user.id,env),'No encontrado.',404);
          const take=scoped.take(autoTake[1]);assert(take,'No encontramos esa tesis.',404);
          if(req.method==='GET'){
            const policy=scoped.autoPolicy(take.id)||{takeId:take.id,userId:user.id,enabled:false,simulated:true,newsTrigger:false,pausedReason:null,armState:{}};
            return json(res,200,{policy,signals:scoped.autoSignalsForTake(take.id).slice(-20)});
          }
          assert(req.method==='PUT','Método no permitido.',405);
          const data=await body(req);
          assert(Number.isInteger(data.version)&&data.version===take.version,'La tesis cambió. Actualizá la vista e intentá de nuevo.',409);
          const idem=idempotency(scoped,req,path,data);if(idem.cached)return json(res,200,idem.cached);
          if(data.enabled){
            assert(typeof data.consentVersion==='string'&&data.consentVersion.trim().length>0,'Confirmá el consentimiento.',400);
            assert(take.phase==='active'&&!take.monitoringPaused,'Activá el seguimiento de la tesis antes de Automático.',409);
          }
          if(data.newsTrigger){
            assert(typeof data.newsConsentVersion==='string'&&data.newsConsentVersion.trim().length>0,'Confirmá el consentimiento de noticias.',400);
          }
          let policy;
          scoped.transaction(()=>{
            const current=scoped.autoPolicy(take.id);
            const enabling=!!data.enabled;
            const resuming=enabling&&!current?.enabled;
            policy=scoped.upsertAutoPolicy({
              takeId:take.id,enabled:enabling,newsTrigger:data.newsTrigger!==undefined?!!data.newsTrigger:!!current?.newsTrigger,
              consentVersion:data.consentVersion||current?.consentVersion||null,
              newsConsentVersion:data.newsConsentVersion||current?.newsConsentVersion||null,
              pausedReason:resuming?null:current?.pausedReason||null,
              enabledAt:enabling?(current?.enabledAt||new Date().toISOString()):current?.enabledAt||null,
              enabledBy:enabling?user.id:current?.enabledBy||null,
              armState:current?.armState||{},
            });
            store.writeAudit({actorUserId:user.id,action:'auto.enabled',target:take.id,meta:{enabled:policy.enabled,newsTrigger:policy.newsTrigger}});
            idem.save({policy});
          });
          return json(res,200,{policy});
        }
        if(path==='/api/takes'&&req.method==='POST'){
          aiRequired();assert(scoped.takes().length<100,'Se admite hasta 100 tesis.');
          const data=await body(req),idem=idempotency(scoped,req,path,data);if(idem.cached)return json(res,200,idem.cached);
          if(data.sourceChatId){
            const chat=scoped.chat(data.sourceChatId);assert(chat?.proposal,'Propuesta inexistente.',404);
            const key='proposal:'+data.sourceChatId+':'+hash(JSON.stringify(chat.proposal)).toString('hex');
            const existing=scoped.setting(key);if(existing)return json(res,200,scoped.take(existing));
            const take=createTake(chat.proposal);scoped.transaction(()=>{scoped.putTake(take);scoped.version(take);scoped.setSetting(key,take.id);chat.takeId=take.id;scoped.putChat(chat);idem.save(take);});return json(res,201,take);
          }
          const take=createTake(data.proposal);scoped.transaction(()=>{scoped.putTake(take);scoped.version(take);idem.save(take);});return json(res,201,take);
        }
        const orderList=path.match(/^\/api\/takes\/([\w-]+)\/orders$/);
        if(orderList){
          const take=scoped.take(orderList[1]);assert(take,'No encontramos esa tesis.',404);
          if(req.method==='GET')return json(res,200,scoped.ordersForTake(take.id));
          assert(req.method==='POST','Método no permitido.',405);
          const data=await body(req);
          assert(Number.isInteger(data.version)&&data.version===take.version,'La tesis cambió. Actualizá la vista e intentá de nuevo.',409);
          const idem=idempotency(scoped,req,path,data);if(idem.cached)return json(res,200,idem.cached);
          let result;
          scoped.transaction(()=>{
            result=createPendingOrder(scoped,take,data,req.headers['idempotency-key']||null);
            idem.save(result);
          });
          return json(res,201,result);
        }
        const orderAct=path.match(/^\/api\/takes\/([\w-]+)\/orders\/([\w-]+)\/(confirm|cancel)$/);
        if(orderAct){
          let take=scoped.take(orderAct[1]);assert(take,'No encontramos esa tesis.',404);
          assert(req.method==='POST','Método no permitido.',405);
          const data=await body(req);
          const action=orderAct[3];
          if(action==='cancel'){
            let result;
            scoped.transaction(()=>{result=cancelPendingOrder(scoped,take,orderAct[2]);});
            return json(res,200,result);
          }
          const idem=idempotency(scoped,req,path,data);if(idem.cached)return json(res,200,idem.cached);
          assert(Number.isInteger(data.version)&&data.version===take.version,'La tesis cambió. Actualizá la vista e intentá de nuevo.',409);
          let result;
          scoped.transaction(()=>{
            take=scoped.take(orderAct[1]);
            result=confirmPendingOrder(scoped,take,orderAct[2],quotesApiFromService(quotes),req.headers['idempotency-key']||null);
            rememberChange(scoped,take);scoped.putTake(take);idem.save({take,order:result.order,ops:result.ops,preview:result.preview});
          });
          return json(res,200,{take,order:result.order,ops:result.ops,preview:result.preview});
        }
        const visMatch=path.match(/^\/api\/takes\/([\w-]+)\/visibility$/);
        if(visMatch){
          let take=scoped.take(visMatch[1]);assert(take,'No encontramos esa tesis.',404);
          assert(req.method==='PUT','Método no permitido.',405);
          const data=await body(req);
          take=scoped.take(visMatch[1]);assert(take,'No encontramos esa tesis.',404);
          assert(typeof data.public==='boolean','Indicá si la tesis es pública.');
          if(!(Number.isInteger(data.version)&&data.version===take.version)){
            throw Object.assign(new Error('La tesis cambió. Actualizá la vista e intentá de nuevo.'),{status:409,code:'version_cambiada'});
          }
          let visibility;
          scoped.transaction(()=>{
            take=scoped.take(visMatch[1]);assert(take,'No encontramos esa tesis.',404);
            if(data.public){
              let alias=scoped.publicAlias();
              if(data.alias!=null){
                alias=validatePublicAlias(data.alias,{email:user.email});
                scoped.setPublicAlias(alias);
              }
              if(!alias)throw Object.assign(new Error('Escribí un alias.'),{status:400,code:'alias_requerido'});
              visibility=scoped.publishTake(take.id);
              rememberChange(scoped,take);
              recomputePublicTakeStats(store,{takeId:take.id});
              store.writeAudit({actorUserId:user.id,action:'take.publish',target:take.id,meta:{publicId:visibility.publicId}});
            }else{
              const wasPublic=!!scoped.takeVisibility(take.id)?.isPublic;
              visibility=scoped.unpublishTake(take.id);
              rememberChange(scoped,take);
              if(wasPublic)store.writeAudit({actorUserId:user.id,action:'take.unpublish',target:take.id,meta:{}});
            }
          });
          const progress=switchProgress(store,take);
          return json(res,200,{take,alias:scoped.publicAlias(),...visibility,...progress});
        }
        const match=path.match(/^\/api\/takes\/([\w-]+)\/(activate|review|scenario|settings|idea|archive|versions|reviews|rebalance|ops|aporte|retiro|correccion|composition)$/);
        if(match){
          let take=scoped.take(match[1]);assert(take,'No encontramos esa tesis.',404);const action=match[2];
          if(req.method==='GET'&&action==='versions')return json(res,200,scoped.versions(take.id));
          if(req.method==='GET'&&action==='reviews')return json(res,200,scoped.reviews(take.id));
          if(req.method==='GET'&&action==='ops')return json(res,200,scoped.opsForTake(take.id));
          assert(req.method==='POST','Método no permitido.',405);const data=await body(req);take=scoped.take(match[1]);assert(take,'Tesis inexistente.',404);
          if(action==='scenario'){
            const clone=structuredClone(take);review(clone,data.scenario);return json(res,200,{...clone,preview:true});
          }
          if(action==='review'){aiRequired();store.assertAiAllowed({kind:'news',model:runtime().model});assertUserRpm(user);const job=scheduler.enqueue(take,true);return json(res,202,job);}
          if(action==='rebalance'){
            const idem=idempotency(scoped,req,path,data);if(idem.cached)return json(res,200,idem.cached);
            assert(take.phase==='active','No podés rebalancear un borrador o una tesis archivada.',409);
            assert(Number.isInteger(data.version)&&data.version===take.version,'La tesis cambió. Actualizá la vista e intentá de nuevo.',409);
            let result;
            const version=take.version;
            scoped.transaction(()=>{
              result=rebalanceToTarget(take);
              recordRebalanceOps(scoped,take,result,quotesApiFromService(quotes),version);
              rememberChange(scoped,take);scoped.putTake(take);idem.save({take,result});
            });
            return json(res,200,{take,result});
          }
          if(action==='aporte'){
            const idem=idempotency(scoped,req,path,data);if(idem.cached)return json(res,200,idem.cached);
            assert(take.phase==='active','Solo podés aportar a una práctica activa.',409);
            assert(Number.isInteger(data.version)&&data.version===take.version,'La tesis cambió. Actualizá la vista e intentá de nuevo.',409);
            let ops;
            scoped.transaction(()=>{
              applyAporte(take,data.amount);
              ops=recordAporteOp(scoped,take,data.amount,req.headers['idempotency-key']||null).ops;
              rememberChange(scoped,take);scoped.putTake(take);idem.save({take,ops});
            });
            return json(res,200,{take,ops});
          }
          if(action==='retiro'){
            const idem=idempotency(scoped,req,path,data);if(idem.cached)return json(res,200,idem.cached);
            assert(take.phase==='active','Solo podés retirar de una práctica activa.',409);
            assert(Number.isInteger(data.version)&&data.version===take.version,'La tesis cambió. Actualizá la vista e intentá de nuevo.',409);
            let ops;
            scoped.transaction(()=>{
              applyRetiro(take,data.amount);
              ops=recordRetiroOp(scoped,take,data.amount,req.headers['idempotency-key']||null).ops;
              rememberChange(scoped,take);scoped.putTake(take);idem.save({take,ops});
            });
            return json(res,200,{take,ops});
          }
          if(action==='composition'){
            const idem=idempotency(scoped,req,path,data);if(idem.cached)return json(res,200,idem.cached);
            assert(take.phase==='draft','Solo podés ajustar a mano un borrador.',409);
            let result;
            scoped.transaction(()=>{
              result=setDraftWeights(take,data.weights);
              rememberChange(scoped,take);scoped.putTake(take);idem.save({take,result});
            });
            return json(res,200,{take,result});
          }
          if(action==='correccion'){
            const idem=idempotency(scoped,req,path,data);if(idem.cached)return json(res,200,idem.cached);
            assert(take.phase==='active','Solo podés corregir una práctica activa.',409);
            assert(Number.isInteger(data.version)&&data.version===take.version,'La tesis cambió. Actualizá la vista e intentá de nuevo.',409);
            assert(typeof data.note==='string'&&data.note.trim().length>=3,'Indicá el motivo de la corrección.');
            let ops;
            scoped.transaction(()=>{
              applyCorrection(take,{cashDelta:data.cashDelta||0,ticker:data.ticker||null,unitsDelta:data.unitsDelta||0});
              ops=recordCorreccionOp(scoped,take,{
                cashDelta:data.cashDelta||0,ticker:data.ticker||null,unitsDelta:data.unitsDelta||0,
                note:data.note.trim(),idempotencyKey:req.headers['idempotency-key']||null,
              }).ops;
              rememberChange(scoped,take);scoped.putTake(take);idem.save({take,ops});
            });
            return json(res,200,{take,ops});
          }
          assert(['activate','archive','settings','idea'].includes(action),'Método no permitido.',405);
          scoped.transaction(()=>{
            if(action==='activate'){
              aiRequired();
              assertMonitoredRoom(store,user,scoped.takes(),{wouldAdd:1});
              prepareHoldingsQuotesForActivation(take, quotes);
              activate(take,data.amount);
              quotes.attachBenchmarkOnActivate(take,chooseBenchmark(take.holdings));
              tryStampRealPricesAtActivation(take, quotes);
              take.nextCheckAt=new Date().toISOString();
              recordActivationOps(scoped,take,quotesApiFromService(quotes));
            }
            if(action==='archive'){
              take.phase='archived';take.nextCheckAt=null;take.monitoringPaused=true;
              const vis=scoped.takeVisibility(take.id);
              scoped.unpublishTake(take.id);
              if(vis?.isPublic)store.writeAudit({actorUserId:user.id,action:'take.unpublish',target:take.id,meta:{reason:'archive'}});
            }
            if(action==='settings'){
              assert(typeof data.monitoringPaused==='boolean','Indicá si el seguimiento está pausado.');
              const prevCap=take.settings.cap,prevDrift=take.settings.drift;
              if(take.monitoringPaused&&data.monitoringPaused===false)assertMonitoredRoom(store,user,scoped.takes(),{wouldAdd:1});
              take.monitoringPaused=data.monitoringPaused;updateSettings(take,data);
              if(!take.monitoringPaused)aiRequired();rememberChange(scoped,take);
              if(prevCap!==take.settings.cap||prevDrift!==take.settings.drift){
                const now=new Date().toISOString();
                take.events.unshift({id:randomUUID(),at:now,type:'rules',title:'Reglas actualizadas',body:`Tope por posición ${take.settings.cap}% · desvío ${take.settings.drift} pp.`,ruleCite:`Regla (La idea): tope ${take.settings.cap}% · desvío ${take.settings.drift} pp`,verdict:'none',verdictText:VERDICT_NO_ACTION});
                take.events=take.events.slice(0,150);
              }
            }
            if(action==='idea'){
              assert(typeof data.thesis==='string'&&data.thesis.trim().length>=20&&data.thesis.length<=5000,'La tesis debe tener entre 20 y 5000 caracteres.');
              assert(typeof data.invalidation==='string'&&data.invalidation.trim().length>=10&&data.invalidation.length<=2000,'Definí qué invalidaría la tesis (10 a 2000 caracteres).');
              take.thesis=data.thesis.trim();take.invalidation=data.invalidation.trim();rememberChange(scoped,take);
            }
            scoped.putTake(take);
          });return json(res,200,take);
        }
        const jobMatch=path.match(/^\/api\/jobs\/([\w-]+)$/);
        if(jobMatch&&req.method==='GET'){const job=scoped.job(jobMatch[1]);assert(job,'Trabajo inexistente.',404);return json(res,200,job);}
        if(path==='/api/chats'&&req.method==='POST'){
          aiRequired();const data=await body(req),idem=idempotency(scoped,req,path,data);if(idem.cached)return json(res,200,idem.cached);
          if(data.takeId)assert(scoped.take(data.takeId),'Tesis inexistente.',404);
          assert(scoped.chats().length<200,'Se admite hasta 200 conversaciones.');
          const chat={id:randomUUID(),title:'Nueva conversación',takeId:data.takeId||null,messages:[],proposal:null,createdAt:new Date().toISOString()};
          scoped.transaction(()=>{scoped.putChat(chat);idem.save(chat);});return json(res,201,chat);
        }
        const chatMatch=path.match(/^\/api\/chats\/([\w-]+)\/messages$/);
        if(chatMatch&&req.method==='POST'){
          aiRequired();store.assertAiAllowed({kind:'chat',model:runtime().model});const data=await body(req),idem=idempotency(scoped,req,path,data);if(idem.cached)return json(res,200,idem.cached);
          const chat=scoped.chat(chatMatch[1]);assert(chat,'Conversación inexistente.',404);
          assert(typeof data.message==='string'&&data.message.trim().length>0&&data.message.length<=CHAT_MESSAGE_MAX,'El mensaje debe tener entre 1 y 4000 caracteres.');
          if(chat.messages.length>=CHAT_SIZE_CAP)throw chatSizeError();
          const current=runtime(),day=new Date().toISOString().slice(0,10);
          assertUserRpm(user);
          const saved=await aiLock.withSlot(user.id,async()=>{
            const message={role:'user',content:data.message.trim(),at:new Date().toISOString()};
            const take=chat.takeId?scoped.take(chat.takeId):null;
            const context=take?{title:take.title,thesis:take.thesis,invalidation:take.invalidation,phase:take.phase,attention:take.attention,holdings:take.holdings,value:value(take),cash:take.cash,reviews:scoped.reviews(take.id).filter(item=>item.applied).slice(0,2)}:{openingContext:chat.messages.slice(0,8),lastProposal:chat.proposal};
            const assistantTurns=chat.messages.filter(m=>m.role==='assistant').length;
            const mustPropose=assistantTurns>=2&&!chat.proposal;
            const adjusting=typeof data.adjusting==='boolean'?data.adjusting:false;
            const result=await withAiGate(store,{kind:'chat',model:current.model},()=>withUserQuota(store,user,[{kind:'chat',n:1},{kind:'tokens',n:TOKEN_RESERVE_UNITS}],async()=>{
              const out=await askOpenAI([...chat.messages,message],context,{
                ...current,assistantTurns,mustPropose,adjusting,instructionsOverride:current.instructionsOverride,
                userId:user.id,usageKind:'chat',
                onUsage:(usage)=>store.recordUserUsage({userId:user.id,kind:'chat',usage,model:current.model}),
              });
              scoped.tokens('chat',out.usage,0,day);
              return out;
            }));
            chat.messages.push(message,{role:'assistant',content:result.message,at:new Date().toISOString()});
            if(chat.messages.length===2)chat.title=message.content.slice(0,65);
            if(result.proposal&&(!take||take.phase==='draft'))chat.proposal=result.proposal;
            scoped.transaction(()=>{
              scoped.putChat(chat);
              if(result.proposal&&take?.phase==='draft'){
                applyDraftProposal(take,result.proposal);
                rememberChange(scoped,take);
              }
              idem.save(chat);
            });
            return chat;
          });
          return json(res,200,saved);
        }
        return json(res,404,{error:'Ruta no encontrada.'});
      }
      const appHtml=path==='/app'||path==='/app/';
      assert(['GET','HEAD'].includes(req.method)||(appHtml&&req.method==='POST'),'Método no permitido.',405);
      if(req.method==='POST'){
        const declared=Number(req.headers['content-length']);
        if(Number.isFinite(declared)&&declared>APP_HTML_POST_MAX){
          res.writeHead(413,{'Content-Type':'text/plain; charset=utf-8','Connection':'close'});
          res.end();
          req.destroy();
          return;
        }
        const drained=await drainCapped(req,APP_HTML_POST_MAX);
        if(!drained.ok){
          res.writeHead(413,{'Content-Type':'text/plain; charset=utf-8','Connection':'close'});
          res.end();
          req.destroy();
          return;
        }
      }
      const panelHome=publicHomeRedirectLocation(path,!!currentSession(req));
      if(panelHome){
        res.writeHead(302,{'Location':panelHome,'Cache-Control':'private, no-cache','Vary':'Cookie'});
        res.end();
        return;
      }
      const logoMatch=path.match(/^\/logos\/([A-Za-z0-9.]{1,8})\.svg$/);
      if(logoMatch){
        const svg=tickerLogoSvg(logoMatch[1]);
        res.writeHead(200,{'Content-Type':'image/svg+xml; charset=utf-8','Cache-Control':'public, max-age=86400'});
        res.end(req.method==='HEAD'?undefined:svg);
        return;
      }
      const {path:assetPath,versioned,prefixed}=parseAssetRequest(path,revision);
      const file=STATIC_ASSETS[assetPath];assert(file,'Archivo no encontrado.',404);
      const ext=extname(file);
      if(prefixed&&(!versioned||ext==='.html')){
        const staleTo=staleRevisionLocation({prefixed,versioned,ext,revision,assetPath});
        if(staleTo){
          res.writeHead(302,{'Location':staleTo,'Cache-Control':'no-store'});
          res.end();
          return;
        }
        assert(false,'Archivo no encontrado.',404);
      }
      const appHtmlAsset=assetPath==='/app'||assetPath==='/app/';
      const cachedFile=appHtmlAsset&&hasSessionCookieHeader(req.headers.cookie)&&files.has(SESSION_HTML_FILE)?SESSION_HTML_FILE:file;
      const cached=files.get(cachedFile);
      const rep=staticRepresentation(cached,req);
      const headers={'Content-Type':STATIC_TYPES[ext],'Cache-Control':staticCacheControl({html:ext==='.html',home:assetPath==='/',privateHtml:appHtmlAsset,versioned,font:ext==='.woff2'||ext==='.ttf',allowImmutable:isDeployRevision(revision)}),ETag:rep.etag};
      if(cached.lastModified)headers['Last-Modified']=cached.lastModified;
      if(rep.gzip)headers['Content-Encoding']='gzip';
      const vary=[];
      if(assetPath==='/'||appHtmlAsset)vary.push('Cookie');
      if(cached.gzip)vary.push('Accept-Encoding');
      if(vary.length)headers.Vary=vary.join(', ');
      if(appHtmlAsset)headers['Referrer-Policy']='no-referrer';
      if(notModified(req,{etag:rep.etag,mtimeMs:cached.mtimeMs})){res.writeHead(304,headers);res.end();return;}
      res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:rep.body);
    }catch(error){
      if(!error.status)console.error(JSON.stringify({event:'request_failed',type:error.name,path:req.url?.split('?')[0]}));
      if(!res.headersSent){
        const headers={};
        if(error.retryAfter!=null)headers['Retry-After']=String(error.retryAfter);
        const body={error:error.status?error.message:error.name==='TimeoutError'?'El proveedor tardó demasiado. Reintentá.':'No se pudo completar la solicitud.'};
        if(error.status&&error.code)body.code=error.code;
        if(error.status&&error.resetAt)body.resetAt=error.resetAt;
        json(res,error.status||500,body,headers);
      }else res.end();
    }
  });
  const cleanup=setInterval(()=>{
    auth.purgeExpired();
    rpm.purge();
    for(const [key,until] of adminSessions)if(until<Date.now())adminSessions.delete(key);
  },60000);cleanup.unref();
  return {server,store,config,vault,scheduler,quotes,auto:autoRunner,dailyMarks,auth,google,aiLock,feedDigestCache,close:async()=>{clearInterval(cleanup);quotes.stopScheduler();dailyMarks.stop();autoRunner?.close();const drained=new Promise(resolve=>server.close(resolve));await scheduler.close();await drained;store.close();}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=createApp();app.server.listen(app.config.port,app.config.host,()=>console.log(`La Viste lista · puerto ${app.config.port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
}
