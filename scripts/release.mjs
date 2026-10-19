import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {accessSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {isAbsolute, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const log = (event, details = {}) => console.log(JSON.stringify({event, ...details}));
const run = (command, args, options = {}) => execFileSync(command, args, {
  stdio: 'inherit', timeout: 900000, ...options,
});
const output = (command, args, options = {}) => execFileSync(command, args, {
  encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024, ...options,
}).trim();

const MIN_SWAP_FREE_KB = 64 * 1024;
const MIN_MEM_AVAILABLE_KB = 512 * 1024;

export function assertRevision(revision, head) {
  assert.match(revision, /^[a-f0-9]{40}$/, 'A complete commit SHA is required.');
  assert.equal(revision, head, 'Only the checked-out commit may be released.');
}

export function parseMeminfoKb(text) {
  const value = key => {
    const match = text.match(new RegExp('^' + key + ':\\s+(\\d+)\\s+kB$', 'm'));
    return match ? Number(match[1]) : null;
  };
  return {memAvailableKb: value('MemAvailable'), swapFreeKb: value('SwapFree') ?? 0};
}

export function assertHostCanBuild({memAvailableKb, swapFreeKb}) {
  const swap = Number(swapFreeKb) || 0;
  const mem = memAvailableKb == null ? 0 : Number(memAvailableKb);
  if (swap < MIN_SWAP_FREE_KB && mem < MIN_MEM_AVAILABLE_KB) {
    throw new Error(
      'Host cannot docker build: SwapFree ' + swap + ' kB is below 64Mi and MemAvailable ' +
      (memAvailableKb == null ? 'missing' : mem + ' kB') +
      ' is below 512Mi. Free RAM or swap on the Pi, then retry.',
    );
  }
}

export function unusedLavisteTags(listedTags, keepTags) {
  const keep = new Set(keepTags);
  return listedTags.filter(tag => tag && !tag.endsWith(':<none>') && !keep.has(tag));
}

export function liveLavisteTagsFromInspect(containers, imagesById = {}) {
  const tags = new Set();
  for (const container of containers) {
    const named = container?.Config?.Image;
    if (typeof named === 'string' && named.startsWith('laviste:')) tags.add(named);
    for (const tag of imagesById[container?.Image]?.RepoTags || []) {
      if (typeof tag === 'string' && tag.startsWith('laviste:')) tags.add(tag);
    }
  }
  return [...tags];
}

function inspectJson(name) {
  try {
    return JSON.parse(output('docker', ['inspect', name]));
  } catch {
    return [];
  }
}

function currentLiveLavisteTags() {
  const containers = ['laviste-app-1', 'laviste-backup-1'].flatMap(inspectJson);
  const imagesById = {};
  for (const container of containers) {
    if (!container.Image || imagesById[container.Image]) continue;
    const [image] = inspectJson(container.Image);
    if (image) imagesById[container.Image] = image;
  }
  return liveLavisteTagsFromInspect(containers, imagesById);
}

function listLavisteTags() {
  const text = output('docker', ['images', '--filter', 'reference=laviste', '--format', '{{.Repository}}:{{.Tag}}']);
  return text ? text.split('\n').filter(Boolean) : [];
}

function reclaimDockerSpace(image) {
  const keep = new Set(currentLiveLavisteTags());
  keep.add(image);
  log('docker_reclaim_started', {keep: [...keep]});
  const dockerEnv = {...process.env, DOCKER_BUILDKIT: '1'};
  run('docker', ['builder', 'prune', '-f'], {env: dockerEnv});
  run('docker', ['image', 'prune', '-f'], {env: dockerEnv});
  for (const tag of unusedLavisteTags(listLavisteTags(), keep)) {
    try {
      run('docker', ['image', 'rm', tag], {env: dockerEnv});
      log('unused_image_removed', {tag});
    } catch {
      log('unused_image_remove_failed', {tag});
    }
  }
  log('docker_reclaim_finished', {keep: [...keep]});
}

function assertPiCanBuild() {
  assertHostCanBuild(parseMeminfoKb(readFileSync('/proc/meminfo', 'utf8')));
}

// A failed release remains failed even when recovery succeeds.
export async function promote({apply, verify, restore, record}) {
  try {
    await apply();
    await verify();
    await record();
  } catch (failure) {
    try {
      await restore();
    } catch (recoveryFailure) {
      throw new AggregateError([failure, recoveryFailure], 'Release and rollback both failed.');
    }
    throw failure;
  }
}

async function health(base, revision, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(base + '/api/health', {signal: AbortSignal.timeout(4000), cache:'no-store'});
      const data = await response.json();
      if (response.ok && data.ok && data.service === 'laviste' && (!revision || data.revision === revision)) return data;
    } catch {}
    await sleep(2000);
  }
  throw new Error('Health verification failed for ' + base);
}

async function assertMain(revision) {
  if (!process.env.GH_TOKEN) throw new Error('GitHub token required to check the main branch.');
  const response = await fetch('https://api.github.com/repos/diegodella1/laviste/git/ref/heads/main', {
    headers: {Authorization: 'Bearer ' + process.env.GH_TOKEN, Accept:'application/vnd.github+json'},
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, 'Unable to verify main.');
  return (await response.json()).object.sha === revision;
}

async function stage(image, revision) {
  const name = 'laviste-candidate-' + revision.slice(0, 12);
  const password = randomBytes(24).toString('hex');
  try { run('docker', ['rm', '--force', name], {stdio:'ignore'}); } catch {}
  try {
    // No production mounts, credentials, or database enter this container.
    run('docker', ['run', '--detach', '--name', name, '--read-only', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges:true', '--tmpfs', '/tmp',
      '--tmpfs', '/app/data:uid=1000,gid=1000,mode=0700',
      '--publish', '127.0.0.1::3080', '--env', 'APP_PASSWORD', '--env', 'RELEASE_SHA', image],
    {env:{...process.env, APP_PASSWORD:password, RELEASE_SHA:revision}});
    const binding = JSON.parse(output('docker', ['inspect', name]))[0].NetworkSettings.Ports['3080/tcp'][0];
    const base = 'http://127.0.0.1:' + binding.HostPort;
    await health(base, revision);
    for (const path of ['/', '/app', '/terminal.css', '/icons.js', '/como-funciona', '/acerca']) {
      assert.equal((await fetch(base + path)).status, 200, 'Candidate asset: ' + path);
    }
    assert.equal((await fetch(base + '/api/state')).status, 401);
    const login = await fetch(base + '/api/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:'diego@diegodella.ar', password}),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const state = await (await fetch(base + '/api/state', {headers:{Cookie:cookie}})).json();
    assert.equal(state.config.aiConfigured, false);
    assert.equal(state.config.iolConfigured, false);
    assert.equal(state.takes.length, 0);
    log('candidate_verified', {revision});
  } finally {
    try { run('docker', ['rm', '--force', name], {stdio:'ignore'}); } catch { log('candidate_cleanup_failed', {name}); }
  }
}

export async function release() {
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main', 'Production only accepts main.');
  assert.ok(['push', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME), 'Invalid deployment event.');
  const revision = process.env.GITHUB_SHA || '';
  assertRevision(revision, output('git', ['rev-parse', 'HEAD']));
  if (!await assertMain(revision)) return log('superseded', {revision});

  const root = process.env.LAVISTE_RUNTIME_DIR || '/home/diego/Documents/laviste';
  assert.ok(isAbsolute(root));
  for (const file of ['app-password', 'master.key']) accessSync(join(root, 'secrets', file));
  const stateDir = join(root, 'work', 'deploy');
  const releaseDir = join(root, 'work', 'releases', revision);
  mkdirSync(stateDir, {recursive:true, mode:0o700});
  mkdirSync(releaseDir, {recursive:true, mode:0o700});
  const archive = execFileSync('git', ['archive', revision], {maxBuffer:64*1024*1024});
  run('tar', ['-x', '-C', releaseDir], {input:archive, stdio:['pipe', 'inherit', 'inherit']});
  const image = 'laviste:' + revision;
  reclaimDockerSpace(image);
  assertPiCanBuild();
  run('docker', ['build', '--label', 'org.opencontainers.image.revision=' + revision, '-t', image, releaseDir],
    {env:{...process.env, DOCKER_BUILDKIT:'1'}});
  await stage(image, revision);
  if (!await assertMain(revision)) return log('superseded_after_staging', {revision});

  const containers = JSON.parse(output('docker', ['inspect', 'laviste-app-1', 'laviste-backup-1']));
  const previousFiles = containers[0].Config.Labels['com.docker.compose.project.config_files'].split(',');
  const previousArgs = previousFiles.flatMap(file => ['--file', file]);
  const previous = JSON.parse(output('docker', ['compose', ...previousArgs, 'config', '--format', 'json']));
  for (const container of containers) {
    const service = container.Config.Labels['com.docker.compose.service'];
    previous.services[service].image = container.Image;
    delete previous.services[service].build;
  }
  const previousHealth = await health('http://127.0.0.1:3474');
  const previousRevision = previousHealth.revision;
  const stamp = Date.now();
  const previousConfig = join(stateDir, `before-${stamp}.json`);
  writeFileSync(previousConfig, JSON.stringify(previous, null, 2), {mode:0o600});
  run('docker', ['compose', '--file', previousConfig, 'exec', '-T', 'app', 'node', 'scripts/backup.mjs']);

  const env = {...process.env, LAVISTE_RUNTIME_DIR:root, RELEASE_TAG:revision, RELEASE_SHA:revision,
    APP_ORIGIN:'https://laviste.diegodella.ar', HOST_PORT:'3474'};
  const candidate = JSON.parse(output('docker', ['compose', '--file', join(releaseDir, 'compose.yaml'), 'config', '--format', 'json'], {env}));
  for (const service of Object.values(candidate.services)) delete service.build;
  const config = join(stateDir, `release-${revision}.json`);
  writeFileSync(config, JSON.stringify(candidate, null, 2), {mode:0o600});
  const apply = file => run('docker', ['compose', '--file', file, 'up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180']);
  // A final branch check happens immediately before touching live containers.
  if (!await assertMain(revision)) return log('superseded_before_promotion', {revision});
  await promote({
    apply: () => apply(config),
    verify: async () => {
      await health('http://127.0.0.1:3474', revision);
      await health('https://laviste.diegodella.ar', revision);
      run(process.execPath, [join(releaseDir, 'scripts', 'smoke.mjs')], {
        cwd:root, env:{...env, EXPECT_RELEASE:revision, APP_PASSWORD_FILE:join(root, 'secrets', 'app-password')},
      });
    },
    restore: async () => {
      log('rollback_started', {revision});
      apply(previousConfig);
      await health('http://127.0.0.1:3474', previousRevision);
      await health('https://laviste.diegodella.ar', previousRevision);
      log('rollback_verified', {revision:previousRevision || 'legacy'});
    },
    record: () => {
      const currentFile = join(stateDir, 'current.json');
      const saved = {revision, image, config, previousConfig, at:new Date().toISOString()};
      writeFileSync(currentFile + '.tmp', JSON.stringify(saved, null, 2), {mode:0o600});
      renameSync(currentFile + '.tmp', currentFile);
      log('release_verified', saved);
    },
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await release();
}
