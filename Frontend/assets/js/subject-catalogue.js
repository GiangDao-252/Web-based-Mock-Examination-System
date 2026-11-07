(function () {
    "use strict";

    const sampleList = document.querySelector("#sample-exam-list");
    const list = sampleList || document.querySelector("#my-exams-list");
    if (!list) return;

    const scope = sampleList ? "sample" : "mine";

    let exams = [];
    let subjects = [];
    let selected = "all";
    let loading = false;

    const layout = document.createElement("div");
    layout.className = "md-subject-layout";

    const sidebar = document.createElement("aside");
    sidebar.className = "md-subject-sidebar";

    const heading = document.createElement("h2");
    heading.textContent = "Môn học";

    const nav = document.createElement("nav");
    nav.className = "md-subject-nav";
    nav.setAttribute("aria-label", "Lọc đề theo môn học");

    sidebar.append(heading, nav);

    const results = document.createElement("div");
    results.className = "md-subject-results";

    let message = document.querySelector("#my-exams-message");

    if (!message) {
        message = document.createElement("p");
    }

    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");

    list.before(layout);
    results.append(message, list);
    layout.append(sidebar, results);

    function subjectKey(exam) {
        return exam.subjectId == null
            ? "none"
            : String(exam.subjectId);
    }

    function matches(exam) {
        return selected === "all" || subjectKey(exam) === selected;
    }

    function makeLink(text, href, className) {
        const link = document.createElement("a");
        link.textContent = text;
        link.href = href;
        link.className = className;
        return link;
    }

    function renderSubjects() {
        nav.replaceChildren();

        const categories = [
            { id: "all", name: "Tất cả môn" },
            ...subjects.map(subject => ({
                id: String(subject.id),
                name: subject.name
            })),
            { id: "none", name: "Chưa phân loại" }
        ];

        if (!categories.some(category => category.id === selected)) {
            selected = "all";
        }

        categories.forEach(category => {
            const count = category.id === "all"
                ? exams.length
                : exams.filter(
                    exam => subjectKey(exam) === category.id
                ).length;

            const button = document.createElement("button");
            button.type = "button";
            button.className = "md-subject-button";
            button.dataset.subject = category.id;
            button.setAttribute(
                "aria-pressed",
                String(selected === category.id)
            );

            const name = document.createElement("span");
            name.textContent = category.name;

            const total = document.createElement("span");
            total.className = "md-subject-count";
            total.textContent = String(count);

            button.append(name, total);

            button.addEventListener("click", () => {
                selected = category.id;

                nav.querySelectorAll("button").forEach(item => {
                    item.setAttribute(
                        "aria-pressed",
                        String(item.dataset.subject === selected)
                    );
                });

                renderExams();
            });

            nav.append(button);
        });
    }

    async function downloadExam(exam, button) {
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
            message.textContent = "Không tải được JSON: " + error.message;
        } finally {
            button.disabled = false;
        }
    }

    function renderExams() {
        const filtered = exams.filter(matches);
        list.replaceChildren();

        filtered.forEach(exam => {
            const card = document.createElement("article");
            card.className = "exam-card";

            if (scope === "sample") {
                const badge = document.createElement("span");
                badge.className = "exam-status status-open";
                badge.textContent = "Đề mẫu";
                card.append(badge);
            }

            const title = document.createElement("h3");
            title.className = "my-exam-title";
            title.textContent = exam.title;

            const subject = document.createElement("p");
            subject.className = "md-subject-label";
            subject.textContent = exam.subjectName || "Chưa phân loại";

            const info = document.createElement("p");
            info.textContent =
                exam.questionCount + " câu · " +
                exam.durationMinutes + " phút · v" +
                exam.examVersion;

            const actions = document.createElement("div");
            actions.className = "mvp-actions";

            actions.append(makeLink(
                scope === "sample" ? "Làm đề này →" : "Làm bài",
                "exam.html?examVersionId=" +
                    encodeURIComponent(exam.examVersionId),
                "primary-button"
            ));

            if (scope === "mine") {
                actions.append(makeLink(
                    "Sửa đề",
                    "upload-exam.html?edit=" +
                        encodeURIComponent(exam.examId),
                    "secondary-button"
                ));

                const download = document.createElement("button");
                download.type = "button";
                download.className = "secondary-button";
                download.textContent = "Tải JSON";
                download.addEventListener("click", () => {
                    downloadExam(exam, download);
                });

                const remove = document.createElement("button");
                remove.type = "button";
                remove.className = "mvp-danger";
                remove.textContent = "Xóa đề";

                remove.addEventListener("click", async () => {
                    if (!confirm(
                        "Xóa đề “" + exam.title + "”? " +
                        "Kết quả bài làm cũ vẫn được giữ."
                    )) return;

                    remove.disabled = true;

                    try {
                        await window.MatchdayAPI.request(
                            "/exams/" + encodeURIComponent(exam.examId),
                            { method: "DELETE" }
                        );

                        exams = exams.filter(
                            item => item.examId !== exam.examId
                        );

                        renderSubjects();
                        renderExams();
                    } catch (error) {
                        message.textContent = error.message;
                        remove.disabled = false;
                    }
                });

                actions.append(download, remove);
            }

            card.append(title, subject, info, actions);
            list.append(card);
        });

        message.textContent = filtered.length
            ? "Hiển thị " + filtered.length + " / " +
              exams.length + " đề."
            : "Chưa có đề trong môn đã chọn.";
    }

    async function refresh() {
        if (loading) return;
        loading = true;
        message.textContent = "Đang tải danh mục và đề thi…";

        try {
            const [nextSubjects, nextExams] = await Promise.all([
                window.MatchdayAPI.request("/subjects"),
                window.MatchdayAPI.request("/exams?scope=" + scope)
            ]);

            if (!Array.isArray(nextSubjects) || !Array.isArray(nextExams)) {
                throw new Error("Dữ liệu danh mục hoặc đề thi không hợp lệ.");
            }

            subjects = nextSubjects;
            exams = nextExams;

            renderSubjects();
            renderExams();
        } catch (error) {
            message.textContent = "Không tải được dữ liệu: " + error.message;
        } finally {
            loading = false;
        }
    }

    window.MatchdayAuth.ready.then(async () => {
        if (!window.MatchdayAuth.getSession()) return;
        await refresh();

        // Khi quay lại từ tab tạo đề, cập nhật cả môn mới và số đề.
        window.addEventListener("focus", () => {
            if (window.MatchdayAuth.getSession()) refresh();
        });

        window.addEventListener("pageshow", event => {
            if (event.persisted && window.MatchdayAuth.getSession()) {
                refresh();
            }
        });
    }).catch(error => {
        message.textContent = error.message;
    });
})();