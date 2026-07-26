import { COURSES, BOARDS, TRAILS, ACHIEVEMENTS } from "./data.js";
import { Audio } from "./audio.js";

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(progression) {
    this.prog = progression;
    this.screens = {};
    document.querySelectorAll(".screen").forEach(el => { this.screens[el.id] = el; });
    this.onCoursePicked = null;
    this.onRetry = null;
    this._wireButtons();
  }

  show(id) {
    Object.values(this.screens).forEach(el => el.classList.remove("active"));
    this.screens[id].classList.add("active");
  }

  _wireButtons() {
    $("btn-play").onclick = () => { Audio.ui(); this.renderCourseSelect(); this.show("screen-course"); };
    $("btn-garage").onclick = () => { Audio.ui(); this.renderGarage(); this.show("screen-garage"); };
    $("btn-achievements").onclick = () => { Audio.ui(); this.renderAchievements(); this.show("screen-achievements"); };
    $("btn-howto").onclick = () => { Audio.ui(); this.show("screen-howto"); };
    document.querySelectorAll(".btn-back").forEach(b => b.onclick = () => { Audio.ui(); this.showTitle(); });
    $("screen-course").querySelector(".btn-back-course").onclick = () => { Audio.ui(); this.showTitle(); };
    document.querySelectorAll(".tab-btn").forEach(b => {
      b.onclick = () => {
        Audio.ui();
        document.querySelectorAll(".tab-btn").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        $("garage-boards").style.display = b.dataset.tab === "boards" ? "grid" : "none";
        $("garage-trails").style.display = b.dataset.tab === "trails" ? "grid" : "none";
      };
    });
    $("btn-to-title").onclick = () => { Audio.ui(); this.showTitle(); };
    $("btn-retry").onclick = () => { Audio.ui(); if (this.onRetry) this.onRetry(); };
  }

  showTitle() {
    const s = this.prog.state.stats;
    $("title-stats").innerHTML =
      `累計飛行距離: <b>${s.lifetimeDistance.toFixed(0)}m</b>　|　所持コイン: <b>${this.prog.coins}</b>　|　最高記録: <b>${s.bestSingleDistance.toFixed(1)}m</b>`;
    this.show("screen-title");
  }

  renderCourseSelect() {
    const list = $("course-list");
    list.innerHTML = "";
    COURSES.forEach(c => {
      const unlocked = this.prog.isCourseUnlocked(c);
      const best = this.prog.state.bestByCourse[c.id];
      const card = document.createElement("div");
      card.className = "course-card" + (unlocked ? "" : " locked");
      card.innerHTML = `
        <h3>${c.name}</h3>
        <p>${c.desc}</p>
        <p>斜度 ${(c.slopeAngle * 180 / Math.PI).toFixed(0)}°　風 ${(c.wind * 100).toFixed(0)}%</p>
        ${best ? `<p class="best">自己ベスト: ${best.distance.toFixed(1)}m</p>` : `<p>未挑戦</p>`}
        ${!unlocked ? `<div class="lock-tag">🔒 累計 ${c.unlockDistance}m で解放</div>` : ""}
      `;
      if (unlocked) {
        card.onclick = () => { Audio.ui(); if (this.onCoursePicked) this.onCoursePicked(c); };
      }
      list.appendChild(card);
    });
  }

  renderGarage() {
    $("coin-display").textContent = `${this.prog.coins} コイン`;
    const boardsEl = $("garage-boards");
    boardsEl.innerHTML = "";
    BOARDS.forEach(b => {
      const owned = this.prog.state.ownedBoards.includes(b.id);
      const equipped = this.prog.state.equippedBoard === b.id;
      const card = document.createElement("div");
      card.className = "item-card";
      card.innerHTML = `
        <h4><span class="item-swatch" style="background:#${b.color.toString(16).padStart(6, "0")}"></span>${b.name}</h4>
        <p style="font-size:0.8em;color:#a9c7e0;margin:4px 0;">${b.desc}</p>
        <div class="stat-row"><span>速度</span><span>${"★".repeat(Math.round(b.speed * 3))}</span></div>
        <div class="stat-row"><span>ポップ</span><span>${"★".repeat(Math.round(b.pop * 3))}</span></div>
        <div class="stat-row"><span>空中制御</span><span>${"★".repeat(Math.round(b.air * 3))}</span></div>
        <div class="stat-row"><span>着地安定</span><span>${"★".repeat(Math.round(b.grip * 3))}</span></div>
        <div class="buy-row"></div>
      `;
      const row = card.querySelector(".buy-row");
      if (equipped) {
        row.innerHTML = `<span class="equipped-tag">装備中</span>`;
      } else if (owned) {
        const btn = document.createElement("button");
        btn.className = "btn"; btn.textContent = "装備する";
        btn.onclick = () => { Audio.ui(); this.prog.equipBoard(b.id); this.renderGarage(); };
        row.appendChild(btn);
      } else {
        const btn = document.createElement("button");
        btn.className = "btn btn-primary"; btn.textContent = `購入 ${b.cost}コイン`;
        btn.disabled = !this.prog.canAfford(b.cost);
        btn.onclick = () => { if (this.prog.buyBoard(b.id)) { Audio.coin(); this.renderGarage(); } };
        row.appendChild(btn);
      }
      boardsEl.appendChild(card);
    });

    const trailsEl = $("garage-trails");
    trailsEl.innerHTML = "";
    TRAILS.forEach(t => {
      const owned = this.prog.state.ownedTrails.includes(t.id);
      const equipped = this.prog.state.equippedTrail === t.id;
      const card = document.createElement("div");
      card.className = "item-card";
      card.innerHTML = `
        <h4><span class="item-swatch" style="background:#${t.color.toString(16).padStart(6, "0")}"></span>${t.name}</h4>
        <p style="font-size:0.8em;color:#a9c7e0;margin:4px 0;">${t.desc}</p>
        <div class="buy-row"></div>
      `;
      const row = card.querySelector(".buy-row");
      if (equipped) {
        row.innerHTML = `<span class="equipped-tag">装備中</span>`;
      } else if (owned) {
        const btn = document.createElement("button");
        btn.className = "btn"; btn.textContent = "装備する";
        btn.onclick = () => { Audio.ui(); this.prog.equipTrail(t.id); this.renderGarage(); };
        row.appendChild(btn);
      } else {
        const btn = document.createElement("button");
        btn.className = "btn btn-primary"; btn.textContent = `購入 ${t.cost}コイン`;
        btn.disabled = !this.prog.canAfford(t.cost);
        btn.onclick = () => { if (this.prog.buyTrail(t.id)) { Audio.coin(); this.renderGarage(); } };
        row.appendChild(btn);
      }
      trailsEl.appendChild(card);
    });
  }

  renderAchievements() {
    const list = $("achievements-list");
    list.innerHTML = "";
    let done = 0;
    ACHIEVEMENTS.forEach(a => {
      const val = a.get(this.prog.state);
      const isDone = val >= a.goal;
      if (isDone) done++;
      const el = document.createElement("div");
      el.className = "ach-item" + (isDone ? " done" : "");
      el.innerHTML = `
        <div><div class="name">${isDone ? "🏆" : "🔒"} ${a.name}</div><div class="desc">${a.desc}</div></div>
        <div class="prog">${Math.min(val, a.goal)}/${a.goal}</div>
      `;
      list.appendChild(el);
    });
    $("ach-progress").textContent = `(${done}/${ACHIEVEMENTS.length})`;
  }

  // ---------- HUD ----------
  setHudVisible(v) { this.show(v ? "screen-hud" : "screen-hud"); }
  updateHud({ speedKmh, height, phase }) {
    $("hud-speed").textContent = speedKmh.toFixed(0);
    $("hud-height").textContent = height.toFixed(1);
    const labels = { run: "助走", kicker: "踏切！", air: "空中", land: "着地", crash: "クラッシュ" };
    $("hud-phase").textContent = labels[phase] || phase;
  }

  showTimingBar(show) {
    $("timing-bar-wrap").classList.toggle("show", show);
  }
  updateTiming(frac) {
    $("timing-marker").style.left = `${frac * 100}%`;
  }

  popTrick(text) {
    const el = document.createElement("div");
    el.className = "trick-pop";
    el.textContent = text;
    $("trick-feed").appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  showCrashBanner(show) {
    $("crash-banner").classList.toggle("show", show);
  }

  showResults({ tier, distance, score, spinDeg, flipDeg, grabbed, combo, coinsEarned, isNewRecord, newAchievements, crashed }) {
    $("results-title").textContent = crashed ? "CRASH..." : tier + "!";
    $("results-distance").textContent = distance.toFixed(1);
    const rows = [
      ["判定", tier],
      ["スピン", `${spinDeg.toFixed(0)}°`],
      ["フリップ", `${flipDeg.toFixed(0)}°`],
      ["グラブ", grabbed ? "成功" : "なし"],
      ["コンボ倍率", `x${combo.toFixed(2)}`],
      ["スコア", score],
      ["獲得コイン", `+${coinsEarned}`],
    ];
    $("results-breakdown").innerHTML = rows.map(([k, v]) => `<div class="row"><span>${k}</span><span>${v}</span></div>`).join("");
    $("results-new-record").classList.toggle("show", !!isNewRecord);
    const achEl = $("results-achievements");
    achEl.innerHTML = newAchievements.length
      ? "実績解除: " + newAchievements.map(a => `🏆 ${a.name}`).join("　")
      : "";
    this.show("screen-results");
  }
}
