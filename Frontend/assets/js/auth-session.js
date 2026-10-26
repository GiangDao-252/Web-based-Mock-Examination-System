(function () {
    "use strict";
    const root = new URL("../../", document.currentScript.src);
    let apiUser = null;
    const apiMode = window.MATCHDAY_API_MODE === true;
    const sessionKey = "mock-exam-session";
    const allowedPages = ["student/profile.html", "student/exams.html", "student/my-exams.html", "student/upload-exam.html", "student/exam.html", "student/report.html"];

    function getSession() {
        if (apiMode) return apiUser;
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
        window.MatchdayAPI.clearToken();
        apiUser = null;
        sessionStorage.removeItem(sessionKey);
        sessionStorage.removeItem("mock-exam-draft");
        sessionStorage.removeItem("mock-exam-result");
        location.replace(new URL("index.html", root).href);
    }

    const ready = apiMode && window.MatchdayAPI.getToken()
        ? window.MatchdayAPI.request("/me").then(function (user) {
            if (!user || user.id === undefined) throw new Error("Thông tin người dùng không hợp lệ.");
            apiUser = {accountId: String(user.id), displayName: user.display_name || user.username || user.email, ...user};
            return apiUser;
        }).catch(function (error) {
            if (error.status === 401) { window.MatchdayAPI.clearToken(); return null; }
            throw error;
        }) : Promise.resolve(getSession());
    window.MatchdayAuth = {ready: ready, apiMode: apiMode, getSession: getSession, loginDemo: loginDemo, getNextPage: getNextPage, logout: logout, root: root.href };

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
    document.addEventListener("DOMContentLoaded", function () {
        ready.then(function () {
            renderAccount();
            const user = getSession();
            if (user) document.querySelectorAll(".md-nav").forEach(function (nav) {
                const label = document.createElement("span"); label.textContent = "Đang đăng nhập: " + user.displayName; nav.after(label);
            });
        }).catch(function () {});
    });
    window.addEventListener("pageshow", function () {
        if (!apiMode && document.documentElement.dataset.requiresAuth === "true" && !getSession()) {
            window.MatchdayRequireLogin();
        }
    });
})();
