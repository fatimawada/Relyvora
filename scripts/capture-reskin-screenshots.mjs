import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/osina/.gemini/antigravity/brain/292d2269-1c70-4aab-bd1a-f9757cdc3476';
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP_PORT = 3005;

function launchBrowser(port) {
  const userDataDir = path.join(ARTIFACT_DIR, 'scratch', `profile-reskin-${port}`);
  fs.mkdirSync(userDataDir, { recursive: true });
  return spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--enable-webgl',
    '--use-angle=d3d11',
    '--hide-scrollbars',
  ]);
}

async function getWsUrl(port) {
  for (let attempt = 0; attempt < 25; attempt++) {
    try {
      const raw = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/json`, (res) => {
          let d = '';
          res.on('data', (c) => (d += c));
          res.on('end', () => resolve(d));
        }).on('error', reject);
      });
      const targets = JSON.parse(raw);
      const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        return pageTarget.webSocketDebuggerUrl;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Could not connect to Chrome on port ${port}`);
}

function cdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 1;
  const pending = new Map();
  const handlers = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method && handlers.has(msg.method)) {
      handlers.get(msg.method)(msg.params);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const reqId = id++;
      pending.set(reqId, { resolve, reject });
      ws.send(JSON.stringify({ id: reqId, method, params }));
    });

  const open = new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  return { ws, send, open };
}

async function capture() {
  console.log('=== Starting Next.js Production Server on port ' + APP_PORT + ' ===');
  const server = spawn('npx', ['next', 'start', '-p', String(APP_PORT)], {
    shell: true,
    stdio: 'pipe',
  });

  server.stdout.on('data', (d) => console.log('[server]', d.toString().trim()));
  server.stderr.on('data', (d) => console.error('[server:err]', d.toString().trim()));

  // Wait for server to become ready
  let serverReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${APP_PORT}/disputes`, (res) => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(`Status ${res.statusCode}`));
        }).on('error', reject);
      });
      serverReady = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  if (!serverReady) {
    server.kill();
    throw new Error('Next.js server failed to start within timeout');
  }
  console.log('Next.js server is ready.');

  const chromePort = 9339;
  const chrome = launchBrowser(chromePort);

  try {
    const wsUrl = await getWsUrl(chromePort);
    const client = cdpClient(wsUrl);
    await client.open;

    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Runtime.enable');

    const targets = [
      { route: '/disputes', name: 'reskin_disputes' },
      { route: '/terms', name: 'reskin_terms' },
      { route: '/privacy', name: 'reskin_privacy' },
      { route: '/ng', name: 'reskin_ng' },
      { route: '/vendor', name: 'reskin_vendor' },
      { route: '/foundation', name: 'reskin_foundation' },
    ];

    const viewports = [
      { width: 1366, height: 768, isMobile: false, label: '1366' },
      { width: 390, height: 844, isMobile: true, label: '390' },
    ];

    for (const vp of viewports) {
      await client.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.isMobile,
      });

      for (const t of targets) {
        for (const theme of ['light', 'dark']) {
          const url = `http://localhost:${APP_PORT}${t.route}`;
          await client.send('Page.navigate', { url });
          await new Promise((r) => setTimeout(r, 900));

          await client.send('Runtime.evaluate', {
            expression: `
              document.documentElement.classList.toggle('dark', ${theme === 'dark'});
              localStorage.setItem('theme', '${theme}');
            `,
          });
          await new Promise((r) => setTimeout(r, 400));

          const ss = await client.send('Page.captureScreenshot', { format: 'png' });
          const filename = `${t.name}_${vp.label}_${theme}.png`;
          const filePath = path.join(ARTIFACT_DIR, filename);
          fs.writeFileSync(filePath, Buffer.from(ss.data, 'base64'));
          console.log(`✓ Captured ${filename} (${vp.label}px ${theme})`);
        }
      }
    }

    if (client.ws) client.ws.close();
  } finally {
    chrome.kill();
    server.kill();
  }
}

capture().catch((err) => {
  console.error('Capture error:', err);
  process.exit(1);
});
