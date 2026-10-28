'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { sleep } = require('./cdp');

const samePath = (a, b) =>
  process.platform === 'win32' ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);

function findMain(exe) {
  if (process.platform === 'win32') {
    const script =
      "Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.CommandLine -notmatch '--type=' } | " +
      "ForEach-Object { \"$($_.ProcessId)`t$($_.ExecutablePath)\" }";
    let text = '';
    try {
      text = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 20000,
      });
    } catch {
      return [];
    }
    return text
      .split(/\r?\n/)
      .map((line) => line.split('\t'))
      .filter(([pid, file]) => pid && file && samePath(file, exe))
      .map(([pid]) => Number(pid));
  }
  let text = '';
  try {
    text = execFileSync('ps', ['-axo', 'pid=,args='], { encoding: 'utf8' });
  } catch {
    return [];
  }
  return text
    .split('\n')
    .map((line) => /^\s*(\d+)\s+(.*)$/.exec(line))
    .filter((m) => m && m[2].startsWith(exe) && !m[2].includes('--type='))
    .map((m) => Number(m[1]));
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function stop(pids, graceMs = 8000) {
  for (const pid of pids) {
    try {
      if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(pid), '/T'], { stdio: 'ignore' });
      else process.kill(pid, 'SIGTERM');
    } catch {
    }
  }
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline && pids.some(alive)) await sleep(250);
  for (const pid of pids.filter(alive)) {
    try {
      if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      else process.kill(pid, 'SIGKILL');
    } catch {
    }
  }
}

module.exports = { findMain, stop };
