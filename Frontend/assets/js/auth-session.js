(function () {
    "use strict";
    const root = new URL("../../", document.currentScript.src);
    const sessionKey = "mock-exam-session";
    const allowedPages = ["student/profile.html", "student/exams.html", "student/my-exams.html", "student/upload-exam.html", "student/exam.html", "student/report.html"];

    function getSession() {
        try {
            const value = JSON.parse(sessionStorage.getItem(sessionKey));
            if (!value || value.version !== 1 || value.accountId !== "demo" || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) return null;
            return value;
        } catch (error) { return null; }
    }

    function getNextPage() {
        const requested = new URLSearchParams(location.search).get("next");
        try {
            const target = new URL(requested || "student/exams.html", root);
            const relative = target.pathname.slice(root.pathname.length);
            if (target.origin === root.origin && target.pathname.startsWith(root.pathname) && allowedPages.includes(relative)) {
                target.hash = "";
                return target.href;
            }
        } catch (error) { /* Fall back to the catalogue. */ }
        return new URL("student/exams.html", root).href;
    }

    function loginDemo(email, password) {
        if (email.trim().toLowerCase() !== "demo@matchday.local" || password !== "Matchday123!") return false;
        // FE simulation only. A real session must be issued and verified by the server.
        sessionStorage.setItem(sessionKey, JSON.stringify({
            version: 1,
            accountId: "demo",
            displayName: "Cầu thủ Demo",
            expiresAt: Date.now() + 8 * 60 * 60 * 1000
        }));
        return true;
    }

    function logout() {
        sessionStorage.removeItem(sessionKey);
        sessionStorage.removeItem("mock-exam-draft");
        sessionStorage.removeItem("mock-exam-result");
        location.replace(new URL("index.html", root).href);
    }

    window.MatchdayAuth = { getSession: getSession, loginDemo: loginDemo, getNextPage: getNextPage, logout: logout, root: root.href };

    function renderAccount() {
        document.querySelectorAll(".md-account").forEach(function (element) {
            if (!getSession()) return;
            const button = document.createElement("button");
            button.type = "button";
            button.className = "md-account";
            button.textContent = "Đăng xuất ↗";
            button.addEventListener("click", logout);
            element.replaceWith(button);
        });
    }
    document.addEventListener("DOMContentLoaded", renderAccount);
    window.addEventListener("pageshow", function () {
        if (document.documentElement.dataset.requiresAuth === "true" && !getSession()) {
            window.MatchdayRequireLogin();
        }
    });
})();
