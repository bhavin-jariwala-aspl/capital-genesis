'use strict';
const { spawnSync } = require('child_process');

// Validate PORT is a safe integer to prevent injection via env var (CWE-78)
const rawPort = process.env.PORT;
const PORT = (rawPort && /^\d{1,5}$/.test(rawPort.trim()))
  ? parseInt(rawPort, 10)
  : 3001;
if (PORT < 1 || PORT > 65535) throw new Error(`[predev] Invalid PORT value: ${rawPort}`);

// Use spawnSync (no shell=true) to avoid shell-injection entirely
// lsof -ti tcp:<PORT> lists PIDs; pipe into xargs kill -9
const lsof = spawnSync('lsof', ['-ti', `tcp:${PORT}`], { encoding: 'utf8' });
if (lsof.stdout) {
  const pids = lsof.stdout.trim().split('\n').filter(Boolean);
  for (const rawPid of pids) {
    // Validate PID is a positive integer before passing to kill (CWE-78)
    const pid = parseInt(rawPid, 10);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    spawnSync('kill', ['-9', String(pid)]);
  }
  if (pids.length) console.log(`[predev] Cleared stale process(es) on port ${PORT}`);
}
