let [seconds, minutes] = [0, 0];
let timeRef = document.querySelector(".timer-display");
let int = null;

document.getElementById("start-timer").addEventListener("click", () => {
    if (int !== null) {
        clearInterval(int);
    }
    int = setInterval(displayTimer, 1000); // Update every second
});

document.getElementById("pause-timer").addEventListener("click", () => {
    clearInterval(int);
});

document.getElementById("reset-timer").addEventListener("click", () => {
    clearInterval(int);
    [seconds, minutes] = [0, 0];
    timeRef.innerHTML = "00 : 00";
});

function displayTimer() {
    seconds++;
    if (seconds == 60) {
        seconds = 0;
        minutes++;
    }

    let m = minutes < 10 ? "0" + minutes : minutes;
    let s = seconds < 10 ? "0" + seconds : seconds;

    timeRef.innerHTML = `${m} : ${s}`;

    checkBells(m, s);
}

function checkBells(m, s) {
    let currentTime = `${m}:${s}`;
    
    let firstBellTime = document.getElementById("first-bell").value;
    let secondBellTime = document.getElementById("second-bell").value;
    let thirdBellTime = document.getElementById("third-bell").value;

    if (currentTime === firstBellTime) {
        document.getElementById("first-bell-sound").play();
    } else if (currentTime === secondBellTime) {
        document.getElementById("second-bell-sound").play();
    } else if (currentTime === thirdBellTime) {
        document.getElementById("third-bell-sound").play();
    }
}

