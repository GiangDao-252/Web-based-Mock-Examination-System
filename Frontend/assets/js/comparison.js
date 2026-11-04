(function () {
    "use strict";

    const select = document.querySelector("#comparison-group");
    const body = document.querySelector("#comparison-body");
    const message = document.querySelector("#comparison-message");

    if (!select || !body || !message) return;

    select.disabled = true;
    message.textContent = "Đang tải dữ liệu so sánh…";

    window.MatchdayHistoryReady.then(history => {
        const groups = new Map();

        history.forEach(result => {
            const key = result.examVersionId;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(result);
        });

        const values = Array.from(groups.values());
        select.replaceChildren();

        values.forEach((results, index) => {
            results.sort(
                (a, b) =>
                    Date.parse(a.submittedAt) - Date.parse(b.submittedAt)
            );

            const first = results[0];
            const option = document.createElement("option");

            option.value = String(index);
            option.textContent =
                `${first.examTitle} — v${first.examVersion} — ` +
                `${results.length} lượt`;

            select.append(option);
        });

        function render() {
            body.replaceChildren();

            const results = values[Number(select.value)];

            if (!results) {
                select.disabled = true;
                message.textContent = "Chưa có kết quả để so sánh.";
                return;
            }

            select.disabled = false;

            const first = results[0];
            const last = results[results.length - 1];
            const change = last.score - first.score;

            message.textContent = results.length > 1
                ? "Cùng đề và cùng phiên bản. " +
                  "Điểm lượt mới nhất so với lượt đầu: " +
                  (change >= 0 ? "+" : "") + change.toFixed(2) +
                  ". Điều kiện thực tế của các lượt có thể khác nhau."
                : "Mới có một lượt cho phiên bản này.";

            [...results].reverse().forEach((result, index) => {
                const row = document.createElement("tr");

                [
                    results.length - index,
                    new Date(result.submittedAt).toLocaleString("vi-VN"),
                    result.score.toFixed(2) + " / 10",
                    `${result.correctQuestions}/${result.totalQuestions}`,
                    result.pageLeaveCount,
                    result.status === "timed_out" ? "Hết giờ" : "Đã nộp"
                ].forEach(value => {
                    const cell = document.createElement("td");
                    cell.textContent = String(value);
                    row.append(cell);
                });

                const cell = document.createElement("td");
                const link = document.createElement("a");

                link.className = "secondary-button";
                link.textContent = "Xem bài";
                link.href = "report.html?attemptId=" +
                    encodeURIComponent(result.attemptId);

                cell.append(link);
                row.append(cell);
                body.append(row);
            });
        }

        select.addEventListener("change", render);
        render();
    }).catch(error => {
        body.replaceChildren();
        message.textContent = error.message;
    });
})();