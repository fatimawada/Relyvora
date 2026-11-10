import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/osina/.gemini/antigravity/brain/292d2269-1c70-4aab-bd1a-f9757cdc3476';
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function launchBrowser(port) {
  const userDataDir = path.join(ARTIFACT_DIR, 'scratch', `profile-foundation-${port}`);
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

  const on = (method, handler) => handlers.set(method, handler);
  const open = new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  return { ws, send, on, open };
}

async function waitForServer(port = 3000) {
  for (let i = 0; i < 30; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/foundation`, (res) => {
          if (res.statusCode < 500) resolve();
          else reject(new Error(`Status ${res.statusCode}`));
        });
        req.on('error', reject);
        req.setTimeout(1000, () => req.destroy());
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Server on port ${port} did not start in time.`);
}

async function run() {
  console.log('=== Starting Next.js Production Server on Port 3000 ===');
  const serverProc = spawn('npx', ['next', 'start', '-p', '3000'], { shell: true, stdio: 'inherit' });

  try {
    await waitForServer(3000);
    console.log('Server is ready. Launching headless Chrome...');

    const port = 9339;
    const chromeProc = launchBrowser(port);

    try {
      const wsUrl = await getWsUrl(port);
      const client = cdpClient(wsUrl);
      await client.open;

      await client.send('Page.enable');
      await client.send('DOM.enable');
      await client.send('Runtime.enable');

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

        for (const theme of ['light', 'dark']) {
          await client.send('Page.navigate', { url: 'http://localhost:3000/foundation' });
          await new Promise((r) => setTimeout(r, 1200));

          await client.send('Runtime.evaluate', {
            expression: `document.documentElement.classList.toggle('dark', ${theme === 'dark'});`,
          });
          await new Promise((r) => setTimeout(r, 400));

          const ss = await client.send('Page.captureScreenshot', { format: 'png' });
          const filename = `foundation_${vp.label}_${theme}.png`;
          const filePath = path.join(ARTIFACT_DIR, filename);
          fs.writeFileSync(filePath, Buffer.from(ss.data, 'base64'));
          console.log(`✓ Captured ${filename} (${vp.width}x${vp.height}, theme: ${theme})`);
        }
      }

      if (client.ws) client.ws.close();
    } finally {
      chromeProc.kill();
    }
  } finally {
    serverProc.kill();
  }
}

run().catch((err) => {
  console.error('Screenshot Capture Error:', err);
  process.exit(1);
});
