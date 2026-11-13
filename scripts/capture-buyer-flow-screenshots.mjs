import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/osina/.gemini/antigravity/brain/292d2269-1c70-4aab-bd1a-f9757cdc3476';
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP_PORT = 3006;

function launchBrowser(port) {
  const userDataDir = path.join(ARTIFACT_DIR, 'scratch', `profile-flow-${port}`);
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
  const server = spawn('npx', ['next', 'start', '-p', String(APP_PORT)], {
    shell: true,
    stdio: 'ignore',
  });

  // Wait for server ready
  for (let i = 0; i < 30; i++) {
    try {
      await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${APP_PORT}/vendor`, (res) => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(`Status ${res.statusCode}`));
        }).on('error', reject);
      });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  const chromePort = 9340;
  const chrome = launchBrowser(chromePort);

  try {
    const wsUrl = await getWsUrl(chromePort);
    const client = cdpClient(wsUrl);
    await client.open;

    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Runtime.enable');

    // Seed mock transaction in localStorage
    await client.send('Page.navigate', { url: `http://localhost:${APP_PORT}/` });
    await new Promise((r) => setTimeout(r, 800));

    const mockTx = {
      id: 'demo-reskin-tx-001',
      created_at: new Date().toISOString(),
      vendor_handle: '@LagosHairPlug',
      buyer_phone: '08012345678',
      item_name: 'Bone Straight Human Hair 30" (Grade 12A)',
      item_price: 45000,
      protection_fee: 1350,
      total_amount: 46350,
      status: 'AWAITING_PAYMENT',
      buyer_notes: 'Doorstep inspection before delivery code handover',
    };

    const mockPaidTx = {
      id: 'demo-reskin-tx-002',
      created_at: new Date().toISOString(),
      vendor_handle: '@LagosHairPlug',
      buyer_phone: '08012345678',
      item_name: 'Bone Straight Human Hair 30" (Grade 12A)',
      item_price: 45000,
      protection_fee: 1350,
      total_amount: 46350,
      status: 'FUNDS_LOCKED',
      release_code: '849201',
      buyer_notes: 'Doorstep inspection before delivery code handover',
    };

    await client.send('Runtime.evaluate', {
      expression: `
        localStorage.setItem('relyvora_transactions_cache', JSON.stringify([${JSON.stringify(mockTx)}, ${JSON.stringify(mockPaidTx)}]));
        localStorage.setItem('relyvora_buyer_escrow_demo-reskin-tx-002', JSON.stringify({
          transactionId: 'demo-reskin-tx-002',
          releaseCode: '849201'
        }));
      `,
    });

    const flows = [
      { route: '/pay/demo-reskin-tx-001', name: 'reskin_pay' },
      { route: '/order/demo-reskin-tx-002?code=849201', name: 'reskin_order' },
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

      for (const f of flows) {
        for (const theme of ['light', 'dark']) {
          await client.send('Page.navigate', { url: `http://localhost:${APP_PORT}${f.route}` });
          await new Promise((r) => setTimeout(r, 900));

          await client.send('Runtime.evaluate', {
            expression: `
              document.documentElement.classList.toggle('dark', ${theme === 'dark'});
            `,
          });
          await new Promise((r) => setTimeout(r, 400));

          const ss = await client.send('Page.captureScreenshot', { format: 'png' });
          const filename = `${f.name}_${vp.label}_${theme}.png`;
          const filePath = path.join(ARTIFACT_DIR, filename);
          fs.writeFileSync(filePath, Buffer.from(ss.data, 'base64'));
          console.log(`✓ Captured ${filename}`);
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
  console.error('Flow capture error:', err);
  process.exit(1);
});
