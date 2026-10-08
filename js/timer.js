/**
 * TCIS Entrance Examination Portal - Server-Synchronized Countdown Timer Engine
 */

window.TCISTimer = (function () {
    let timerInterval = null;
    let endTimestamp = null;
    let onTickCallback = null;
    let onExpireCallback = null;
    let warningFired = false;

    /**
     * Start high-precision countdown
     * @param {number} durationMinutes - Examination length in minutes
     * @param {string|number|Date} startTime - Server start timestamp
     * @param {Function} onTick - Callback every second with { hours, minutes, seconds, formatted, totalSecondsRemaining }
     * @param {Function} onExpire - Callback when timer hits 0
     */
    function startTimer(durationMinutes, startTime, onTick, onExpire) {
        stopTimer();

        onTickCallback = onTick;
        onExpireCallback = onExpire;
        warningFired = false;

        const startMs = new Date(startTime).getTime();
        const durationMs = durationMinutes * 60 * 1000;
        endTimestamp = startMs + durationMs;

        updateTimer();
        timerInterval = setInterval(updateTimer, 1000);
    }

    function updateTimer() {
        const now = Date.now(); // Server offset can be applied here
        const remainingMs = Math.max(0, endTimestamp - now);
        const totalSeconds = Math.floor(remainingMs / 1000);

        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        const pad = n => String(n).padStart(2, '0');
        const formatted = hours > 0
            ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
            : `${pad(minutes)}:${pad(seconds)}`;

        // Warning at 5 minutes
        if (totalSeconds <= 300 && totalSeconds > 0 && !warningFired) {
            warningFired = true;
            window.TCISUtils.showToast('⚠️ 5 Minutes Remaining! Please review and finalize your answers.', 'warning', 8000);
        }

        if (typeof onTickCallback === 'function') {
            onTickCallback({
                hours,
                minutes,
                seconds,
                formatted,
                totalSecondsRemaining: totalSeconds
            });
        }

        if (totalSeconds <= 0) {
            stopTimer();
            if (typeof onExpireCallback === 'function') {
                onExpireCallback();
            }
        }
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function getRemainingSeconds() {
        if (!endTimestamp) return 0;
        return Math.max(0, Math.floor((endTimestamp - Date.now()) / 1000));
    }

    return {
        startTimer,
        stopTimer,
        getRemainingSeconds
    };
})();
