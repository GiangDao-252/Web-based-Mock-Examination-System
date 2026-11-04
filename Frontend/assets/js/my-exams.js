(function () {
    "use strict";

    const list = document.querySelector("#my-exams-list");
    const message = document.querySelector("#my-exams-message");
    if (!list || !message) return;

    async function download(exam, button) {
        button.disabled = true;

        try {
            const data = await window.MatchdayAPI.request(
                "/exams/" + encodeURIComponent(exam.examId) + "/download"
            );

            const blob = new Blob(
                [JSON.stringify(data, null, 2)],
                { type: "application/json;charset=utf-8" }
            );
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = "exam-" + exam.examId + ".json";
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
            message.textContent = error.message;
        } finally {
            button.disabled = false;
        }
    }

    async function render() {
        message.textContent = "Đang tải đề của bạn…";

        const exams = await window.MatchdayAPI.request(
            "/exams?scope=mine"
        );

        list.replaceChildren();

        exams.forEach(exam => {
            const card = document.createElement("article");
            card.className = "exam-card";

            const title = document.createElement("h2");
            title.className = "my-exam-title";
            title.textContent = exam.title;

            const info = document.createElement("p");
            info.textContent =
                `${exam.durationMinutes} phút · ` +
                `${exam.questionCount} câu · v${exam.examVersion}`;

            const actions = document.createElement("div");
            actions.className = "mvp-actions";

            const start = document.createElement("a");
            start.className = "primary-button";
            start.textContent = "Làm bài";
            start.href = "exam.html?examVersionId=" +
                encodeURIComponent(exam.examVersionId);

            const edit = document.createElement("a");
            edit.className = "secondary-button";
            edit.textContent = "Sửa đề";
            edit.href = "upload-exam.html?edit=" +
                encodeURIComponent(exam.examId);

            const downloadButton = document.createElement("button");
            downloadButton.type = "button";
            downloadButton.className = "secondary-button";
            downloadButton.textContent = "Tải JSON";
            downloadButton.addEventListener(
                "click", () => download(exam, downloadButton)
            );

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "mvp-danger";
            remove.textContent = "Xóa đề";

            remove.addEventListener("click", async () => {
                if (!confirm(
                    `Xóa đề “${exam.title}”? ` +
                    "Kết quả bài làm cũ vẫn được giữ."
                )) return;

                remove.disabled = true;

                try {
                    await window.MatchdayAPI.request(
                        "/exams/" + encodeURIComponent(exam.examId),
                        { method: "DELETE" }
                    );
                    await render();
                } catch (error) {
                    message.textContent = error.message;
                } finally {
                    remove.disabled = false;
                }
            });

            actions.append(start, edit, downloadButton, remove);
            card.append(title, info, actions);
            list.append(card);
        });

        message.textContent = exams.length
            ? `Bạn có ${exams.length} đề cá nhân.`
            : "Bạn chưa có đề cá nhân. Hãy tải JSON hoặc tạo đề mới.";
    }

    window.MatchdayAuth.ready.then(async () => {
        if (!window.MatchdayAuth.getSession()) return;
        await render();
    }).catch(error => {
        message.textContent = error.message;
    });
})();