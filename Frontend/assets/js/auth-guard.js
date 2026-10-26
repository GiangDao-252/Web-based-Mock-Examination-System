(function () {
    "use strict";
    function requireLogin() {
        if (window.MatchdayAuth && window.MatchdayAuth.getSession()) return true;
        document.documentElement.dataset.authBlocked = "true";
        document.documentElement.style.visibility = "hidden";
        const root = new URL(window.MatchdayAuth.root);
        const next = location.pathname.slice(root.pathname.length) + location.search;
        const target = new URL("auth/login.html", root);
        target.searchParams.set("next", next);
        location.replace(target.href);
        return false;
    }
    window.MatchdayRequireLogin = requireLogin;
    if (window.MatchdayAuth.apiMode) {
        document.documentElement.style.visibility = "hidden";
        window.MatchdayAuth.ready.then(function () {
            if (requireLogin()) document.documentElement.style.visibility = "";
        }).catch(function () {
            document.addEventListener("DOMContentLoaded", showFailure, {once: true});
            if (document.readyState !== "loading") showFailure();
        });
    } else requireLogin();
    function showFailure() {
        document.documentElement.style.visibility = "";
        document.body.replaceChildren();
        const text = document.createElement("p"); text.textContent = "Không xác minh được phiên với backend. Kiểm tra kết nối rồi tải lại trang.";
        const retry = document.createElement("button"); retry.textContent = "Thử lại"; retry.onclick = function () { location.reload(); };
        document.body.append(text, retry);
    }
})();
