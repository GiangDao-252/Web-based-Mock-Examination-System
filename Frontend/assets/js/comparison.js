window.MatchdayAuth.ready.then(function () {
if (!window.MatchdayAuth.getSession()) return;
(function () {
    "use strict";
    const select = document.querySelector("#comparison-group");
    const body = document.querySelector("#comparison-body");
    const message = document.querySelector("#comparison-message");
    if (!select || !body || !message) return;
    function date(value) { return new Date(value).toLocaleString("vi-VN"); }
    try {
        const raw = JSON.parse(localStorage.getItem("mock-exam-history") || "[]");
        if (!Array.isArray(raw)) throw new Error("Lịch sử không hợp lệ.");
        const valid = raw.filter(window.ExamStore.validResult).sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
        const groups = new Map(); let legacy = 0;
        valid.forEach(result => {
            const key = window.ExamStore.comparisonKey(result);
            if (!key) { legacy++; return; }
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(result);
        });
        select.replaceChildren();
        const values = Array.from(groups.values()).sort((a, b) => Date.parse(b[b.length - 1].submittedAt) - Date.parse(a[a.length - 1].submittedAt));
        values.forEach((results, i) => {
            const r = results[0]; const option = document.createElement("option"); option.value = String(i);
            option.textContent = r.examTitle + " — v" + r.examVersion + " — " + results.length + " lượt — đầu tiên " + date(r.submittedAt);
            select.append(option);
        });
        function render() {
            body.replaceChildren();
            const results = values[Number(select.value)];
            const hint = legacy ? " Có " + legacy + " lượt cũ thiếu mã đề/phiên bản nên chỉ được xem trong lịch sử, không ghép để so sánh." : "";
            if (!results) { select.disabled = true; message.textContent = "Chưa có lượt làm có đủ thông tin phiên bản. Hoàn thành một lượt mới để bắt đầu." + hint; return; }
            const first = results[0], last = results[results.length - 1];
            message.textContent = results.length > 1 ? "Cùng đề, cùng phiên bản, nội dung và thời lượng. Điểm lượt mới nhất so với lượt đầu: " + (last.score - first.score >= 0 ? "+" : "") + (last.score - first.score).toFixed(2) + "." + hint : "Mới có một lượt cho phiên bản này. Làm lại đúng đề để có số liệu so sánh." + hint;
            [...results].reverse().forEach((r, index) => {
                const row = document.createElement("tr");
                const cells = [String(results.length - index), date(r.submittedAt), r.score.toFixed(2) + " / 10", r.correctQuestions + "/" + r.totalQuestions, r.pageLeaveCount, r.reason === "timeout" ? "Hết giờ" : "Đã nộp"];
                cells.forEach(value => { const td = document.createElement("td"); td.textContent = value; row.append(td); });
                const td = document.createElement("td"), button = document.createElement("button"); button.type = "button"; button.className = "secondary-button"; button.textContent = "Xem bài";
                button.setAttribute("aria-label", "Xem lượt làm ngày " + date(r.submittedAt));
                button.addEventListener("click", () => {
                    try { sessionStorage.setItem("mock-exam-result", JSON.stringify(r)); location.href = "report.html"; }
                    catch (_) { message.textContent = "Không mở được kết quả. Hãy kiểm tra dung lượng lưu trữ trình duyệt."; }
                });
                td.append(button); row.append(td); body.append(row);
            });
        }
        select.addEventListener("change", render); render();
    } catch (error) { select.disabled = true; message.textContent = "Không đọc được dữ liệu so sánh: " + error.message; }
})();
}).catch(function (error) { console.error("Không khởi tạo được trang:", error.message); });
