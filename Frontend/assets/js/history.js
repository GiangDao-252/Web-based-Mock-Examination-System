(function () {
    "use strict";

    window.MatchdayHistoryReady = window.MatchdayAuth.ready.then(async () => {
        if (!window.MatchdayAuth.getSession()) return [];

        const results = await window.MatchdayAPI.request("/attempts");
        if (!Array.isArray(results)) {
            throw new Error("Dữ liệu lịch sử không hợp lệ.");
        }

        return results.sort(
            (a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt)
        );
    });

    window.MatchdayHistoryReady.then(results => {
        const list = document.querySelector("#history-list");
        const message = document.querySelector("#history-message");
        if (!list || !message) return;

        list.replaceChildren();

        const setText = (id, value) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        };

        setText("md-attempts", results.length);
        setText(
            "md-average",
            results.length
                ? (
                    results.reduce((sum, r) => sum + r.score, 0) /
                    results.length
                ).toFixed(2)
                : "—"
        );
        setText(
            "md-best",
            results.length
                ? results.reduce(
                    (best, r) => Math.max(best, r.score), 0
                ).toFixed(2)
                : "—"
        );

        results.slice(0, 3).forEach(result => {
            const card = document.createElement("article");
            card.className = "history-card";

            const title = document.createElement("h3");
            title.textContent = result.examTitle;

            const date = document.createElement("p");
            date.textContent = "Nộp lúc: " +
                new Date(result.submittedAt).toLocaleString("vi-VN");

            const score = document.createElement("p");
            score.textContent =
                `Điểm: ${result.score.toFixed(2)} / 10 — ` +
                `Đúng ${result.correctQuestions}/${result.totalQuestions} câu.`;

            const state = document.createElement("p");
            state.textContent =
                (result.status === "timed_out" ? "Hết giờ" : "Đã nộp") +
                ` · Rời trang: ${result.pageLeaveCount} lần`;

            const link = document.createElement("a");
            link.className = "history-view-button";
            link.textContent = "Xem lại bài làm ↗";
            link.href = "report.html?attemptId=" +
                encodeURIComponent(result.attemptId);

            card.append(title, date, score, state, link);
            list.append(card);
        });

        message.textContent = results.length
            ? `Hiển thị ${Math.min(3, results.length)} lượt gần nhất ` +
              `trong tổng số ${results.length} lượt đã nộp.`
            : "Chưa có lượt đã nộp. Chọn một đề để bắt đầu luyện tập.";
    }).catch(error => {
        const message = document.querySelector("#history-message");
        if (message) message.textContent = error.message;

        ["md-attempts", "md-average", "md-best"].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = "—";
        });
    });
})();