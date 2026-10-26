if (document.documentElement.dataset.authBlocked !== "true") {
window.examMonitor = (function () {
    let leaveCount = 0;
    let active = false;

    let canTrack = function () {
        return false;
    };

    let onCountChange = function () {};

    let previousState = document.visibilityState;

    function updateDisplay() {
        const countElement = document.querySelector("#page-leave-count");

        if (countElement) {
            countElement.textContent = leaveCount;
        }
    }

    function handleVisibilityChange() {
        const currentState = document.visibilityState;

        if (!active || !canTrack()) {
            previousState = currentState;
            return;
        }

        if (
            previousState === "visible" &&
            currentState === "hidden"
        ) {
            leaveCount += 1;
            updateDisplay();

            // Lưu ngay số đếm mới.
            onCountChange();
        }

        if (currentState === "visible") {
            const message = document.querySelector("#monitor-message");

            if (message && leaveCount > 0) {
                message.textContent =
                    "Trang thi đã bị ẩn " + leaveCount +
                    " lần trong lượt làm bài này.";
            }
        }

        previousState = currentState;
    }

    function start(checkActive, initialCount, handleCountChange) {
        stop();

        leaveCount =
            Number.isSafeInteger(initialCount) && initialCount >= 0
                ? initialCount
                : 0;

        canTrack = typeof checkActive === "function"
            ? checkActive
            : function () {
                return false;
            };

        onCountChange = typeof handleCountChange === "function"
            ? handleCountChange
            : function () {};

        previousState = document.visibilityState;
        active = true;

        updateDisplay();

        const message = document.querySelector("#monitor-message");

        if (message) {
            message.textContent = leaveCount > 0
                ? "Đã khôi phục số lần rời trang: " + leaveCount + "."
                : "Hệ thống ghi nhận khi trang thi bị ẩn để bạn tự theo dõi sự tập trung.";
        }

        document.addEventListener(
            "visibilitychange",
            handleVisibilityChange
        );
    }

    function stop() {
        active = false;

        document.removeEventListener(
            "visibilitychange",
            handleVisibilityChange
        );
    }

    function getLeaveCount() {
        return leaveCount;
    }

    return {
        start: start,
        stop: stop,
        getLeaveCount: getLeaveCount
    };
})();
}
