let timeRef = document.querySelector(".timer-display");

// ---------- Timer state ----------
let intervalId = null;
let running = false;
let startTimestamp = null; // Date.now() when the current run started
let elapsedMsBeforeThisRun = 0; // accumulated time from earlier start/pause cycles
let bellsTriggered = { first: false, second: false, third: false };

// ---------- Web Audio setup ----------
// WHY: setInterval/setTimeout get heavily throttled by browsers when a tab
// is in the background (Chrome can delay callbacks by up to ~60s to save
// battery). That's why the bell sound was lagging even though the displayed
// time was correct - the *sound* was still waiting on a throttled JS timer
// to fire before it could call .play().
//
// The audio rendering graph runs on its own clock, independent of the main
// JS thread, so scheduling playback with AudioBufferSourceNode.start(time)
// fires at the exact correct moment even while the tab is hidden - the same
// reason background music/video stays perfectly in sync in a hidden tab.
const BELL_FILES = {
    first: "mixkit-bike-notification-bell-590.wav",
    second: "double_bell.wav",
    third: "mixkit-notification-bell-592.wav",
};
const BELL_GAIN = { first: 2.0, second: 2.0, third: 1.0 }; // first/second boosted 100%

let audioCtx = null;
let gainNodes = {};
let audioBuffers = {};
let scheduledSources = { first: null, second: null, third: null };

function setupAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    for (const key of Object.keys(BELL_FILES)) {
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = BELL_GAIN[key];
        gainNode.connect(audioCtx.destination);
        gainNodes[key] = gainNode;

        // Decode the audio up front so it's ready to schedule instantly -
        // <audio>.volume can't exceed 1.0 (100%), so boosting beyond that
        // requires routing decoded audio through this Gain node instead.
        const audioEl = document.getElementById(`${key}-bell-sound`);
        fetch(audioEl.src)
            .then((res) => res.arrayBuffer())
            .then((data) => audioCtx.decodeAudioData(data))
            .then((buffer) => {
                audioBuffers[key] = buffer;
            })
            .catch((err) => console.warn(`Could not decode ${key} bell:`, err));
    }
}

window.addEventListener("DOMContentLoaded", setupAudio);

// Schedules a bell to fire `delaySeconds` from now, using the AudioContext's
// own clock. delaySeconds <= 0 plays immediately.
function scheduleBell(key, delaySeconds) {
    if (!audioBuffers[key]) {
        // Buffer hasn't finished decoding yet (e.g. a very fast first run) -
        // fall back to the plain <audio> element so the bell isn't dropped.
        const audioEl = document.getElementById(`${key}-bell-sound`);
        setTimeout(() => {
            audioEl.currentTime = 0;
            audioEl.play().catch(() => {});
        }, Math.max(0, delaySeconds * 1000));
        bellsTriggered[key] = true;
        return;
    }

    cancelScheduledBell(key);

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffers[key];
    source.connect(gainNodes[key]);
    source.onended = () => {
        bellsTriggered[key] = true;
        scheduledSources[key] = null;
    };

    const startAt = audioCtx.currentTime + Math.max(0, delaySeconds);
    source.start(startAt);
    scheduledSources[key] = source;
}

// Cancels a pending (not-yet-fired) bell WITHOUT marking it as triggered,
// so it can be rescheduled correctly later (used on pause/reset/edit).
function cancelScheduledBell(key) {
    const source = scheduledSources[key];
    if (source) {
        source.onended = null; // don't let the cancel itself count as "played"
        try { source.stop(); } catch (e) {}
        scheduledSources[key] = null;
    }
}

function cancelAllScheduledBells() {
    for (const key of Object.keys(BELL_FILES)) cancelScheduledBell(key);
}

// (Re)schedules every bell that hasn't sounded yet, based on current
// elapsed time. Called on start, resume, and when a bell-time field is
// edited mid-run.
function scheduleAllPendingBells() {
    const currentElapsed = getElapsedSeconds();
    for (const key of Object.keys(BELL_FILES)) {
        if (bellsTriggered[key]) continue;
        const targetSeconds = parseTimeToSeconds(document.getElementById(`${key}-bell`).value);
        if (targetSeconds === null) continue;
        scheduleBell(key, targetSeconds - currentElapsed);
    }
}

["first-bell", "second-bell", "third-bell"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
        if (running) scheduleAllPendingBells();
    });
});

// ---------- Controls ----------
document.getElementById("start-timer").addEventListener("click", () => {
    if (running) return;

    setupAudio();
    if (audioCtx.state === "suspended") audioCtx.resume();

    running = true;
    startTimestamp = Date.now();

    scheduleAllPendingBells();

    if (intervalId !== null) clearInterval(intervalId);
    intervalId = setInterval(tick, 250);
    tick();
});

document.getElementById("pause-timer").addEventListener("click", () => {
    if (!running) return;
    running = false;
    clearInterval(intervalId);
    elapsedMsBeforeThisRun += Date.now() - startTimestamp;
    cancelAllScheduledBells(); // freeze bells along with the clock
});

document.getElementById("reset-timer").addEventListener("click", () => {
    running = false;
    clearInterval(intervalId);
    cancelAllScheduledBells();
    startTimestamp = null;
    elapsedMsBeforeThisRun = 0;
    bellsTriggered = { first: false, second: false, third: false };
    timeRef.innerHTML = "00 : 00";
});

// Catch the on-screen display up instantly when the tab regains focus
// (the bells no longer need this - they're scheduled independently - but
// the visible clock still benefits from an immediate redraw).
document.addEventListener("visibilitychange", () => {
    if (!document.hidden && running) tick();
});

// ---------- Display ----------
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
}

function parseTimeToSeconds(timeStr) {
    if (!timeStr) return null;
    const parts = timeStr.split(":");
    if (parts.length !== 2) return null;

    const mins = parseInt(parts[0], 10);
    const secs = parseInt(parts[1], 10);
    if (isNaN(mins) || isNaN(secs)) return null;

    return mins * 60 + secs;
}
