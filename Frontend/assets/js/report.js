(function () {
    "use strict";

    const message = document.querySelector("#report-message");
    if (!message) return;

    const section = document.querySelector("#answer-review");
    const list = document.querySelector("#review-list");
    const filter = document.querySelector("#review-filter");
    const filterMessage = document.querySelector("#review-filter-message");

    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = String(value);
    };

    async function initialize() {
        await window.MatchdayAuth.ready;
        if (!window.MatchdayAuth.getSession()) return;

        const attemptId = new URLSearchParams(location.search)
            .get("attemptId");

        if (!attemptId) {
            message.textContent =
                "Hãy mở kết quả từ lịch sử trên trang cá nhân.";
            return;
        }

        message.textContent = "Đang tải kết quả…";
        section.hidden = true;
        list.replaceChildren();

        const result = await window.MatchdayAPI.request(
            "/attempts/" + encodeURIComponent(attemptId) + "/report"
        );

        setText("report-total", result.totalQuestions);
        setText("report-answered", result.answeredQuestions);
        setText(
            "report-unanswered",
            result.totalQuestions - result.answeredQuestions
        );
        setText("report-correct", result.correctQuestions);
        setText("report-wrong", result.wrongQuestions);
        setText("report-score", result.score.toFixed(2));
        setText("report-page-leaves", result.pageLeaveCount);

        const finish = result.status === "timed_out"
            ? "Kết thúc do hết thời gian."
            : "Đã nộp bài.";

        message.textContent =
            `${result.examTitle} — ${finish} Kết quả được lấy từ máy chủ.`;

        const focus = document.querySelector("#focus-report");
        if (focus) {
            focus.hidden = false;
            setText(
                "report-exam-version",
                "Phiên bản đề: " + result.examVersion
            );
            setText("report-finish-state", finish);
            setText(
                "report-timings",
                "Bắt đầu: " +
                new Date(result.startedAt).toLocaleString("vi-VN") +
                " · Kết thúc: " +
                new Date(result.endedAt).toLocaleString("vi-VN") +
                " · Máy chủ nhận bài: " +
                new Date(result.submittedAt).toLocaleString("vi-VN")
            );
            setText(
                "focus-events-message",
                `Ghi nhận ${result.pageLeaveCount} lần rời trang. ` +
                "API hiện chưa trả nhật ký thời gian từng lần."
            );

            const table = document.querySelector("#focus-table-wrap");
            if (table) table.hidden = true;
        }

        const keys = ["a", "b", "c", "d"];
        const cards = [];

        result.questions.forEach(question => {
            const card = document.createElement("article");
            card.className = "review-card";

            const state = question.selectedAnswer === null
                ? "unanswered"
                : question.selectedAnswer === question.correctAnswer
                    ? "correct"
                    : "wrong";

            card.dataset.status = state;
            card.classList.add("review-" + state);

            const title = document.createElement("h3");
            title.className = "mvp-math";
            title.textContent =
                `Câu ${question.questionNumber}. ${question.text}`;

            const status = document.createElement("p");
            status.className = "review-status";
            status.textContent = {
                correct: "Đúng",
                wrong: "Sai",
                unanswered: "Chưa trả lời"
            }[state];

            card.append(title, status);

            keys.forEach(key => {
                const option = document.createElement("p");
                option.className = "mvp-choice mvp-math";
                option.classList.toggle(
                    "is-correct", key === question.correctAnswer
                );
                option.classList.toggle(
                    "is-selected", key === question.selectedAnswer
                );
                option.textContent =
                    key.toUpperCase() + ". " + question.options[key] +
                    (key === question.correctAnswer
                        ? " — Đáp án đúng" : "") +
                    (key === question.selectedAnswer
                        ? " — Bạn đã chọn" : "");
                card.append(option);
            });

            const explanation = document.createElement("p");
            explanation.className = question.explanation
                ? "mvp-solution mvp-math"
                : "mvp-hint";
            explanation.textContent = question.explanation
                ? "Lời giải: " + question.explanation
                : "Câu hỏi này chưa có lời giải.";
            card.append(explanation);

            cards.push(card);
            list.append(card);
        });

        function applyFilter() {
            let count = 0;

            cards.forEach(card => {
                const visible = filter.value === "all" ||
                    card.dataset.status === filter.value;
                card.hidden = !visible;
                if (visible) count++;
            });

            filterMessage.textContent =
                `Đang hiển thị ${count}/${cards.length} câu.`;
        }

        filter.value = "all";
        filter.addEventListener("change", applyFilter);
        applyFilter();
        section.hidden = false;

        // Lỗi hiển thị công thức không được làm mất kết quả bài thi.
        try {
            if (window.MatchdayMath?.render) {
                await window.MatchdayMath.render(section);
            }
        } catch (error) {
            setText(
                "math-status",
                "Chưa hiển thị được công thức; nội dung văn bản vẫn còn."
            );
        }
    }

    initialize().catch(error => {
        message.textContent = error.status === 404
            ? "Không tìm thấy kết quả thuộc tài khoản này."
            : error.message;
    });
})();