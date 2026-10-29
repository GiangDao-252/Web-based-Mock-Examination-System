window.MatchdayAuth.ready.then(function () {
if (!window.MatchdayAuth.getSession()) return;
(function () {
    "use strict";
    const list = document.querySelector("#history-list");
    const message = document.querySelector("#history-message");
    if (!list || !message) return;
    list.replaceChildren();
    try {
        const saved = localStorage.getItem("mock-exam-history");
        const history = saved === null ? [] : JSON.parse(saved);
        if (!Array.isArray(history)) throw new Error("Dữ liệu lịch sử không hợp lệ.");
        const keys = ["a", "b", "c", "d"];
        const valid = history.filter(function (r) {
            if (!r || Array.isArray(r) || r.version !== 1 || typeof r.examTitle !== "string" || !r.examTitle.trim() ||
                typeof r.submittedAt !== "string" || !Number.isFinite(Date.parse(r.submittedAt)) ||
                !Number.isSafeInteger(r.totalQuestions) || r.totalQuestions <= 0 ||
                !Number.isSafeInteger(r.answeredQuestions) || r.answeredQuestions < 0 || r.answeredQuestions > r.totalQuestions ||
                !Number.isSafeInteger(r.correctQuestions) || r.correctQuestions < 0 || r.correctQuestions > r.answeredQuestions ||
                r.wrongQuestions !== r.answeredQuestions - r.correctQuestions ||
                !Number.isSafeInteger(r.pageLeaveCount) || r.pageLeaveCount < 0 ||
                !Number.isFinite(r.score) || r.score !== Number((r.correctQuestions / r.totalQuestions * 10).toFixed(2)) ||
                !["manual", "timeout"].includes(r.reason) || !Array.isArray(r.questions) || r.questions.length !== r.totalQuestions) return false;
            if (!r.questions.every(function (q, i) {
                return q && !Array.isArray(q) && q.questionNumber === i + 1 && typeof q.questionText === "string" && q.questionText.trim() &&
                    (q.selectedAnswer === null || keys.includes(q.selectedAnswer)) && keys.includes(q.correctAnswer);
            })) return false;
            return r.questions.filter(function (q) { return q.selectedAnswer !== null; }).length === r.answeredQuestions &&
                r.questions.filter(function (q) { return q.selectedAnswer === q.correctAnswer; }).length === r.correctQuestions;
        });
        valid.sort(function (a, b) { return Date.parse(b.submittedAt) - Date.parse(a.submittedAt); });
        const recent = valid.slice(0, 3);
        const fragment = document.createDocumentFragment();
        recent.forEach(function (result) {
            const card = document.createElement("article"); card.className = "history-card";
            const title = document.createElement("h3"); title.textContent = result.examTitle.trim();
            const date = document.createElement("p"); date.textContent = "Nộp lúc: " + new Date(result.submittedAt).toLocaleString("vi-VN");
            const score = document.createElement("p"); score.textContent = "Điểm: " + result.score.toFixed(2) + " / 10 — Đúng " + result.correctQuestions + " / " + result.totalQuestions + " câu.";
            const state = document.createElement("p"); state.textContent = result.reason === "timeout" ? "Kết thúc do hết thời gian." : "Đã nộp bài.";
            const button = document.createElement("button"); button.type = "button"; button.className = "history-view-button"; button.textContent = "Xem lại bài làm ↗";
            button.setAttribute("aria-label", "Xem lại " + result.examTitle.trim() + ", nộp lúc " + new Date(result.submittedAt).toLocaleString("vi-VN"));
            button.addEventListener("click", function () {
                try { sessionStorage.setItem("mock-exam-result", JSON.stringify(result)); window.location.href = "report.html"; }
                catch (error) { message.textContent = "Không mở được kết quả. Vui lòng thử lại."; }
            });
            card.append(title, date, score, state, button); fragment.append(card);
        });
        list.append(fragment);
        message.textContent = recent.length ? "Đang hiển thị " + recent.length + " lượt gần nhất trong tổng số " + valid.length + " lượt thi hợp lệ đã lưu." : "Chưa có lượt thi hợp lệ. Vào làm bài để bắt đầu trận đấu đầu tiên.";
        if (history.length > valid.length) message.textContent += " Một số bản ghi thiếu dữ liệu đã được bỏ qua.";
    } catch (error) {
        message.textContent = "Không đọc được lịch sử làm bài trong trình duyệt này.";
        console.error(error);
    }
})();

}).catch(function (error) { console.error("Không khởi tạo được trang:", error.message); });
