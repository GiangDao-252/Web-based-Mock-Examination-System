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
    requireLogin();
})();
