import { Game } from "./game.js";
import { UI } from "./ui.js";
import { Progression } from "./progression.js";
import { Input } from "./input.js";
import { Audio } from "./audio.js";

const canvas = document.getElementById("game-canvas");
const progression = new Progression();
const ui = new UI(progression);
const game = new Game(canvas);

let currentCourse = null;

game.on("phase", (phase) => {
  if (phase === "kicker") ui.showTimingBar(true);
  else ui.showTimingBar(false);
  if (phase === "crash") ui.showCrashBanner(true);
});
game.on("timing", (frac) => ui.updateTiming(frac));
game.on("trick", (text) => ui.popTrick(text));
game.on("crash", () => ui.showCrashBanner(true));
game.on("finished", (result) => onRunFinished(result));

function onRunFinished(result) {
  ui.showCrashBanner(false);
  ui.showTimingBar(false);
  const coinsEarned = progression.earnCoins(result.distance / 2 + result.styleRaw / 15);
  const isNewRecord = progression.recordRun({
    courseId: currentCourse.id,
    distance: result.distance,
    score: result.score,
    crashed: result.crashed,
    isNight: !!currentCourse.night,
  });
  progression.updateTrickStats({
    spinDeg: result.spinDeg,
    flipDeg: result.flipDeg,
    grabsLanded: result.grabbed ? 1 : 0,
    combo: result.combo,
    crashed: result.crashed,
  });
  const newAchievements = progression.checkNewAchievements();
  if (newAchievements.length) Audio.achievement();

  ui.showResults({
    ...result,
    coinsEarned,
    isNewRecord,
    newAchievements,
  });
}

ui.onCoursePicked = (course) => {
  currentCourse = course;
  startRun(course);
};

ui.onRetry = () => {
  if (currentCourse) startRun(currentCourse);
};

function startRun(course) {
  Audio.unlock();
  const board = progression.getEquippedBoard();
  const trail = progression.getEquippedTrail();
  game.loadCourse(course, board, trail.color);
  game.reset();
  ui.show("screen-hud");
}

// Main loop
let last = performance.now();
function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  if (game.running) {
    game.update(dt);
    ui.updateHud({
      speedKmh: Math.hypot(game.player.vx, game.player.vz) * 3.6,
      height: Math.max(0, game.player.y - game.groundYAtPlayer()),
      phase: game.player.phase,
    });
  }
  Input.clearFrame();
  requestAnimationFrame(frame);
}

ui.showTitle();
requestAnimationFrame(frame);
