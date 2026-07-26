import * as THREE from "three";

const SAMPLE_STEP = 0.25;
const TRACK_HALF_WIDTH = 11;

function smoothstep(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}
function lerp(a, b, t) { return a + (b - a) * t; }

// Builds a 1D height/slope profile along the z axis for a course.
export function buildCourseProfile(course) {
  const L = course.lengths;
  const z0 = 0;
  const z1 = z0 + L.startFlat;      // start of run-in
  const z2 = z1 + L.runIn;          // start of kicker
  const z3 = z2 + L.kicker;         // takeoff lip
  const z4 = z3 + L.landing;        // start of outrun
  const z5 = z4 + L.outrun;         // end of course

  const runInBlend = 6;
  const outrunBlend = 10;
  const cliffDrop = 4.2;

  // --- theta(z) target slope angle for the ground portion (z <= z3) ---
  function thetaGround(z) {
    if (z < z1) return 5 * Math.PI / 180;
    if (z < z1 + runInBlend) return course.slopeAngle * smoothstep((z - z1) / runInBlend);
    if (z < z2) return course.slopeAngle;
    if (z < z3) {
      // kicker: blend from slopeAngle down to -launchAngle (curves upward)
      const t = smoothstep((z - z2) / (z3 - z2));
      return lerp(course.slopeAngle, -course.launchAngle, t);
    }
    return -course.launchAngle;
  }

  const n = Math.ceil(z5 / SAMPLE_STEP) + 2;
  const heights = new Float32Array(n);
  const slopes = new Float32Array(n);

  // Integrate ground profile from z0 to z3
  let y = 0;
  for (let i = 0; i * SAMPLE_STEP <= z3 + SAMPLE_STEP; i++) {
    const z = i * SAMPLE_STEP;
    heights[i] = y;
    const theta = thetaGround(z);
    slopes[i] = theta;
    y -= Math.tan(theta) * SAMPLE_STEP;
  }
  const lipIndex = Math.round(z3 / SAMPLE_STEP);
  const yLip = heights[lipIndex];
  const yLandingStart = yLip - cliffDrop;

  // Landing hill + outrun profile, independent surface for z > z3
  function thetaLanding(z) {
    const into = z - z3;
    const landLen = z4 - z3;
    if (into < landLen) return course.landingAngle;
    const t = smoothstep((into - landLen) / outrunBlend);
    return lerp(course.landingAngle, 4 * Math.PI / 180, t);
  }

  y = yLandingStart;
  for (let i = lipIndex; i < n; i++) {
    const z = i * SAMPLE_STEP;
    if (z <= z3) continue;
    heights[i] = y;
    const theta = thetaLanding(z);
    slopes[i] = theta;
    y -= Math.tan(theta) * SAMPLE_STEP;
  }
  heights[lipIndex] = yLip; // keep lip point at ramp height (cliff face is the transition to i+1)

  return {
    heights, slopes, sampleStep: SAMPLE_STEP,
    zones: { z0, z1, z2, z3, z4, z5 },
    kPointZ: z3 + (z4 - z3) * 0.55,
    yLip, yLandingStart,
    totalLength: z5,
  };
}

export function heightAt(profile, z) {
  const idx = z / profile.sampleStep;
  const i0 = Math.max(0, Math.min(profile.heights.length - 2, Math.floor(idx)));
  const t = idx - i0;
  const y = lerp(profile.heights[i0], profile.heights[i0 + 1], t);
  const slope = lerp(profile.slopes[i0], profile.slopes[i0 + 1], t);
  return { y, slope };
}

// Lateral bowl shaping so the rider is gently pushed back to center.
export function lateralOffset(x) {
  const ax = Math.abs(x);
  if (ax <= TRACK_HALF_WIDTH * 0.6) return 0.02 * x * x;
  const over = ax - TRACK_HALF_WIDTH * 0.6;
  return 0.02 * x * x + 0.14 * over * over;
}

export function getTerrainHeight(profile, x, z) {
  const { y } = heightAt(profile, Math.max(0, Math.min(profile.totalLength, z)));
  return y - lateralOffset(x);
}

export { TRACK_HALF_WIDTH };

export function buildTerrainMesh(course, profile, scene) {
  const group = new THREE.Group();
  const widthSegs = 24;
  const zStep = 2;
  const zCount = Math.ceil(profile.totalLength / zStep) + 1;

  const geo = new THREE.PlaneGeometry(TRACK_HALF_WIDTH * 2 * 1.6, profile.totalLength, widthSegs, zCount);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const zLocal = pos.getZ(i); // ranges -length/2..length/2
    const z = zLocal + profile.totalLength / 2;
    const { y } = heightAt(profile, Math.max(0, Math.min(profile.totalLength, z)));
    pos.setY(i, y - lateralOffset(x));
    pos.setZ(i, z);
  }
  geo.computeVertexNormals();

  // Vertices already hold absolute world-space coordinates (x, y, z) from the
  // loop above, so the mesh itself stays at the origin with no extra offset.
  const snowMat = new THREE.MeshStandardMaterial({
    color: course.night ? 0x38506b : 0xf4f9ff,
    roughness: 0.85, metalness: 0.0,
    flatShading: false,
  });
  const mesh = new THREE.Mesh(geo, snowMat);
  mesh.receiveShadow = true;
  group.add(mesh);

  // Kicker lip marker (small bright strip at takeoff edge)
  const { z3 } = profile.zones;
  const lipGeo = new THREE.BoxGeometry(TRACK_HALF_WIDTH * 1.2, 0.15, 0.4);
  const lipMat = new THREE.MeshStandardMaterial({ color: 0xff5c3c, emissive: 0x551200 });
  const lip = new THREE.Mesh(lipGeo, lipMat);
  const lipY = heightAt(profile, z3).y;
  lip.position.set(0, lipY + 0.1, z3);
  group.add(lip);

  // K-point flag marker on landing hill
  const kZ = profile.kPointZ;
  const kY = heightAt(profile, kZ).y;
  const flagGroup = new THREE.Group();
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  for (const side of [-1, 1]) {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(side * (TRACK_HALF_WIDTH - 1), kY + 1.1, kZ);
    flagGroup.add(pole);
    const flagGeo = new THREE.PlaneGeometry(0.7, 0.4);
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xffd35c, side: THREE.DoubleSide });
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(side * (TRACK_HALF_WIDTH - 1) + side * 0.35, kY + 2.0, kZ);
    flagGroup.add(flag);
  }
  group.add(flagGroup);

  // Simple decorative trees along the sides
  const treeMat = new THREE.MeshStandardMaterial({ color: course.night ? 0x0f2a1c : 0x1c4a2d });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2a1a });
  const treeCone = new THREE.ConeGeometry(1.1, 3.2, 7);
  const treeTrunk = new THREE.CylinderGeometry(0.18, 0.22, 0.8, 6);
  for (let z = 6; z < profile.totalLength - 6; z += 7 + (Math.sin(z) * 2)) {
    for (const side of [-1, 1]) {
      if (Math.random() < 0.35) continue;
      const x = side * (TRACK_HALF_WIDTH + 2 + Math.random() * 10);
      const { y } = heightAt(profile, z);
      const groundY = y - lateralOffset(x);
      const trunk = new THREE.Mesh(treeTrunk, trunkMat);
      trunk.position.set(x, groundY + 0.4, z);
      group.add(trunk);
      const cone = new THREE.Mesh(treeCone, treeMat);
      cone.position.set(x, groundY + 1.6 + Math.random() * 0.4, z);
      cone.scale.setScalar(0.7 + Math.random() * 0.6);
      group.add(cone);
    }
  }

  scene.add(group);
  return group;
}
