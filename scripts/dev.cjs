// Electron requires ELECTRON_RUN_AS_NODE to be unset so it runs as a full
// Electron process (not plain Node.js). Claude Code's terminal sets it to "1",
// so we explicitly delete it before spawning electron-vite.
delete process.env.ELECTRON_RUN_AS_NODE

const { spawn } = require('child_process')

const ps = spawn('electron-vite', ['dev'], {
  stdio: 'inherit',
  env: process.env,
  shell: true
})

ps.on('close', (code) => process.exit(code ?? 0))
