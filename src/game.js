import * as THREE from "three";
import { buildCourseProfile, heightAt, getTerrainHeight, TRACK_HALF_WIDTH, buildTerrainMesh } from "./terrain.js";
import { Input } from "./input.js";
import { Audio } from "./audio.js";

const G = 24;
const BASE_FRICTION = 3.2;
const TUCK_FRICTION_MULT = 0.45;
const STAND_FRICTION_MULT = 1.15;
const AIR_DRAG = 0.0035;
const MAX_RUN_SPEED = 46;
const STEER_ACCEL = 9;
const TIMING_WINDOW_DIST = 7; // meters before lip where timing bar is active

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function normalizeAngle(a) {
  a = a % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 500);

    this.listeners = {};
    this.board = null;
    this.trail = null;
    this.course = null;
    this.profile = null;
    this.running = false;

    this._buildPlayerMesh();
    this._buildParticles();
    this._resize = this._resize.bind(this);
    window.addEventListener("resize", this._resize);
    this._resize();
  }

  on(event, cb) { this.listeners[event] = cb; }
  _emit(event, payload) { if (this.listeners[event]) this.listeners[event](payload); }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _buildPlayerMesh() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2b2f38 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.32), bodyMat);
    torso.position.y = 0.85;
    group.add(torso);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xf2c9a0 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), headMat);
    head.position.y = 1.32;
    group.add(head);
    const armMat = new THREE.MeshStandardMaterial({ color: 0x2b2f38 });
    const armGeo = new THREE.BoxGeometry(0.15, 0.5, 0.15);
    this.armL = new THREE.Mesh(armGeo, armMat); this.armL.position.set(-0.38, 0.85, 0); group.add(this.armL);
    this.armR = new THREE.Mesh(armGeo, armMat); this.armR.position.set(0.38, 0.85, 0); group.add(this.armR);

    this.boardMat = new THREE.MeshStandardMaterial({ color: 0xdedede });
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 1.55), this.boardMat);
    board.position.y = 0.34;
    group.add(board);
    this.boardMesh = board;

    group.traverse(o => { if (o.isMesh) { o.castShadow = true; } });

    this.riderGroup = group; // whole-body orientation (spin/lean)
    this.rigYaw = new THREE.Group(); // applies board spin (yaw)
    this.rigPitch = new THREE.Group(); // applies flip (pitch)
    this.rigPitch.add(group);
    this.rigYaw.add(this.rigPitch);
    this.scene.add(this.rigYaw);
  }

  _buildParticles() {
    // Ambient falling snow
    const N = 900;
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 90;
      positions[i * 3 + 1] = Math.random() * 40;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 90;
    }
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const m = new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.85 });
    this.snowfall = new THREE.Points(g, m);
    this.scene.add(this.snowfall);

    // Spray trail behind board
    const M = 200;
    const tg = new THREE.BufferGeometry();
    this.trailPositions = new Float32Array(M * 3);
    this.trailVel = new Float32Array(M * 3);
    this.trailLife = new Float32Array(M);
    tg.setAttribute("position", new THREE.BufferAttribute(this.trailPositions, 3));
    this.trailMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, transparent: true, opacity: 0.9 });
    this.trailPoints = new THREE.Points(tg, this.trailMat);
    this.scene.add(this.trailPoints);
    this.trailCursor = 0;
  }

  loadCourse(course, board, trailColor) {
    this.course = course;
    this.profile = buildCourseProfile(course);
    this.boardMat.color.setHex(board.color);
    this.trailMat.color.setHex(trailColor);
    this.boardStats = board;

    // Clear old terrain
    if (this.terrainGroup) {
      this.scene.remove(this.terrainGroup);
      this.terrainGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    this.terrainGroup = buildTerrainMesh(course, this.profile, this.scene);

    this.scene.fog = new THREE.Fog(course.fog, 40, course.night ? 130 : 220);
    this.scene.background = new THREE.Color(course.sky);

    if (this.hemi) this.scene.remove(this.hemi);
    if (this.sun) this.scene.remove(this.sun);
    this.hemi = new THREE.HemisphereLight(course.night ? 0x1b2b40 : 0xffffff, 0x203040, course.night ? 0.55 : 1.0);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(course.night ? 0x6fa9ff : 0xfff6e0, course.night ? 0.5 : 1.1);
    this.sun.position.set(-20, 40, -10);
    this.sun.castShadow = true;
    this.scene.add(this.sun);
    if (course.night) {
      const spot = new THREE.PointLight(0x4fd7ff, 2.2, 60);
      spot.position.set(0, 20, this.profile.zones.z3 - this.profile.totalLength / 2);
      this.scene.add(spot);
    }
  }

  reset() {
    const p = this.profile;
    this.player = {
      x: 0, y: heightAt(p, 0).y, z: 0,
      vx: 0, vy: 0, vz: 3,
      boardYaw: 0, boardPitch: 0,
      spinTotal: 0, flipTotal: 0,
      tuck: false, grabHeld: false,
      phase: "run",
    };
    this.air = null;
    this.timingArmed = true;
    this.crashShake = 0;
    this.finishTimer = 0;
    this.trailCursor = 0;
    for (let i = 0; i < this.trailLife.length; i++) this.trailLife[i] = 0;
    this.running = true;
    this._emit("phase", "run");
  }

  stop() { this.running = false; }

  update(dt) {
    if (!this.running || !this.player) return;
    dt = Math.min(dt, 1 / 30);
    const p = this.player;
    const prof = this.profile;
    const zones = prof.zones;

    if (p.phase === "run" || p.phase === "kicker") {
      p.tuck = Input.tuck();
      const standing = Input.standUp();
      const { y: groundY, slope } = heightAt(prof, p.z);
      const frictionMult = p.tuck ? TUCK_FRICTION_MULT : (standing ? STAND_FRICTION_MULT : 1.0);
      const speed = Math.hypot(p.vx, p.vz);

      const accel = G * Math.sin(slope) - BASE_FRICTION * frictionMult * (this.boardStats ? (2 - this.boardStats.speed) : 1) * Math.cos(slope) - AIR_DRAG * speed * speed;
      let newSpeed = clamp(speed + accel * dt, 0, MAX_RUN_SPEED);

      // steering
      let steer = 0;
      if (Input.left()) steer -= 1;
      if (Input.right()) steer += 1;
      p.vx += steer * STEER_ACCEL * dt;
      p.vx *= 0.9;
      p.x += p.vx * dt;
      p.x = clamp(p.x, -TRACK_HALF_WIDTH, TRACK_HALF_WIDTH);

      p.vz = newSpeed;
      p.z += p.vz * dt;
      p.y = getTerrainHeight(prof, p.x, p.z);
      p.boardPitch = -slope;
      p.boardYaw = 0;

      // spray particles
      if (newSpeed > 4) this._spawnTrail(p.x, p.y + 0.2, p.z, p.vz);

      // enter kicker zone
      if (p.z >= zones.z2 && p.z < zones.z3 && p.phase === "run") {
        p.phase = "kicker";
        this._emit("phase", "kicker");
      }

      if (p.phase === "kicker") {
        const windowStart = zones.z3 - TIMING_WINDOW_DIST;
        if (p.z >= windowStart) {
          const frac = clamp((p.z - windowStart) / (zones.z3 - windowStart), 0, 1);
          this._emit("timing", frac);
          if (Input.jumpPressed()) {
            this._launch(frac);
          } else if (p.z >= zones.z3) {
            this._launch(1.0, true);
          }
        }
      }
    } else if (p.phase === "air") {
      // spin / flip controls
      const airCtrl = this.boardStats ? this.boardStats.air : 1;
      const spinRate = 5.2 * airCtrl;
      const flipRate = 4.6 * airCtrl;
      let spinInput = 0, flipInput = 0;
      if (Input.left()) spinInput -= 1;
      if (Input.right()) spinInput += 1;
      if (Input.standUp()) flipInput -= 1;
      if (Input.tuck()) flipInput += 1;

      p.boardYaw += spinInput * spinRate * dt;
      p.boardPitch += flipInput * flipRate * dt;
      this.air.spinTotal = p.boardYaw;
      this.air.flipTotal = p.boardPitch;

      const grabbing = Input.grabHeld();
      if (grabbing) {
        this.air.grabTimer += dt;
        if (this.air.grabTimer > 0.22 && !this.air.grabFired) {
          this.air.grabFired = true;
          this.air.grabAchieved = true;
          Audio.trick();
          this._emit("trick", "GRAB!");
        }
      }
      this._checkSpinFlipPopups();

      // wind drift
      const wind = this.course.wind || 0;
      p.vx += Math.sin(performance.now() * 0.0006) * wind * dt * 2;

      p.vy -= G * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.x = clamp(p.x, -TRACK_HALF_WIDTH - 4, TRACK_HALF_WIDTH + 4);

      const groundY = getTerrainHeight(prof, p.x, p.z);
      if (p.y <= groundY + 0.35) {
        this._land(groundY);
      }
    } else if (p.phase === "land" || p.phase === "crash") {
      const frictionMult = p.phase === "crash" ? 2.6 : 1.2;
      const speed = Math.hypot(p.vx, p.vz);
      const { slope } = heightAt(prof, p.z);
      const accel = G * Math.sin(slope) - BASE_FRICTION * frictionMult * Math.cos(slope);
      const newSpeed = clamp(speed + accel * dt, 0, MAX_RUN_SPEED);
      p.vz = newSpeed;
      p.z += p.vz * dt;
      p.x += p.vx * dt * 0.3;
      p.y = getTerrainHeight(prof, p.x, p.z);
      if (p.phase === "crash") this.crashShake = Math.max(0, this.crashShake - dt);
      this.finishTimer -= dt;
      if (this.finishTimer <= 0) {
        this.running = false;
        this._emit("finished", this._buildResult());
      }
    }

    this._updateTrail(dt);
    this._updateSnowfall(dt);
    this._updatePlayerMesh();
    this._updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _launch(frac, missed = false) {
    const p = this.player;
    const prof = this.profile;
    const zones = prof.zones;
    const speed = Math.hypot(p.vx, p.vz);
    const popMult = this.boardStats ? this.boardStats.pop : 1;
    // sweet spot near frac 0.82-0.97
    let timingBonus = 0;
    if (!missed) {
      const d = Math.abs(frac - 0.9);
      timingBonus = clamp(1 - d / 0.35, 0, 1);
    }
    const basePop = 2.2 + timingBonus * 7.5 * popMult;
    const launchAngle = this.course.launchAngle;
    p.vz = speed * Math.cos(launchAngle);
    p.vy = speed * Math.sin(launchAngle) + basePop;
    p.z = zones.z3 + 0.05;
    p.phase = "air";
    this.air = {
      spinTotal: 0, flipTotal: 0, grabTimer: 0, grabFired: false, grabAchieved: false,
      poppedThresholds: new Set(), timingBonus, startZ: zones.z3,
    };
    p.boardYaw = 0; p.boardPitch = 0;
    Audio.pop();
    this._emit("phase", "air");
    this._emit("launchQuality", timingBonus);
  }

  _checkSpinFlipPopups() {
    const spinDeg = Math.abs(this.air.spinTotal) * 180 / Math.PI;
    const flipDeg = Math.abs(this.air.flipTotal) * 180 / Math.PI;
    const spinStep = Math.floor(spinDeg / 180);
    const flipStep = Math.floor(flipDeg / 180);
    if (spinStep > 0) {
      const key = "s" + spinStep;
      if (!this.air.poppedThresholds.has(key)) {
        this.air.poppedThresholds.add(key);
        Audio.trick();
        this._emit("trick", `${spinStep * 180} SPIN!`);
      }
    }
    if (flipStep > 0) {
      const key = "f" + flipStep;
      if (!this.air.poppedThresholds.has(key)) {
        this.air.poppedThresholds.add(key);
        Audio.trick();
        const dir = this.air.flipTotal >= 0 ? "BACKFLIP" : "FRONTFLIP";
        this._emit("trick", flipStep > 1 ? `DOUBLE ${dir}!` : `${dir}!`);
      }
    }
  }

  _land(groundY) {
    const p = this.player;
    const prof = this.profile;
    const grip = this.boardStats ? this.boardStats.grip : 1;

    const yawErr = Math.abs(normalizeAngle(this.air.spinTotal));
    const pitchErr = Math.abs(normalizeAngle(this.air.flipTotal));
    const { slope } = heightAt(prof, p.z);
    const velAngle = Math.atan2(-p.vy, Math.max(0.1, p.vz));
    const impactErr = Math.abs(velAngle - slope);

    const yawCrash = 0.95 * grip;
    const pitchCrash = 0.8 * grip;
    const impactCrash = 0.95 * grip;
    const risk = Math.max(yawErr / yawCrash, pitchErr / pitchCrash, impactErr / impactCrash);

    let tier;
    if (risk <= 0.35) tier = "PERFECT";
    else if (risk <= 0.65) tier = "GOOD";
    else if (risk < 1.0) tier = "SHAKY";
    else tier = "CRASH";

    const spinDeg = Math.abs(this.air.spinTotal) * 180 / Math.PI;
    const flipDeg = Math.abs(this.air.flipTotal) * 180 / Math.PI;
    const grabbed = this.air.grabAchieved;
    const categories = (spinDeg >= 170 ? 1 : 0) + (flipDeg >= 170 ? 1 : 0) + (grabbed ? 1 : 0);
    const combo = tier === "CRASH" ? 1 : Math.min(1.75, 1 + 0.25 * Math.max(0, categories - 1));

    const rawDistance = Math.max(0.1, p.z - this.air.startZ);
    const landingMult = { PERFECT: 1.15, GOOD: 1.0, SHAKY: 0.85, CRASH: 0.5 }[tier];
    const crashed = tier === "CRASH";
    const distance = crashed ? rawDistance * 0.55 : rawDistance;

    const spinPoints = Math.floor(spinDeg / 180) * 70;
    const flipPoints = Math.floor(flipDeg / 180) * 90;
    const grabPoints = grabbed ? 80 : 0;
    const styleRaw = crashed ? 0 : (spinPoints + flipPoints + grabPoints) * combo;
    const score = Math.round(distance * 10 * landingMult + styleRaw);

    p.phase = crashed ? "crash" : "land";
    p.vy = 0;
    p.vz = Math.hypot(p.vx, p.vz) * (crashed ? 0.4 : 0.85);
    p.y = groundY;
    p.boardYaw = 0;
    p.boardPitch = -slope;
    this.crashShake = crashed ? 0.5 : 0;
    this.finishTimer = crashed ? 1.6 : 1.4;

    if (crashed) { Audio.crash(); this._emit("crash"); }
    else if (tier === "PERFECT") Audio.land_clean();
    else Audio.land_ok();

    this._emit("phase", p.phase);
    this._lastLandingData = {
      tier, distance, rawDistance, score, spinDeg, flipDeg, grabbed, combo, crashed,
      landingMult, styleRaw,
    };
  }

  _buildResult() {
    return this._lastLandingData;
  }

  _spawnTrail(x, y, z, speed) {
    for (let n = 0; n < 2; n++) {
      const i = this.trailCursor;
      this.trailCursor = (this.trailCursor + 1) % this.trailLife.length;
      this.trailPositions[i * 3] = x + (Math.random() - 0.5) * 0.4;
      this.trailPositions[i * 3 + 1] = y;
      this.trailPositions[i * 3 + 2] = z - 0.6 + (Math.random() - 0.5) * 0.2;
      this.trailVel[i * 3] = (Math.random() - 0.5) * 1.2;
      this.trailVel[i * 3 + 1] = Math.random() * 1.5;
      this.trailVel[i * 3 + 2] = -speed * 0.15;
      this.trailLife[i] = 0.6 + Math.random() * 0.3;
    }
  }

  _updateTrail(dt) {
    const pos = this.trailPositions;
    for (let i = 0; i < this.trailLife.length; i++) {
      if (this.trailLife[i] <= 0) { pos[i * 3 + 1] = -9999; continue; }
      this.trailLife[i] -= dt;
      pos[i * 3] += this.trailVel[i * 3] * dt;
      pos[i * 3 + 1] += this.trailVel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += this.trailVel[i * 3 + 2] * dt;
      this.trailVel[i * 3 + 1] -= 2 * dt;
    }
    this.trailPoints.geometry.attributes.position.needsUpdate = true;
  }

  _updateSnowfall(dt) {
    const pos = this.snowfall.geometry.attributes.position;
    const wind = this.course ? this.course.wind : 0;
    const cz = this.player ? this.player.z : 0;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - dt * 4;
      let x = pos.getX(i) + wind * dt * 2;
      if (y < 0) {
        y = 30 + Math.random() * 10;
        x = (Math.random() - 0.5) * 90;
        pos.setZ(i, cz + (Math.random() - 0.5) * 90);
      }
      pos.setY(i, y);
      pos.setX(i, x);
    }
    pos.needsUpdate = true;
  }

  _updatePlayerMesh() {
    const p = this.player;
    this.rigYaw.position.set(p.x, p.y, p.z);
    this.rigYaw.rotation.y = p.boardYaw;
    this.rigPitch.rotation.x = p.boardPitch;
    const lean = clamp(p.vx * -0.05, -0.5, 0.5);
    this.riderGroup.rotation.z = lean;
    const t = performance.now() * 0.01;
    if (p.phase === "run") {
      this.armL.rotation.x = Math.sin(t) * 0.15;
      this.armR.rotation.x = -Math.sin(t) * 0.15;
    }
  }

  groundYAtPlayer() {
    if (!this.player || !this.profile) return 0;
    return getTerrainHeight(this.profile, this.player.x, this.player.z);
  }

  _updateCamera(dt) {
    const p = this.player;
    if (!p) return;
    const behind = p.phase === "air" ? 8.5 : 6.5;
    const height = p.phase === "air" ? 3.2 : 2.6;
    const targetPos = new THREE.Vector3(p.x * 0.4, p.y + height, p.z - behind);
    if (!this._camPos) this._camPos = targetPos.clone();
    this._camPos.lerp(targetPos, 1 - Math.pow(0.001, dt));
    if (this.crashShake > 0) {
      this._camPos.x += (Math.random() - 0.5) * this.crashShake;
      this._camPos.y += (Math.random() - 0.5) * this.crashShake;
    }
    this.camera.position.copy(this._camPos);
    const lookTarget = new THREE.Vector3(p.x * 0.3, p.y + 1.0, p.z + 5);
    this.camera.lookAt(lookTarget);
  }
}
