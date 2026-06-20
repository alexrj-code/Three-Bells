let timeRef = document.querySelector(".timer-display");

// --- Timer state ---
// Instead of just counting "ticks" (which get throttled by the browser
// when the tab is in the background), we track real timestamps and
// always derive elapsed time from Date.now(). This means even if the
// interval below fires late (or rarely) while the tab is hidden, the
// displayed time snaps to the CORRECT elapsed time as soon as it runs,
// instead of staying frozen.
let intervalId = null;
let running = false;
let startTimestamp = null; // Date.now() value when the current run started
let elapsedMsBeforeThisRun = 0; // accumulated time from previous start/pause cycles
let bellsTriggered = { first: false, second: false, third: false };

// --- Web Audio boost setup ---
// <audio>.volume is capped at 1.0 (100%) by the browser, so it's
// impossible to make a clip louder than its original recording using
// the volume property alone. To boost beyond 100%, we route the audio
// element through the Web Audio API and apply a Gain node with a value
// greater than 1.0.
let audioCtx = null;
let audioBoostReady = false;

function initAudioBoost() {
    if (audioBoostReady) return;
    audioBoostReady = true;

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // First and second bell: boosted by 100% (gain of 2.0 = double amplitude).
    boostAudioElement("first-bell-sound", 2.0);
    boostAudioElement("second-bell-sound", 2.0);
    // Third bell: left at normal volume, just routed through the same
    // audio graph for consistency.
    boostAudioElement("third-bell-sound", 1.0);
}

function boostAudioElement(elementId, gainValue) {
    const audioEl = document.getElementById(elementId);
    const source = audioCtx.createMediaElementSource(audioEl);
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = gainValue;
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
}

function playBell(elementId) {
    const audioEl = document.getElementById(elementId);
    audioEl.currentTime = 0;
    audioEl.play().catch((err) => console.warn("Could not play bell sound:", err));
}

// --- Controls ---
document.getElementById("start-timer").addEventListener("click", () => {
    if (running) return;

    // Web Audio requires a user gesture to start/resume - the Start
    // button click counts as one, so this is the right place to do it.
    initAudioBoost();
    if (audioCtx.state === "suspended") {
        audioCtx.resume();
    }

    running = true;
    startTimestamp = Date.now();

    if (intervalId !== null) clearInterval(intervalId);
    intervalId = setInterval(tick, 250);
    tick();
});

document.getElementById("pause-timer").addEventListener("click", () => {
    if (!running) return;
    running = false;
    clearInterval(intervalId);
    elapsedMsBeforeThisRun += Date.now() - startTimestamp;
});

document.getElementById("reset-timer").addEventListener("click", () => {
    running = false;
    clearInterval(intervalId);
    startTimestamp = null;
    elapsedMsBeforeThisRun = 0;
    bellsTriggered = { first: false, second: false, third: false };
    timeRef.innerHTML = "00 : 00";
});

// When the tab regains focus, immediately recalculate and redraw so
// the display catches up right away instead of waiting for the next
// (possibly throttled) interval tick.
document.addEventListener("visibilitychange", () => {
    if (!document.hidden && running) {
        tick();
    }
});

// --- Core tick logic ---
function getElapsedSeconds() {
    let totalMs = elapsedMsBeforeThisRun;
    if (running && startTimestamp !== null) {
        totalMs += Date.now() - startTimestamp;
    }
    return Math.floor(totalMs / 1000);
}

function tick() {
    const totalSeconds = getElapsedSeconds();
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    const m = minutes < 10 ? "0" + minutes : minutes;
    const s = seconds < 10 ? "0" + seconds : seconds;

    timeRef.innerHTML = `${m} : ${s}`;

    checkBells(totalSeconds);
}

// Parses an "mm:ss" (or "m:s") string into total seconds. Returns null
// if the field is empty or not a valid time.
function parseTimeToSeconds(timeStr) {
    if (!timeStr) return null;
    const parts = timeStr.split(":");
    if (parts.length !== 2) return null;

    const mins = parseInt(parts[0], 10);
    const secs = parseInt(parts[1], 10);
    if (isNaN(mins) || isNaN(secs)) return null;

    return mins * 60 + secs;
}

function checkBells(totalSeconds) {
    const firstBellSeconds = parseTimeToSeconds(document.getElementById("first-bell").value);
    const secondBellSeconds = parseTimeToSeconds(document.getElementById("second-bell").value);
    const thirdBellSeconds = parseTimeToSeconds(document.getElementById("third-bell").value);

    // Using ">=" rather than exact string equality means a bell will
    // still ring on schedule even if a tick is skipped/delayed (e.g.
    // due to background-tab throttling), and each bell only ever
    // fires once per run.
    if (!bellsTriggered.first && firstBellSeconds !== null && totalSeconds >= firstBellSeconds) {
        bellsTriggered.first = true;
        playBell("first-bell-sound");
    }
    if (!bellsTriggered.second && secondBellSeconds !== null && totalSeconds >= secondBellSeconds) {
        bellsTriggered.second = true;
        playBell("second-bell-sound");
    }
    if (!bellsTriggered.third && thirdBellSeconds !== null && totalSeconds >= thirdBellSeconds) {
        bellsTriggered.third = true;
        playBell("third-bell-sound");
    }
}
