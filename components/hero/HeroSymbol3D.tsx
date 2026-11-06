'use client';

import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface HeroSymbol3DProps {
  isDark?: boolean;
}

function ExtrudedSymbol({ isDark }: { isDark: boolean }) {
  const rootGroupRef = useRef<THREE.Group>(null);
  const blocksGroupRef = useRef<THREE.Group>(null);
  const ribbonGroupRef = useRef<THREE.Group>(null);

  const pointerTarget = useRef({ x: 0, y: 0 });
  const entranceProgress = useRef(0);

  // Colors based on theme tokens
  const colors = useMemo(() => {
    return isDark
      ? {
          logo1: '#FFFFFF',
          logo2: '#22B07F',
          logo3: '#5BE3AB',
        }
      : {
          logo1: '#0A1B3D',
          logo2: '#0B6E55',
          logo3: '#0FA36B',
        };
  }, [isDark]);

  // Standard Extrusion Settings
  const extrudeSettingsBlocks = useMemo(
    () => ({
      depth: 16,
      bevelEnabled: true,
      bevelThickness: 1.2,
      bevelSize: 1.0,
      bevelSegments: 3,
    }),
    []
  );

  const extrudeSettingsLeg = useMemo(
    () => ({
      depth: 9,
      bevelEnabled: true,
      bevelThickness: 1.2,
      bevelSize: 1.0,
      bevelSegments: 3,
    }),
    []
  );

  const extrudeSettingsBowl = useMemo(
    () => ({
      depth: 12,
      bevelEnabled: true,
      bevelThickness: 1.2,
      bevelSize: 1.0,
      bevelSegments: 3,
    }),
    []
  );

  // 1. Shapes for Three Blocks (Centered at 65, 57, Inverted Y)
  const [shapeBlock1, shapeBlock2, shapeBlock3] = useMemo(() => {
    // Block 1: x: 24..52, y: 8..38 -> (-41, 49) to (-13, 19)
    const b1 = new THREE.Shape();
    b1.moveTo(-41, 49);
    b1.lineTo(-13, 49);
    b1.lineTo(-13, 19);
    b1.lineTo(-41, 19);
    b1.closePath();

    // Block 2: x: 24..52, y: 42..72 -> (-41, 15) to (-13, -15)
    const b2 = new THREE.Shape();
    b2.moveTo(-41, 15);
    b2.lineTo(-13, 15);
    b2.lineTo(-13, -15);
    b2.lineTo(-41, -15);
    b2.closePath();

    // Block 3: x: 24..52, y: 76..106 -> (-41, -19) to (-13, -49)
    const b3 = new THREE.Shape();
    b3.moveTo(-41, -19);
    b3.lineTo(-13, -19);
    b3.lineTo(-13, -49);
    b3.lineTo(-41, -49);
    b3.closePath();

    return [b1, b2, b3];
  }, []);

  // 2. Shape for Leg: Polygon (58,56) (80,56) (106,106) (84,106)
  const shapeLeg = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(58 - 65, 57 - 56); // (-7, 1)
    s.lineTo(80 - 65, 57 - 56); // (15, 1)
    s.lineTo(106 - 65, 57 - 106); // (41, -49)
    s.lineTo(84 - 65, 57 - 106); // (19, -49)
    s.closePath();
    return s;
  }, []);

  // 3. Shape for Bowl: M58 8 L76 8 C93 8 105 20 105 35 C105 50 93 63 76 63 L66 63 C61 63 58 60 58 56 L58 45 L76 45 C83 45 87 41 87 35 C87 29 83 26 76 26 L58 26 Z
  const shapeBowl = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-7, 49);
    s.lineTo(11, 49);
    s.bezierCurveTo(28, 49, 40, 37, 40, 22);
    s.bezierCurveTo(40, 7, 28, -6, 11, -6);
    s.lineTo(1, -6);
    s.bezierCurveTo(-4, -6, -7, -3, -7, 1);
    s.lineTo(-7, 12);
    s.lineTo(11, 12);
    s.bezierCurveTo(18, 12, 22, 16, 22, 22);
    s.bezierCurveTo(22, 28, 18, 31, 11, 31);
    s.lineTo(-7, 31);
    s.closePath();
    return s;
  }, []);

  // Track Pointer for Gentle Tilt (limited to ~0.35 rad)
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      pointerTarget.current = {
        x: THREE.MathUtils.clamp(x * 0.35, -0.35, 0.35),
        y: THREE.MathUtils.clamp(y * 0.35, -0.35, 0.35),
      };
    };

    window.addEventListener('pointermove', handlePointerMove);
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, []);

  // Animation Loop: Entrance, idle float, and pointer tilt
  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();

    // 1. Entrance animation (staggered 1.2s)
    if (entranceProgress.current < 1) {
      entranceProgress.current = Math.min(1, entranceProgress.current + delta * 0.9);
    }
    const t = entranceProgress.current;
    const easeOutCubic = 1 - Math.pow(1 - t, 3);

    // Blocks slide in from left (-80 -> 0)
    if (blocksGroupRef.current) {
      blocksGroupRef.current.position.x = THREE.MathUtils.lerp(-80, 0, easeOutCubic);
    }

    // Ribbon (leg + bowl) sweeps in from right (+80 -> 0)
    if (ribbonGroupRef.current) {
      const ribbonEase = 1 - Math.pow(1 - Math.min(1, t * 1.1), 3);
      ribbonGroupRef.current.position.x = THREE.MathUtils.lerp(80, 0, ribbonEase);
    }

    // 2. Idle float & gentle pointer tilt
    if (rootGroupRef.current) {
      // Gentle vertical float
      rootGroupRef.current.position.y = Math.sin(time * 1.2) * 2.5;

      // Smooth pointer tilt interpolation
      rootGroupRef.current.rotation.y = THREE.MathUtils.lerp(
        rootGroupRef.current.rotation.y,
        pointerTarget.current.x,
        0.05
      );
      rootGroupRef.current.rotation.x = THREE.MathUtils.lerp(
        rootGroupRef.current.rotation.x,
        pointerTarget.current.y,
        0.05
      );
    }
  });

  return (
    <group ref={rootGroupRef}>
      {/* Three Blocks Group (Color: --logo-1, depth: 16) */}
      <group ref={blocksGroupRef}>
        <mesh position={[0, 0, -8]} castShadow receiveShadow>
          <extrudeGeometry args={[shapeBlock1, extrudeSettingsBlocks]} />
          <meshStandardMaterial color={colors.logo1} roughness={0.42} metalness={0.12} />
        </mesh>

        <mesh position={[0, 0, -8]} castShadow receiveShadow>
          <extrudeGeometry args={[shapeBlock2, extrudeSettingsBlocks]} />
          <meshStandardMaterial color={colors.logo1} roughness={0.42} metalness={0.12} />
        </mesh>

        <mesh position={[0, 0, -8]} castShadow receiveShadow>
          <extrudeGeometry args={[shapeBlock3, extrudeSettingsBlocks]} />
          <meshStandardMaterial color={colors.logo1} roughness={0.42} metalness={0.12} />
        </mesh>
      </group>

      {/* Ribbon Group: Leg (Color: --logo-3, depth: 9, z: -4) & Bowl (Color: --logo-2, depth: 12, z: +2) */}
      <group ref={ribbonGroupRef}>
        {/* Leg */}
        <mesh position={[0, 0, -4 - 4.5]} castShadow receiveShadow>
          <extrudeGeometry args={[shapeLeg, extrudeSettingsLeg]} />
          <meshStandardMaterial color={colors.logo3} roughness={0.42} metalness={0.12} />
        </mesh>

        {/* Bowl */}
        <mesh position={[0, 0, 2 - 6]} castShadow receiveShadow>
          <extrudeGeometry args={[shapeBowl, extrudeSettingsBowl]} />
          <meshStandardMaterial color={colors.logo2} roughness={0.42} metalness={0.12} />
        </mesh>
      </group>
    </group>
  );
}

export default function HeroSymbol3D() {
  const [isDark, setIsDark] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    // Intersection observer: pause rendering when scrolled offscreen
    const el = containerRef.current;
    if (el) {
      const io = new IntersectionObserver(([entry]) => {
        setIsPaused(!entry.isIntersecting);
      });
      io.observe(el);
      return () => {
        observer.disconnect();
        io.disconnect();
      };
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative flex items-center justify-center">
      <Canvas
        camera={{ position: [0, 0, 255], fov: 32 }}
        frameloop={isPaused ? 'never' : 'always'}
        dpr={[1, 1.5]} // Capped at 1.5 for performance
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
      >
        <hemisphereLight intensity={1.2} groundColor={isDark ? '#071229' : '#F4F6F9'} color="#FFFFFF" />
        <directionalLight position={[100, 120, 180]} intensity={1.8} castShadow />
        <ExtrudedSymbol isDark={isDark} />
      </Canvas>
    </div>
  );
}
