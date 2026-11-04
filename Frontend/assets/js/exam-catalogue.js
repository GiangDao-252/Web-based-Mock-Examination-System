(function () {
    "use strict";

    const list = document.querySelector("#sample-exam-list");
    if (!list) return;

    const message = document.createElement("p");
    message.setAttribute("role", "status");
    list.before(message);
    message.textContent = "Đang tải đề mẫu…";

    window.MatchdayAuth.ready.then(async () => {
        if (!window.MatchdayAuth.getSession()) return;

        const exams = await window.MatchdayAPI.request(
            "/exams?scope=sample"
        );

        list.replaceChildren();

        exams.forEach(exam => {
            const card = document.createElement("article");
            card.className = "exam-card";

            const badge = document.createElement("span");
            badge.className = "exam-status status-open";
            badge.textContent = "Đề mẫu";

            const title = document.createElement("h2");
            title.className = "my-exam-title";
            title.textContent = exam.title;

            const detail = document.createElement("p");
            detail.className = "md-catalogue-detail";
            detail.textContent =
                `${exam.questionCount} câu · ` +
                `${exam.durationMinutes} phút · v${exam.examVersion}`;

            const link = document.createElement("a");
            link.className = "primary-button exam-action";
            link.href = "exam.html?examVersionId=" +
                encodeURIComponent(exam.examVersionId);
            link.textContent = "Làm đề này →";

            card.append(badge, title, detail, link);
            list.append(card);
        });

        message.textContent = exams.length
            ? `Có ${exams.length} đề mẫu.`
            : "Chưa có đề mẫu.";
    }).catch(error => {
        message.textContent = error.message;
    });
})();