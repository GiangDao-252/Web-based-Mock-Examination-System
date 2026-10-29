(function () {
    "use strict";
    if (document.documentElement.dataset.authBlocked === "true") return;
    const list = document.querySelector("#sample-exam-list");
    if (!list) return;
    const exams = window.sampleExams || [];
    exams.forEach(function (exam) {
        const card = document.createElement("article"); card.className = "exam-card";
        const badge = document.createElement("span"); badge.className = "exam-status status-open"; badge.textContent = exam.subject;
        const title = document.createElement("h2"); title.className = "my-exam-title"; title.textContent = exam.title;
        const description = document.createElement("p"); description.className = "exam-description"; description.textContent = exam.description;
        const detail = document.createElement("p"); detail.className = "md-catalogue-detail"; detail.textContent = exam.questions.length + " câu hỏi · " + exam.durationMinutes + " phút";
        const link = document.createElement("a"); link.className = "primary-button exam-action"; link.href = "exam.html?id=" + encodeURIComponent(exam.id); link.textContent = "Làm đề này →";
        card.append(badge, title, description, detail, link); list.append(card);
    });
})();
