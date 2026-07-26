// Lightweight procedural sound effects using WebAudio. No external asset files.
let ctx = null;
function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone({ freq = 440, duration = 0.2, type = "sine", gain = 0.2, sweepTo = null, delay = 0 }) {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + delay);
  if (sweepTo) osc.frequency.linearRampToValueAtTime(sweepTo, c.currentTime + delay + duration);
  g.gain.setValueAtTime(gain, c.currentTime + delay);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + duration);
  osc.connect(g).connect(c.destination);
  osc.start(c.currentTime + delay);
  osc.stop(c.currentTime + delay + duration + 0.05);
}

function noiseBurst({ duration = 0.3, gain = 0.15, delay = 0, filterFreq = 1200 }) {
  const c = getCtx();
  const bufferSize = c.sampleRate * duration;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, c.currentTime + delay);
  src.connect(filter).connect(g).connect(c.destination);
  src.start(c.currentTime + delay);
}

export const Audio = {
  unlock() { try { getCtx(); } catch (e) {} },
  pop() { try { tone({ freq: 260, sweepTo: 520, duration: 0.22, type: "square", gain: 0.18 }); } catch (e) {} },
  trick() { try { tone({ freq: 700, sweepTo: 1100, duration: 0.12, type: "triangle", gain: 0.12 }); } catch (e) {} },
  land_clean() { try { tone({ freq: 180, duration: 0.18, type: "sine", gain: 0.2 }); noiseBurst({ duration: 0.2, gain: 0.1, filterFreq: 2000 }); } catch (e) {} },
  land_ok() { try { tone({ freq: 140, duration: 0.22, type: "sine", gain: 0.18 }); noiseBurst({ duration: 0.25, gain: 0.14, filterFreq: 1400 }); } catch (e) {} },
  crash() { try { noiseBurst({ duration: 0.6, gain: 0.28, filterFreq: 700 }); tone({ freq: 110, sweepTo: 40, duration: 0.5, type: "sawtooth", gain: 0.15 }); } catch (e) {} },
  coin() { try { tone({ freq: 900, sweepTo: 1400, duration: 0.1, type: "square", gain: 0.1, delay: 0 }); tone({ freq: 1200, sweepTo: 1800, duration: 0.12, type: "square", gain: 0.08, delay: 0.06 }); } catch (e) {} },
  ui() { try { tone({ freq: 500, duration: 0.06, type: "sine", gain: 0.08 }); } catch (e) {} },
  achievement() { try { [660, 880, 1100].forEach((f, i) => tone({ freq: f, duration: 0.18, type: "sine", gain: 0.14, delay: i * 0.09 })); } catch (e) {} },
};
