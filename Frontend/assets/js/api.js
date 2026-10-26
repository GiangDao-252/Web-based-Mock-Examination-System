(function () {
    "use strict";
    const base = "http://127.0.0.1:8000/api/v1";
    const key = "matchday-access-token";
    async function request(path, options = {}) {
        const headers = new Headers({Accept: "application/json"});
        const token = sessionStorage.getItem(key);
        if (options.auth !== false && token) headers.set("Authorization", "Bearer " + token);
        let body;
        if (options.body !== undefined) {
            body = options.form ? new URLSearchParams(options.body) : JSON.stringify(options.body);
            headers.set("Content-Type", options.form ? "application/x-www-form-urlencoded" : "application/json");
        }
        const response = await fetch(base + path, {method: options.method || "GET", headers, body});
        const data = response.status === 204 ? null : await response.json();
        if (!response.ok) { const error = new Error(typeof data?.detail === "string" ? data.detail : "Không thực hiện được yêu cầu."); error.status = response.status; throw error; }
        return data;
    }
    window.MatchdayAPI = {request, clearToken: () => sessionStorage.removeItem(key), getToken: () => sessionStorage.getItem(key), async login(username, password) {
        const result = await request("/token", {method: "POST", auth: false, form: true, body: {username, password}});
        if (typeof result.access_token !== "string" || !result.access_token) throw new Error("Token không hợp lệ.");
        sessionStorage.setItem(key, result.access_token); return result;
    }};
})();
