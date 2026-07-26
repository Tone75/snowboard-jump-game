const keys = new Set();
const justPressed = new Set();

window.addEventListener("keydown", (e) => {
  if (!keys.has(e.code)) justPressed.add(e.code);
  keys.add(e.code);
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
    e.preventDefault();
  }
}, { passive: false });

window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
});

export const Input = {
  isDown(code) { return keys.has(code); },
  wasPressed(code) {
    if (justPressed.has(code)) { justPressed.delete(code); return true; }
    return false;
  },
  clearFrame() { justPressed.clear(); },

  tuck() { return this.isDown("ArrowDown") || this.isDown("KeyS"); },
  standUp() { return this.isDown("ArrowUp") || this.isDown("KeyW"); },
  left() { return this.isDown("ArrowLeft") || this.isDown("KeyA"); },
  right() { return this.isDown("ArrowRight") || this.isDown("KeyD"); },
  jumpPressed() { return this.wasPressed("Space"); },
  grabHeld() { return this.isDown("ShiftLeft") || this.isDown("ShiftRight") || this.isDown("KeyQ") || this.isDown("KeyE"); },
};
