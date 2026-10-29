(function () {
    "use strict";
    document.documentElement.dataset.club = "arsenal";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = "#DB0007";
    document.querySelectorAll("[data-club-name]").forEach(function (el) { el.textContent = "MATCHDAY"; });
    document.querySelectorAll("[data-club-short]").forEach(function (el) { el.textContent = "MD"; });
    document.querySelectorAll("[data-club-motto]").forEach(function (el) { el.textContent = "RED & WHITE"; });
    // Read-only statistics. Existing history.js remains responsible for result links.
    function readStats() {
        if (!document.querySelector("#md-attempts")) return;
        let results;
        try {
            const value = localStorage.getItem("mock-exam-history");
            results = value === null ? [] : JSON.parse(value);
            if (!Array.isArray(results)) throw new Error("Invalid history");
        } catch (error) { return; }
        const valid = results.filter(function (r) {
            return r && r.version === 1 && Number.isSafeInteger(r.totalQuestions) && r.totalQuestions > 0 &&
                Number.isSafeInteger(r.correctQuestions) && r.correctQuestions >= 0 && r.correctQuestions <= r.totalQuestions &&
                Number.isFinite(r.score) && r.score === Number((r.correctQuestions / r.totalQuestions * 10).toFixed(2));
        });
        document.querySelector("#md-attempts").textContent = String(valid.length);
        if (!valid.length) return;
        const sum = valid.reduce(function (total, r) { return total + r.score; }, 0);
        const best = valid.reduce(function (top, r) { return Math.max(top, r.score); }, 0);
        document.querySelector("#md-average").textContent = (sum / valid.length).toFixed(2);
        document.querySelector("#md-best").textContent = best.toFixed(2);
    }
    readStats();
})();
