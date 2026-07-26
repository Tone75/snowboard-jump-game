import { BOARDS, TRAILS, ACHIEVEMENTS } from "./data.js";

const SAVE_KEY = "peakdrop_save_v1";

function defaultState() {
  return {
    coins: 0,
    ownedBoards: ["starter"],
    ownedTrails: ["snow"],
    equippedBoard: "starter",
    equippedTrail: "snow",
    bestByCourse: {},          // courseId -> { distance, score }
    unlockedAchievements: [],  // ids
    stats: {
      totalLandings: 0,
      totalCrashes: 0,
      lifetimeDistance: 0,
      lifetimeCoins: 0,
      bestSingleDistance: 0,
      maxCleanSpinDeg: 0,
      maxCleanFlipDeg: 0,
      totalGrabsLanded: 0,
      maxComboAchieved: 1,
      cleanStreak: 0,
      bestCleanStreak: 0,
      nightCleanLanding: false,
    },
  };
}

export class Progression {
  constructor() {
    this.state = this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      const base = defaultState();
      return {
        ...base,
        ...parsed,
        stats: { ...base.stats, ...(parsed.stats || {}) },
      };
    } catch (e) {
      return defaultState();
    }
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
    } catch (e) { /* ignore quota errors */ }
  }

  reset() {
    this.state = defaultState();
    this.save();
  }

  get coins() { return this.state.coins; }

  earnCoins(amount) {
    amount = Math.max(0, Math.round(amount));
    this.state.coins += amount;
    this.state.stats.lifetimeCoins += amount;
    return amount;
  }

  canAfford(cost) { return this.state.coins >= cost; }

  buyBoard(id) {
    const board = BOARDS.find(b => b.id === id);
    if (!board || this.state.ownedBoards.includes(id) || !this.canAfford(board.cost)) return false;
    this.state.coins -= board.cost;
    this.state.ownedBoards.push(id);
    this.save();
    return true;
  }

  buyTrail(id) {
    const trail = TRAILS.find(t => t.id === id);
    if (!trail || this.state.ownedTrails.includes(id) || !this.canAfford(trail.cost)) return false;
    this.state.coins -= trail.cost;
    this.state.ownedTrails.push(id);
    this.save();
    return true;
  }

  equipBoard(id) { if (this.state.ownedBoards.includes(id)) { this.state.equippedBoard = id; this.save(); } }
  equipTrail(id) { if (this.state.ownedTrails.includes(id)) { this.state.equippedTrail = id; this.save(); } }

  getEquippedBoard() { return BOARDS.find(b => b.id === this.state.equippedBoard) || BOARDS[0]; }
  getEquippedTrail() { return TRAILS.find(t => t.id === this.state.equippedTrail) || TRAILS[0]; }

  isCourseUnlocked(course) { return this.state.stats.lifetimeDistance >= course.unlockDistance; }

  recordRun({ courseId, distance, score, crashed, isNight }) {
    this.state.stats.lifetimeDistance += Math.max(0, distance);
    this.state.stats.totalLandings += 1;
    if (crashed) {
      this.state.stats.totalCrashes += 1;
      this.state.stats.cleanStreak = 0;
    } else {
      this.state.stats.cleanStreak += 1;
      this.state.stats.bestCleanStreak = Math.max(this.state.stats.bestCleanStreak, this.state.stats.cleanStreak);
      if (isNight) this.state.stats.nightCleanLanding = true;
    }
    this.state.stats.bestSingleDistance = Math.max(this.state.stats.bestSingleDistance, distance);

    const prevBest = this.state.bestByCourse[courseId] || { distance: 0, score: 0 };
    const isNewRecord = distance > prevBest.distance;
    this.state.bestByCourse[courseId] = {
      distance: Math.max(prevBest.distance, distance),
      score: Math.max(prevBest.score, score),
    };
    this.save();
    return isNewRecord;
  }

  updateTrickStats({ spinDeg, flipDeg, grabsLanded, combo, crashed }) {
    if (!crashed) {
      this.state.stats.maxCleanSpinDeg = Math.max(this.state.stats.maxCleanSpinDeg, spinDeg);
      this.state.stats.maxCleanFlipDeg = Math.max(this.state.stats.maxCleanFlipDeg, flipDeg);
      this.state.stats.maxComboAchieved = Math.max(this.state.stats.maxComboAchieved, combo);
    }
    this.state.stats.totalGrabsLanded += grabsLanded;
    this.save();
  }

  checkNewAchievements() {
    const unlocked = [];
    for (const ach of ACHIEVEMENTS) {
      if (this.state.unlockedAchievements.includes(ach.id)) continue;
      if (ach.get(this.state) >= ach.goal) {
        this.state.unlockedAchievements.push(ach.id);
        unlocked.push(ach);
      }
    }
    if (unlocked.length) this.save();
    return unlocked;
  }
}
