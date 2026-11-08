import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/osina/.gemini/antigravity/brain/292d2269-1c70-4aab-bd1a-f9757cdc3476';
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function launchBrowser(port) {
  const userDataDir = path.join(ARTIFACT_DIR, 'scratch', `profile-pr-${port}`);
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

async function run() {
  console.log('=== Capturing 1366px Verification Screenshots ===');
  const port = 9338;
  const proc = launchBrowser(port);

  let client = null;
  try {
    const wsUrl = await getWsUrl(port);
    client = cdpClient(wsUrl);
    await client.open;

    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Runtime.enable');

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // 1. Inject test order into localStorage
    await client.send('Page.navigate', { url: 'http://localhost:3000' });
    await new Promise((r) => setTimeout(r, 1000));

    const testTx = {
      id: 'demo-tx-001',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      vendor_handle: 'glam_by_kemi',
      vendor_name: 'Glam By Kemi Wigs',
      buyer_phone: '08012345678',
      buyer_name: 'Amina Bello',
      buyer_delivery_address: '14 Admiralty Way, Lekki Phase 1, Lagos',
      item_name: 'Human hair wig (30")',
      item_price: 45000,
      protection_fee: 1350,
      total_amount: 46350,
      status: 'paid_in_escrow',
      release_code: '829410',
      timeline: [
        { status: 'created', timestamp: new Date(Date.now() - 3600000).toISOString(), note: 'Order created' },
        { status: 'paid_in_escrow', timestamp: new Date().toISOString(), note: 'Payment confirmed in Anchor escrow' }
      ]
    };

    await client.send('Runtime.evaluate', {
      expression: `localStorage.setItem('relyvora_transactions_cache', JSON.stringify([${JSON.stringify(testTx)}]));`,
    });

    const routes = [
      { route: '/', name: 'pr_home_1366' },
      { route: '/pricing', name: 'pr_pricing_1366' },
      { route: '/disputes', name: 'pr_disputes_1366' },
      { route: '/order/demo-tx-001', name: 'pr_order_1366' },
    ];

    for (const r of routes) {
      for (const theme of ['light', 'dark']) {
        await client.send('Page.navigate', { url: `http://localhost:3000${r.route}` });
        await new Promise((res) => setTimeout(res, 800));

        await client.send('Runtime.evaluate', {
          expression: `document.documentElement.classList.toggle('dark', ${theme === 'dark'});`,
        });
        await new Promise((res) => setTimeout(res, 300));

        const ss = await client.send('Page.captureScreenshot', { format: 'png' });
        const filename = `${r.name}_${theme}.png`;
        const filePath = path.join(ARTIFACT_DIR, filename);
        fs.writeFileSync(filePath, Buffer.from(ss.data, 'base64'));
        console.log(`✓ Captured ${filename}`);
      }
    }

    if (client && client.ws) {
      client.ws.close();
    }
  } finally {
    proc.kill();
  }
}

run().catch((err) => {
  console.error('Screenshot Capture Error:', err);
  process.exit(1);
});
