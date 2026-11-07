'use client';

import { useEffect, useRef } from 'react';
import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  TorusGeometry,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type HeroTheme = 'light' | 'dark';

export interface EscrowObjects3DProps {
  /** Current escrow step: 0 order, 1 money held, 2 confirm, 3 released */
  step: number;
  /** Render one still frame with a fixed pose (used to produce the WebP posters) */
  posterMode?: boolean;
  /** Override the document theme (poster capture) */
  forcedTheme?: HeroTheme;
  onReady?: () => void;
  onError?: (reason: string) => void;
}

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

const PALETTE = {
  light: {
    body: '#0A1B3D',
    screen: '#16305E',
    accent: '#0FA36B',
    accentDeep: '#0B6E55',
    seal: '#F4F6F9',
    logo1: '#0A1B3D',
    logo2: '#0B6E55',
    logo3: '#0FA36B',
    pipOff: '#2A4170',
    pipOn: '#5BE3AB',
    phoneBody: '#0A1B3D',
    phoneRim: '#CAD5E8',
    phoneScreen: '#0A1833',
    phoneScreenEmissive: '#06132B',
    phoneNotch: '#040C1A',
    phoneButton: '#0FA36B',
    phonePipOff: '#1A3358',
    phonePipOn: '#5BE3AB',
    shadowOpacity: 0.14,
  },
  dark: {
    body: '#E8EDF5',
    screen: '#FFFFFF',
    accent: '#22B07F',
    accentDeep: '#16946A',
    seal: '#0E2147',
    logo1: '#FFFFFF',
    logo2: '#22B07F',
    logo3: '#5BE3AB',
    pipOff: '#B4C2DA',
    pipOn: '#22B07F',
    phoneBody: '#071229',
    phoneRim: '#647D9E',
    phoneScreen: '#040A17',
    phoneScreenEmissive: '#092434',
    phoneNotch: '#02050B',
    phoneButton: '#22B07F',
    phonePipOff: '#0C202E',
    phonePipOn: '#5BE3AB',
    shadowOpacity: 0.32,
  },
} as const;

type Palette = (typeof PALETTE)[HeroTheme];

/* ------------------------------------------------------------------ */
/* Motion constants                                                    */
/* ------------------------------------------------------------------ */

const SPIN_SPEED = 0.12; // rad/s
const MAX_TILT = 0.35; // rad
const OUT_DURATION = 0.35; // s
const IN_DURATION = 0.45; // s  (total ~0.8s)
const BASE_ROT_X = 0.16;
const BASE_ROT_Y = -0.55;

const easeInCubic = (t: number) => t * t * t;
const easeOutBack = (t: number) => {
  const s = 1.25; // small overshoot
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
};
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function readDocumentTheme(): HeroTheme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function makeShadowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(canvas);
}

export default function EscrowObjects3D({ step, posterMode = false, forcedTheme, onReady, onError }: EscrowObjects3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stepRef = useRef(step);
  const requestStepRef = useRef<(next: number) => void>(() => {});
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  // Forward step changes into the render loop
  useEffect(() => {
    stepRef.current = step;
    requestStepRef.current(step);
  }, [step]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'low-power',
        preserveDrawingBuffer: posterMode,
      });
    } catch (err) {
      onErrorRef.current?.(`WebGL renderer could not be created: ${(err as Error).message}`);
      return;
    }

    renderer.setPixelRatio(posterMode ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(renderer.domElement);

    const geometries: BufferGeometry[] = [];
    const materials: Material[] = [];
    const g = <T extends BufferGeometry>(geo: T) => {
      geometries.push(geo);
      return geo;
    };

    /* ---------------- Scene, camera, lights ---------------- */
    const scene = new Scene();
    const pmrem = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const envTexture = pmrem.fromScene(room, 0.04).texture;
    scene.environment = envTexture;
    scene.environmentIntensity = 0.45;

    const camera = new PerspectiveCamera(26, 1, 0.1, 100);
    camera.position.set(0, 1.3, 10);
    camera.lookAt(0, -0.05, 0);

    const key = new DirectionalLight(0xffffff, 1.6);
    key.position.set(3.5, 5, 4.5);
    scene.add(key);
    scene.add(new HemisphereLight(0xffffff, 0x8899aa, 0.35));

    /* ---------------- Materials ---------------- */
    const physical = (roughness: number) => {
      const m = new MeshPhysicalMaterial({ roughness, metalness: 0.08, clearcoat: 0.3, clearcoatRoughness: 0.45 });
      materials.push(m);
      return m;
    };
    const mat = {
      body: physical(0.42),
      screen: physical(0.35),
      accent: physical(0.38),
      accentDeep: physical(0.4),
      seal: physical(0.45),
      logo1: physical(0.45),
      logo2: physical(0.45),
      logo3: physical(0.45),
    };

    // Dedicated phone materials (glass-and-metal body, thin bezel, subtle rim highlight, emissive screen)
    const phoneBodyMat = new MeshPhysicalMaterial({ roughness: 0.22, metalness: 0.85, clearcoat: 0.9, clearcoatRoughness: 0.18 });
    const phoneRimMat = new MeshPhysicalMaterial({ roughness: 0.16, metalness: 0.94, clearcoat: 1.0, clearcoatRoughness: 0.12 });
    const phoneScreenMat = new MeshPhysicalMaterial({ roughness: 0.12, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.08 });
    const phoneNotchMat = new MeshPhysicalMaterial({ roughness: 0.3, metalness: 0.3 });
    const phoneButtonMat = new MeshPhysicalMaterial({ roughness: 0.28, metalness: 0.2, clearcoat: 0.4 });
    materials.push(phoneBodyMat, phoneRimMat, phoneScreenMat, phoneNotchMat, phoneButtonMat);

    const pipMaterials = Array.from({ length: 6 }, () => {
      const m = new MeshPhysicalMaterial({ roughness: 0.15, metalness: 0.1, clearcoat: 0.8 });
      materials.push(m);
      return m;
    });

    /* ---------------- Contact shadow ---------------- */
    const shadowTexture = makeShadowTexture();
    const shadowMaterial = new MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: 0.3 });
    materials.push(shadowMaterial);
    const shadow = new Mesh(g(new PlaneGeometry(4.2, 2.6)), shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.3;
    scene.add(shadow);

    /* ---------------- Objects ---------------- */
    const root = new Group();
    scene.add(root);

    const mesh = (geo: BufferGeometry, m: Material, setup?: (o: Mesh) => void) => {
      const o = new Mesh(geo, m);
      setup?.(o);
      return o;
    };

    // Embossed Relyvora symbol, built from primitives, sized to fit a small seal
    const buildSymbol = () => {
      const sym = new Group();
      const block = g(new RoundedBoxGeometry(0.085, 0.08, 0.03, 1, 0.01));
      [0.1, 0, -0.1].forEach((y) => sym.add(mesh(block, mat.logo1, (o) => o.position.set(-0.075, y, 0))));
      const bowl = mesh(g(new TorusGeometry(0.058, 0.024, 6, 16, Math.PI)), mat.logo2, (o) => {
        o.rotation.z = -Math.PI / 2;
        o.position.set(0.012, 0.075, 0);
      });
      const stem = mesh(g(new RoundedBoxGeometry(0.03, 0.15, 0.03, 1, 0.008)), mat.logo2, (o) => o.position.set(0.0, 0.06, 0));
      const leg = mesh(g(new RoundedBoxGeometry(0.035, 0.14, 0.03, 1, 0.008)), mat.logo3, (o) => {
        o.rotation.z = 0.5;
        o.position.set(0.045, -0.075, 0);
      });
      sym.add(bowl, stem, leg);
      return sym;
    };

    // 1. Order: sealed parcel, slim emerald strap, round seal with symbol
    const parcel = new Group();
    parcel.add(mesh(g(new RoundedBoxGeometry(2.2, 1.5, 1.6, 3, 0.12)), mat.body));
    parcel.add(mesh(g(new RoundedBoxGeometry(0.34, 1.54, 1.64, 2, 0.03)), mat.accent));
    const seal = new Group();
    seal.add(mesh(g(new CylinderGeometry(0.3, 0.3, 0.06, 40)), mat.seal, (o) => (o.rotation.x = Math.PI / 2)));
    const symbol = buildSymbol();
    symbol.position.z = 0.04;
    seal.add(symbol);
    seal.position.set(0, 0.05, 0.85);
    parcel.add(seal);

    // 2. Money held: rounded cube with a six-segment dial ring on the front face
    const held = new Group();
    held.add(mesh(g(new RoundedBoxGeometry(1.7, 1.7, 1.7, 3, 0.18)), mat.body));
    const dial = new Group();
    const segmentArc = (Math.PI / 3) * 0.76;
    const segmentGeo = g(new TorusGeometry(0.52, 0.06, 8, 10, segmentArc));
    for (let i = 0; i < 6; i++) {
      dial.add(mesh(segmentGeo, mat.accent, (o) => (o.rotation.z = i * (Math.PI / 3))));
    }
    dial.add(mesh(g(new CylinderGeometry(0.16, 0.16, 0.08, 32)), mat.accentDeep, (o) => (o.rotation.x = Math.PI / 2)));
    dial.position.z = 0.86;
    held.add(dial);

    // 3. Confirm: thin rounded phone slab with dark navy body, subtle rim highlight, thin bezel, and six emerald glowing pips
    const phone = new Group();
    // Subtle rim highlight (outer chamfer frame catching the light)
    phone.add(mesh(g(new RoundedBoxGeometry(1.27, 2.42, 0.15, 3, 0.08)), phoneRimMat));
    // Dark navy glass-and-metal body
    phone.add(mesh(g(new RoundedBoxGeometry(1.25, 2.40, 0.154, 3, 0.075)), phoneBodyMat));
    // Thin bezel OLED screen (1.18 x 2.32 => 0.035 bezel around screen)
    phone.add(mesh(g(new RoundedBoxGeometry(1.18, 2.32, 0.02, 2, 0.045)), phoneScreenMat, (o) => (o.position.z = 0.078)));
    // Top speaker notch
    phone.add(mesh(g(new RoundedBoxGeometry(0.32, 0.045, 0.015, 1, 0.01)), phoneNotchMat, (o) => o.position.set(0, 1.02, 0.089)));
    // Six pips glowing in emerald
    const pipGeo = g(new CylinderGeometry(0.065, 0.065, 0.025, 24));
    pipMaterials.forEach((m, i) => {
      phone.add(mesh(pipGeo, m, (o) => {
        o.rotation.x = Math.PI / 2;
        o.position.set(-0.4 + i * 0.16, 0.02, 0.09);
      }));
    });
    // Bottom confirm pill button
    phone.add(mesh(g(new RoundedBoxGeometry(0.72, 0.16, 0.02, 2, 0.02)), phoneButtonMat, (o) => o.position.set(0, -0.74, 0.089)));
    phone.position.y = 0.05;
    phone.scale.setScalar(0.92);

    // 4. Released: parcel with lid lifted and a coin floating up
    const released = new Group();
    const openBody = new Group();
    openBody.add(mesh(g(new RoundedBoxGeometry(2.2, 1.15, 1.6, 3, 0.1)), mat.body));
    openBody.add(mesh(g(new RoundedBoxGeometry(0.34, 1.19, 1.64, 2, 0.03)), mat.accent));
    openBody.position.y = -0.45;
    const lid = mesh(g(new RoundedBoxGeometry(2.3, 0.2, 1.7, 2, 0.06)), mat.body);
    const lidPivot = new Group();
    lidPivot.position.set(0, 0.28, -0.82);
    lid.position.set(0, 0, 0.85);
    lidPivot.add(lid);
    lidPivot.rotation.x = -0.85;
    const coin = mesh(g(new CylinderGeometry(0.38, 0.38, 0.09, 40)), mat.accent, (o) => (o.rotation.x = Math.PI / 2));
    const coinGroup = new Group();
    coinGroup.add(coin);
    coinGroup.position.set(0, 0.52, 0.38);
    released.add(openBody, lidPivot, coinGroup);

    const objects: Object3D[] = [parcel, held, phone, released];
    objects.forEach((o, i) => {
      o.visible = i === stepRef.current;
      root.add(o);
    });

    /* ---------------- Theme ---------------- */
    const applyPalette = (p: Palette) => {
      mat.body.color.set(p.body);
      mat.screen.color.set(p.screen);
      mat.accent.color.set(p.accent);
      mat.accentDeep.color.set(p.accentDeep);
      mat.seal.color.set(p.seal);
      mat.logo1.color.set(p.logo1);
      mat.logo2.color.set(p.logo2);
      mat.logo3.color.set(p.logo3);
      phoneBodyMat.color.set(p.phoneBody);
      phoneRimMat.color.set(p.phoneRim);
      phoneScreenMat.color.set(p.phoneScreen);
      phoneScreenMat.emissive.set(p.phoneScreenEmissive);
      phoneScreenMat.emissiveIntensity = 0.35;
      phoneNotchMat.color.set(p.phoneNotch);
      phoneButtonMat.color.set(p.phoneButton);
      pipOff.set(p.phonePipOff);
      pipOn.set(p.phonePipOn);
      pipMaterials.forEach((m) => {
        m.color.set(p.phonePipOff);
        m.emissive.set(p.phonePipOn);
        m.emissiveIntensity = 0.1;
      });
      shadowMaterial.opacity = p.shadowOpacity;
    };
    const pipOff = new Color();
    const pipOn = new Color();
    applyPalette(PALETTE[forcedTheme ?? readDocumentTheme()]);

    /* ---------------- Sizing ---------------- */
    const resize = () => {
      const w = posterMode ? 560 : container.clientWidth;
      const h = posterMode ? 560 : container.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();

    /* ---------------- Poster mode: single still frame ---------------- */
    if (posterMode) {
      root.rotation.set(BASE_ROT_X, BASE_ROT_Y, 0);
      if (stepRef.current === 2) {
        pipMaterials.forEach((m, i) => {
          m.color.copy(i < 4 ? pipOn : pipOff);
          m.emissiveIntensity = i < 4 ? 0.6 : 0;
        });
      } else {
        pipMaterials.forEach((m) => (m.emissiveIntensity = 0));
      }
      renderer.render(scene, camera);
      (window as unknown as { __heroPosterReady?: boolean }).__heroPosterReady = true;
      onReadyRef.current?.();
      return () => {
        geometries.forEach((x) => x.dispose());
        materials.forEach((x) => x.dispose());
        shadowTexture.dispose();
        envTexture.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    }

    /* ---------------- Transitions ---------------- */
    let current = stepRef.current;
    let target = current;
    let phase: 'idle' | 'out' | 'in' = 'idle';
    let phaseTime = 0;

    requestStepRef.current = (next: number) => {
      target = next;
      if (phase === 'idle' && target !== current) {
        phase = 'out';
        phaseTime = 0;
      }
    };

    const updateTransition = (dt: number) => {
      if (phase === 'idle') return;
      phaseTime += dt;
      if (phase === 'out') {
        const t = clamp(phaseTime / OUT_DURATION, 0, 1);
        const obj = objects[current];
        obj.rotation.y = easeInCubic(t) * (Math.PI / 2);
        obj.scale.setScalar(Math.max(0.001, 1 - easeInCubic(t)));
        if (t >= 1) {
          obj.visible = false;
          obj.rotation.y = 0;
          obj.scale.setScalar(1);
          current = target;
          const nextObj = objects[current];
          nextObj.visible = true;
          nextObj.scale.setScalar(0.001);
          phase = 'in';
          phaseTime = 0;
        }
      } else if (phase === 'in') {
        const t = clamp(phaseTime / IN_DURATION, 0, 1);
        objects[current].scale.setScalar(Math.max(0.001, easeOutBack(t)));
        if (t >= 1) {
          objects[current].scale.setScalar(1);
          phase = 'idle';
          if (target !== current) {
            phase = 'out';
            phaseTime = 0;
          }
        }
      }
    };

    /* ---------------- Pointer tilt ---------------- */
    let tiltX = 0;
    let tiltY = 0;
    let targetTiltX = 0;
    let targetTiltY = 0;
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const nx = clamp((e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2 || 1), -1, 1);
      const ny = clamp((e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2 || 1), -1, 1);
      targetTiltY = nx * MAX_TILT;
      targetTiltX = ny * MAX_TILT * 0.6;
    };
    const onPointerLeave = () => {
      targetTiltX = 0;
      targetTiltY = 0;
    };
    if (finePointer) {
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      document.addEventListener('pointerleave', onPointerLeave);
    }

    /* ---------------- Render loop (paused offscreen / hidden tab) ---------------- */
    let raf = 0;
    let running = false;
    let last = 0;
    let spin = 0;
    let elapsed = 0;

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      elapsed += dt;

      spin += SPIN_SPEED * dt;
      tiltX += (targetTiltX - tiltX) * Math.min(1, dt * 4);
      tiltY += (targetTiltY - tiltY) * Math.min(1, dt * 4);
      root.rotation.x = BASE_ROT_X + clamp(tiltX, -MAX_TILT, MAX_TILT);
      root.rotation.y = BASE_ROT_Y + spin + clamp(tiltY, -MAX_TILT, MAX_TILT);
      root.position.y = Math.sin(elapsed * 0.9) * 0.04;

      updateTransition(dt);

      // Per-object idle details
      dial.rotation.z -= 0.25 * dt;
      const isStillCapture = posterMode && stepRef.current === 2;
      const pipPhase = (elapsed * 2.2) % 9; // 6 pips light up in sequence, short hold, reset
      const lit = isStillCapture ? 6 : Math.min(6, Math.floor(pipPhase));
      pipMaterials.forEach((m, i) => {
        const on = i < lit;
        m.color.copy(on ? pipOn : pipOff);
        m.emissive.copy(pipOn);
        m.emissiveIntensity = on ? 1.6 : 0.1;
      });
      coinGroup.position.y = 0.52 + Math.sin(elapsed * 1.6) * 0.08;
      coin.rotation.z += 1.1 * dt;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    let inView = true;
    const syncRunning = () => (inView && !document.hidden ? start() : stop());
    const io = new IntersectionObserver((entries) => {
      inView = entries[0]?.isIntersecting ?? true;
      syncRunning();
    });
    io.observe(container);
    document.addEventListener('visibilitychange', syncRunning);

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const mo = forcedTheme
      ? null
      : new MutationObserver(() => applyPalette(PALETTE[readDocumentTheme()]));
    mo?.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const onContextLost = (e: Event) => {
      e.preventDefault();
      stop();
      onErrorRef.current?.('WebGL context lost');
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    renderer.render(scene, camera);
    syncRunning();
    onReadyRef.current?.();

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      mo?.disconnect();
      document.removeEventListener('visibilitychange', syncRunning);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      requestStepRef.current = () => {};
      geometries.forEach((x) => x.dispose());
      materials.forEach((x) => x.dispose());
      shadowTexture.dispose();
      envTexture.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [posterMode, forcedTheme]);

  return <div ref={containerRef} data-hero-canvas className="absolute inset-0" />;
}
