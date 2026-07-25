import { useEffect, useRef } from "react";
import type { SpatialSinkScene } from "@/lib/pixel";

type ThreeMod = typeof import("three");

/**
 * Imperative Three.js viewport — illuminated cells + wave hits.
 * Client-only; UI sink — does not author digests.
 */
export function SpatialSinkView({ scene }: { scene: SpatialSinkScene }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof window === "undefined") return;
    let disposed = false;
    let raf = 0;
    let renderer: import("three").WebGLRenderer | null = null;
    let resizeObs: ResizeObserver | null = null;

    void (async () => {
      const THREE = await import("three");
      if (disposed || !hostRef.current) return;

      const width = host.clientWidth || 640;
      const height = Math.max(280, Math.min(420, Math.round(width * 0.55)));

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.setClearColor(0x0e1410, 1);
      host.replaceChildren(renderer.domElement);

      const scene3 = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 200);
      const root = new THREE.Group();
      scene3.add(root);

      const ambient = new THREE.AmbientLight(0xc8d4c0, 0.55);
      const key = new THREE.DirectionalLight(0xffe8b8, 0.85);
      key.position.set(4, 8, 6);
      scene3.add(ambient, key);

      const boxGeo = new THREE.BoxGeometry(0.72, 0.72, 0.72);
      const cellMeshes: import("three").Mesh[] = [];
      for (const cell of scene.cells) {
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(cell.color),
          roughness: 0.45,
          metalness: 0.08,
          emissive: new THREE.Color(cell.color),
          emissiveIntensity: 0.22,
        });
        const mesh = new THREE.Mesh(boxGeo, mat);
        mesh.position.set(cell.x, cell.z + 0.36, -cell.y);
        root.add(mesh);
        cellMeshes.push(mesh);
      }

      const hitGeo = new THREE.SphereGeometry(0.14, 12, 12);
      const hitMeshes: import("three").Mesh[] = [];
      for (const hit of scene.waveHits) {
        const amp = Math.max(0.15, Math.min(1, hit.amplitudeMilli / 10000));
        const mat = new THREE.MeshStandardMaterial({
          color: 0xd4c48a,
          transparent: true,
          opacity: 0.25 + amp * 0.55,
          roughness: 0.3,
          emissive: 0xd4c48a,
          emissiveIntensity: 0.15 + amp * 0.4,
        });
        const mesh = new THREE.Mesh(hitGeo, mat);
        mesh.position.set(hit.x, hit.z + 0.9 + hit.hop * 0.15, -hit.y);
        mesh.scale.setScalar(0.7 + amp * 0.8);
        root.add(mesh);
        hitMeshes.push(mesh);
      }

      // Soft ground plane — atmosphere, not a card collage
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 40),
        new THREE.MeshStandardMaterial({
          color: 0x121a14,
          roughness: 1,
          metalness: 0,
        }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.02;
      scene3.add(ground);

      const bounds = new THREE.Box3().setFromObject(root);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z, 2) * 0.7 + 2.5;
      root.position.sub(center);

      const t0 = performance.now();
      const animate = (now: number) => {
        if (disposed || !renderer) return;
        const t = (now - t0) / 1000;
        // Slow orbit — presence, not noise
        camera.position.set(
          Math.sin(t * 0.22) * radius,
          radius * 0.55 + Math.sin(t * 0.15) * 0.4,
          Math.cos(t * 0.22) * radius,
        );
        camera.lookAt(0, 0.2, 0);
        // Soft pulse on wave hits
        for (let i = 0; i < hitMeshes.length; i++) {
          const m = hitMeshes[i]!;
          const base = 0.7 + (scene.waveHits[i]!.amplitudeMilli / 10000) * 0.8;
          m.scale.setScalar(base * (1 + Math.sin(t * 2.2 + i) * 0.06));
        }
        // Gentle emissive breath on tip-ish cells
        for (let i = 0; i < cellMeshes.length; i++) {
          const mat = cellMeshes[i]!.material as import("three").MeshStandardMaterial;
          mat.emissiveIntensity = 0.18 + Math.sin(t * 1.4 + i * 0.3) * 0.06;
        }
        renderer.render(scene3, camera);
        raf = requestAnimationFrame(animate);
      };
      raf = requestAnimationFrame(animate);

      resizeObs = new ResizeObserver(() => {
        if (!renderer || !hostRef.current) return;
        const w = hostRef.current.clientWidth || 640;
        const h = Math.max(280, Math.min(420, Math.round(w * 0.55)));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      });
      resizeObs.observe(host);

      void (THREE as unknown as ThreeMod);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObs?.disconnect();
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
      }
      host.replaceChildren();
    };
  }, [scene]);

  return (
    <div
      ref={hostRef}
      className="w-full overflow-hidden rounded-md border border-border/40 bg-[oklch(0.1_0.02_145)]"
      style={{ minHeight: 280 }}
      aria-label="Spatial picture Three.js sink"
    />
  );
}
