'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Environment } from '@react-three/drei';
import * as THREE from 'three';

interface SceneProps {
  scrollProgress: number; // 0 to 1
}

// -------------------------------------------------------------
// 1. LIQUID PLATINUM MATERIAL (High Metalness, Low Roughness, Clearcoat)
// -------------------------------------------------------------
function LiquidPlatinumMaterial({ color = '#E4E4E7', roughness = 0.1, metalness = 0.9 }) {
  return (
    <meshPhysicalMaterial
      color={color}
      metalness={metalness}
      roughness={roughness}
      clearcoat={1.0}
      clearcoatRoughness={0.1}
      reflectivity={0.9}
      envMapIntensity={1.3}
    />
  );
}

// -------------------------------------------------------------
// 2. INNER VAULT GLOW PARTICLES (Section 2)
// -------------------------------------------------------------
function VaultParticles({ count = 120, opacity = 1 }) {
  const pointsRef = useRef<THREE.Points>(null);

  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const colorEmerald = new THREE.Color('#10B981');
    const colorPlat = new THREE.Color('#E4E4E7');

    for (let i = 0; i < count; i++) {
      // spherical cluster inside vault
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = Math.cbrt(Math.random()) * 0.9;
      const sinPhi = Math.sin(phi);

      pos[i * 3] = r * sinPhi * Math.cos(theta);
      pos[i * 3 + 1] = r * sinPhi * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);

      const mixed = Math.random() > 0.4 ? colorEmerald : colorPlat;
      col[i * 3] = mixed.r;
      col[i * 3 + 1] = mixed.g;
      col[i * 3 + 2] = mixed.b;
    }
    return [pos, col];
  }, [count]);

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.4;
      pointsRef.current.rotation.x += delta * 0.2;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.06}
        vertexColors
        transparent
        opacity={opacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// -------------------------------------------------------------
// 3. UPWARD PAYOUT STREAK (Section 4)
// -------------------------------------------------------------
function PayoutLightBeam({ active = false, opacity = 0 }) {
  const beamRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (beamRef.current) {
      beamRef.current.rotation.y += delta * 1.5;
    }
  });

  if (!active || opacity <= 0.01) return null;

  return (
    <group position={[0, 3, 0]}>
      {/* Intense vertical laser beam */}
      <mesh ref={beamRef}>
        <cylinderGeometry args={[0.08, 0.28, 14, 16, 1, true]} />
        <meshBasicMaterial
          color="#34D399"
          transparent
          opacity={opacity * 0.85}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Core pure white beam */}
      <mesh>
        <cylinderGeometry args={[0.02, 0.06, 14, 8, 1, true]} />
        <meshBasicMaterial
          color="#FFFFFF"
          transparent
          opacity={opacity * 0.95}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// -------------------------------------------------------------
// 4. MAIN INTERACTIVE GEOMETRIC RIG (All 4 Escrow Stages)
// -------------------------------------------------------------
function EscrowJourneyMesh({ scrollProgress }: { scrollProgress: number }) {
  const rootGroupRef = useRef<THREE.Group>(null);
  const loop1Ref = useRef<THREE.Mesh>(null);
  const loop2Ref = useRef<THREE.Mesh>(null);
  const vaultBodyRef = useRef<THREE.Group>(null);
  const parcelRef = useRef<THREE.Group>(null);
  const keypadRef = useRef<THREE.Group>(null);
  const shatterGroupRef = useRef<THREE.Group>(null);

  // Pre-generate shatter fragments for Section 4
  const shatterFragments = useMemo(() => {
    return Array.from({ length: 32 }, (_, i) => {
      const angle = (i / 32) * Math.PI * 2;
      const radius = 1.2 + Math.random() * 2.5;
      return {
        targetX: Math.cos(angle) * radius,
        targetY: (Math.random() - 0.5) * 4,
        targetZ: Math.sin(angle) * radius,
        scale: 0.08 + Math.random() * 0.12,
        rotSpeed: (Math.random() - 0.5) * 4,
      };
    });
  }, []);

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();
    const p = THREE.MathUtils.clamp(scrollProgress, 0, 1);

    // Root Group: gentle idle breath
    if (rootGroupRef.current) {
      rootGroupRef.current.position.y = Math.sin(time * 0.8) * 0.08;
    }

    // -----------------------------------------------------------
    // STAGE 1: DUAL-LOCK LOOP (p: 0 -> 0.3)
    // -----------------------------------------------------------
    // Stage 1 dominates at p < 0.25; transitions to vault at p 0.25 -> 0.45
    const stage1Weight = 1 - THREE.MathUtils.smoothstep(p, 0.15, 0.35);

    if (loop1Ref.current && loop2Ref.current) {
      // Loop 1 idle spin & scroll transform
      loop1Ref.current.rotation.x = time * 0.25 + p * Math.PI * 1.5;
      loop1Ref.current.rotation.y = time * 0.35 + p * Math.PI;

      // Loop 2 interlinked at angle
      loop2Ref.current.rotation.x = time * -0.2 + p * Math.PI * 1.2;
      loop2Ref.current.rotation.z = Math.PI / 3 + time * 0.15 + p * Math.PI * 0.8;

      // When locking (p -> 0.3), loops draw closer together
      const loopGap = THREE.MathUtils.lerp(0.55, 0.05, THREE.MathUtils.smoothstep(p, 0.1, 0.3));
      loop1Ref.current.position.x = -loopGap;
      loop2Ref.current.position.x = loopGap;

      // Scale down / fade out as vault appears
      const loopScale = THREE.MathUtils.lerp(1.1, 0.01, THREE.MathUtils.smoothstep(p, 0.22, 0.38));
      loop1Ref.current.scale.setScalar(loopScale);
      loop2Ref.current.scale.setScalar(loopScale);
    }

    // -----------------------------------------------------------
    // STAGE 2: THE VAULT (p: 0.25 -> 0.55)
    // -----------------------------------------------------------
    // Vault scales up at p 0.25 -> 0.45, stays solid, then shifts left at p > 0.50
    const vaultIn = THREE.MathUtils.smoothstep(p, 0.22, 0.38);
    const vaultShiftLeft = THREE.MathUtils.smoothstep(p, 0.48, 0.68);
    const vaultShatterOut = THREE.MathUtils.smoothstep(p, 0.72, 0.88);

    if (vaultBodyRef.current) {
      // Position: Centered at section 2, shifts left at section 3
      const targetX = THREE.MathUtils.lerp(0, -2.4, vaultShiftLeft);
      vaultBodyRef.current.position.x = THREE.MathUtils.lerp(vaultBodyRef.current.position.x, targetX, 0.1);

      // Rotation: slow authoritative rotation
      vaultBodyRef.current.rotation.y = time * 0.2 + p * Math.PI * 1.2;

      // Scale: morph in, then shrink/hide when shattering in section 4
      const scale = THREE.MathUtils.lerp(0.001, 1.2, vaultIn) * (1 - vaultShatterOut);
      vaultBodyRef.current.scale.setScalar(scale);
    }

    // -----------------------------------------------------------
    // STAGE 3: THE PARCEL / DELIVERY CONTAINER (p: 0.50 -> 0.78)
    // -----------------------------------------------------------
    const parcelIn = THREE.MathUtils.smoothstep(p, 0.48, 0.65);
    const parcelOut = THREE.MathUtils.smoothstep(p, 0.75, 0.88);

    if (parcelRef.current) {
      // Drops from top on the right
      const targetY = THREE.MathUtils.lerp(3.5, 0, parcelIn);
      parcelRef.current.position.y = targetY;
      parcelRef.current.position.x = 2.2;
      parcelRef.current.position.z = 0;

      // Dynamic rotation
      parcelRef.current.rotation.y = time * 0.4 + p * 2.0;
      parcelRef.current.rotation.x = 0.2 + Math.sin(time) * 0.1;

      // Scale
      const scale = THREE.MathUtils.lerp(0.001, 1.15, parcelIn) * (1 - parcelOut);
      parcelRef.current.scale.setScalar(scale);
    }

    // -----------------------------------------------------------
    // STAGE 4: SHATTER & HOLOGRAPHIC KEYPAD (p: 0.75 -> 1.0)
    // -----------------------------------------------------------
    const keypadIn = THREE.MathUtils.smoothstep(p, 0.72, 0.90);

    if (keypadRef.current) {
      keypadRef.current.position.y = THREE.MathUtils.lerp(-2.0, 0, keypadIn);
      keypadRef.current.rotation.y = Math.sin(time * 0.5) * 0.15;
      const kScale = THREE.MathUtils.lerp(0.001, 1.1, keypadIn);
      keypadRef.current.scale.setScalar(kScale);
    }

    // Shatter particles expansion
    if (shatterGroupRef.current) {
      const shatterStrength = THREE.MathUtils.smoothstep(p, 0.75, 0.95);
      shatterGroupRef.current.children.forEach((child, idx) => {
        const frag = shatterFragments[idx];
        if (frag) {
          child.position.x = frag.targetX * shatterStrength;
          child.position.y = frag.targetY * shatterStrength;
          child.position.z = frag.targetZ * shatterStrength;
          child.rotation.x += delta * frag.rotSpeed;
          child.rotation.y += delta * frag.rotSpeed;
          child.scale.setScalar(frag.scale * (1 - shatterStrength * 0.5));
        }
      });
    }
  });

  const p = THREE.MathUtils.clamp(scrollProgress, 0, 1);
  const showVaultParticles = p >= 0.25 && p <= 0.75;
  const showPayoutBeam = p >= 0.78;
  const beamOpacity = THREE.MathUtils.smoothstep(p, 0.78, 0.95);

  return (
    <group ref={rootGroupRef}>
      {/* ------------------------------------------------- */}
      {/* SECTION 1: DUAL-LOCK LOOP (Interlocking bands) */}
      {/* ------------------------------------------------- */}
      <group>
        <mesh ref={loop1Ref} castShadow receiveShadow>
          <torusGeometry args={[1.45, 0.26, 32, 64]} />
          <LiquidPlatinumMaterial />
        </mesh>

        <mesh ref={loop2Ref} castShadow receiveShadow>
          <torusGeometry args={[1.45, 0.26, 32, 64]} />
          <LiquidPlatinumMaterial />
        </mesh>
      </group>

      {/* ------------------------------------------------- */}
      {/* SECTION 2: THE VAULT / HEAVY KEYHOLE GEOMETRY */}
      {/* ------------------------------------------------- */}
      <group ref={vaultBodyRef}>
        {/* Outer Heavy Bezel Ring */}
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[1.4, 1.4, 0.35, 48]} />
          <LiquidPlatinumMaterial />
        </mesh>

        {/* Inner Chamfered Dial */}
        <mesh position={[0, 0, 0.12]} castShadow receiveShadow>
          <cylinderGeometry args={[1.1, 1.1, 0.3, 32]} />
          <LiquidPlatinumMaterial color="#D4D4D8" roughness={0.15} />
        </mesh>

        {/* Central Keyhole Core */}
        <mesh position={[0, 0, 0.28]} castShadow>
          <torusGeometry args={[0.55, 0.14, 24, 48]} />
          <LiquidPlatinumMaterial color="#FAFAFA" metalness={0.95} roughness={0.05} />
        </mesh>

        {/* Radiant Emerald Particle Heart inside Vault */}
        {showVaultParticles && <VaultParticles count={90} opacity={0.85} />}
      </group>

      {/* ------------------------------------------------- */}
      {/* SECTION 3: THE PARCEL (Low-Poly Unfolding Box) */}
      {/* ------------------------------------------------- */}
      <group ref={parcelRef}>
        {/* Base Container */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[1.3, 1.1, 1.3]} />
          <LiquidPlatinumMaterial color="#E4E4E7" roughness={0.18} />
        </mesh>

        {/* Top Flap 1 (Angled open) */}
        <mesh position={[-0.45, 0.7, 0]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.65, 0.08, 1.3]} />
          <LiquidPlatinumMaterial color="#D4D4D8" />
        </mesh>

        {/* Top Flap 2 (Angled open) */}
        <mesh position={[0.45, 0.7, 0]} rotation={[0, 0, -Math.PI / 4]}>
          <boxGeometry args={[0.65, 0.08, 1.3]} />
          <LiquidPlatinumMaterial color="#D4D4D8" />
        </mesh>

        {/* Inner Protected Glowing Cube */}
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[0.6, 0.6, 0.6]} />
          <meshBasicMaterial color="#10B981" transparent opacity={0.7} />
        </mesh>
      </group>

      {/* ------------------------------------------------- */}
      {/* SECTION 4: SHATTERED PARTICLES & HOLOGRAPHIC KEYPAD */}
      {/* ------------------------------------------------- */}
      <group ref={shatterGroupRef}>
        {shatterFragments.map((_, i) => (
          <mesh key={i}>
            <octahedronGeometry args={[0.15, 0]} />
            <LiquidPlatinumMaterial color="#FAFAFA" />
          </mesh>
        ))}
      </group>

      {/* Holographic 6-Digit Keypad Plane */}
      <group ref={keypadRef} position={[0, 0, 0.5]}>
        <Float speed={2} rotationIntensity={0.2} floatIntensity={0.3}>
          {/* Glass Card Backplate */}
          <mesh>
            <planeGeometry args={[2.8, 1.7]} />
            <meshPhysicalMaterial
              color="#090E1A"
              transparent
              opacity={0.88}
              roughness={0.1}
              metalness={0.1}
              clearcoat={1.0}
            />
          </mesh>

          {/* Platinum Border Ring */}
          <lineSegments>
            <edgesGeometry args={[new THREE.PlaneGeometry(2.8, 1.7)]} />
            <lineBasicMaterial color="#10B981" linewidth={2} />
          </lineSegments>

          {/* Holographic Keypad Dots / Nodes */}
          {[-0.8, 0, 0.8].map((x, colIdx) =>
            [-0.3, 0.3].map((y, rowIdx) => (
              <mesh key={`${colIdx}-${rowIdx}`} position={[x, y, 0.02]}>
                <circleGeometry args={[0.12, 24]} />
                <meshBasicMaterial color="#34D399" />
              </mesh>
            ))
          )}
        </Float>
      </group>

      {/* Payout Upward Radiant Light Beam */}
      <PayoutLightBeam active={showPayoutBeam} opacity={beamOpacity} />
    </group>
  );
}

// -------------------------------------------------------------
// 5. ROOT SCENE COMPONENT (Lights, Camera, Canvas Rig)
// -------------------------------------------------------------
export default function Scene({ scrollProgress }: SceneProps) {
  return (
    <div className="fixed inset-0 w-full h-full pointer-events-none z-0">
      <Canvas
        camera={{ position: [0, 0, 5.2], fov: 45, near: 0.1, far: 100 }}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          alpha: true,
        }}
        dpr={[1, 2]} // Crisp on high-DPI, optimized on standard
      >
        {/* Studio-Style Directional Lighting */}
        <ambientLight intensity={0.4} />

        {/* Key Light: Crisp cool directional light */}
        <directionalLight position={[5, 8, 5]} intensity={2.6} color="#FFFFFF" />

        {/* Fill Light: Subtle emerald tint for trust accent reflections */}
        <directionalLight position={[-6, 3, -2]} intensity={1.2} color="#A7F3D0" />

        {/* Rim Light: High-contrast backlight for sharp silhouette */}
        <directionalLight position={[0, -5, -6]} intensity={1.8} color="#E4E4E7" />

        {/* Central Escrow Rig */}
        <EscrowJourneyMesh scrollProgress={scrollProgress} />

        {/* Subtle procedural studio environment for crisp liquid platinum speculars */}
        <Environment preset="studio" />
      </Canvas>
    </div>
  );
}
