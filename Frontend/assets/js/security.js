if (document.documentElement.dataset.authBlocked !== "true") {
window.examMonitor = (function () {
    "use strict";
    let count = 0, active = false, events = [], endTime = Infinity;
    let canTrack = () => false, onChange = () => {}, previous = document.visibilityState;
    function updateDisplay() {
        const node = document.querySelector("#page-leave-count"); if (node) node.textContent = count;
    }
    function visibility() {
        const state = document.visibilityState;
        if (!active || !canTrack()) { previous = state; return; }
        const now = new Date(Math.min(Date.now(), endTime)).toISOString();
        if (previous === "visible" && state === "hidden") {
            count++; events.push({hiddenAt: now, visibleAt: null, endedAt: null}); updateDisplay(); onChange();
        }
        if (state === "visible") {
            const open = events[events.length - 1];
            if (open && !open.visibleAt && !open.endedAt) { open.visibleAt = now; onChange(); }
            const message = document.querySelector("#monitor-message");
            if (message && count) message.textContent = "Trang thi đã bị ẩn " + count + " lần trong lượt làm bài này. Chỉ số này không làm thay đổi điểm.";
        }
        previous = state;
    }
    function start(check, initialCount, callback, initialEvents, deadline) {
        stop();
        count = Number.isSafeInteger(initialCount) && initialCount >= 0 ? initialCount : 0;
        events = Array.isArray(initialEvents) ? initialEvents.filter(e => e && Number.isFinite(Date.parse(e.hiddenAt)) && (e.visibleAt === null || Number.isFinite(Date.parse(e.visibleAt))) && (e.endedAt == null || Number.isFinite(Date.parse(e.endedAt)))).map(e => ({...e})) : [];
        endTime = Number.isFinite(deadline) ? deadline : Infinity;
        canTrack = check; onChange = typeof callback === "function" ? callback : () => {};
        previous = document.visibilityState; active = true;
        // A restored open interval ends when this document is visible again.
        const open = events[events.length - 1];
        if (open && !open.visibleAt && !open.endedAt && previous === "visible") {
            if (Date.now() >= endTime) open.endedAt = new Date(endTime).toISOString();
            else open.visibleAt = new Date().toISOString();
        }
        updateDisplay();
        const message = document.querySelector("#monitor-message");
        if (message) message.textContent = count ? "Đã khôi phục số lần rời trang: " + count + "." : "Chỉ ghi nhận khi trang bị ẩn. Không chặn đổi tab và không trừ điểm.";
        document.addEventListener("visibilitychange", visibility);
    }
    function stop(at) {
        if (active && Number.isFinite(at)) {
            const open = events[events.length - 1];
            if (open && !open.visibleAt && !open.endedAt) open.endedAt = new Date(Math.min(at, endTime)).toISOString();
        }
        active = false; document.removeEventListener("visibilitychange", visibility);
    }
    return {start, stop, getLeaveCount: () => count, getEvents: () => events.map(e => ({...e}))};
})();
}
