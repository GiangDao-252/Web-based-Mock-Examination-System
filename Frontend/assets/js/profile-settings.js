window.MatchdayAuth.ready.then(function () {
if (!window.MatchdayAuth.getSession()) return;
(function () {
    "use strict";
    const form = document.querySelector("#profile-settings-form");
    if (!form) return;
    const session = window.MatchdayAuth.getSession(); if (!session) return;
    const name = document.querySelector("#profile-display-name");
    const goal = document.querySelector("#profile-goal");
    const message = document.querySelector("#profile-settings-message");
    const key = "mock-exam-profile:" + session.accountId;
    name.value = session.displayName || "";
    try {
        const saved = JSON.parse(localStorage.getItem(key) || "null");
        if (saved && typeof saved.displayName === "string") name.value = saved.displayName;
        if (saved && typeof saved.goal === "string") goal.value = saved.goal;
    } catch (_) { message.textContent = "Không đọc được hồ sơ đã lưu; bạn có thể nhập và lưu lại."; }
    form.addEventListener("submit", event => {
        event.preventDefault();
        name.setCustomValidity(name.value.trim() ? "" : "Hãy nhập tên hiển thị.");
        if (!form.reportValidity()) return;
        try {
            localStorage.setItem(key, JSON.stringify({displayName: name.value.trim(), goal: goal.value.trim(), updatedAt: new Date().toISOString()}));
            message.textContent = "Đã lưu thông tin cá nhân trong trình duyệt này.";
        } catch (_) { message.textContent = "Chưa lưu được hồ sơ. Vui lòng thử lại."; }
    });
    name.addEventListener("input", () => name.setCustomValidity(""));
})();
}).catch(function (error) { console.error("Không khởi tạo được trang:", error.message); });
