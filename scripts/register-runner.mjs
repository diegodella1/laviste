import {execFileSync} from 'node:child_process';
import {existsSync, copyFileSync, chmodSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const directory = resolve('work/actions-runner');
if (existsSync(resolve(directory, '.runner'))) {
  console.log('Runner already registered.');
} else {
  // Keep the short-lived registration token out of shell arguments and logs.
  const {token} = JSON.parse(execFileSync('gh', ['api', '--method', 'POST',
    'repos/diegodella1/laviste/actions/runners/registration-token'], {encoding:'utf8'}));
  execFileSync('./config.sh', ['--unattended', '--url', 'https://github.com/diegodella1/laviste',
    '--name', 'laviste-production', '--labels', 'laviste-production', '--work', '_work'], {
    cwd:directory, stdio:'inherit', timeout:180000,
    env:{...process.env, ACTIONS_RUNNER_INPUT_TOKEN:token},
  });
}

copyFileSync(resolve(directory, 'bin/runsvc.sh'), resolve(directory, 'runsvc.sh'));
chmodSync(resolve(directory, 'runsvc.sh'), 0o755);
writeFileSync(resolve(directory, '.service'), 'laviste-runner.service\n');
