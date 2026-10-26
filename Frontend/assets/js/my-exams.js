if (document.documentElement.dataset.authBlocked !== "true") {
(function () {
    const list = document.querySelector("#my-exams-list");
    const message = document.querySelector("#my-exams-message");
    if (!list || !message) return;
    function render() {
        list.replaceChildren();
        try {
            const exams = window.ExamStore.readExams(); let count = 0;
            exams.forEach(exam => {
                try { window.ExamStore.validate(exam); if (typeof exam.id !== "string" || !exam.id) return; } catch (_) { return; }
                count++;
                const card = document.createElement("article"); card.className = "exam-card";
                const title = document.createElement("h2"); title.textContent = exam.title; title.className = "my-exam-title";
                const info = document.createElement("p"); info.textContent = exam.durationMinutes + " phút • " + exam.questions.length + " câu • Phiên bản " + window.ExamStore.revision(exam);
                const actions = document.createElement("div"); actions.className = "mvp-actions";
                const start = document.createElement("a"); start.className = "primary-button"; start.textContent = "Làm bài"; start.href = "exam.html?id=" + encodeURIComponent(exam.id);
                const edit = document.createElement("a"); edit.className = "secondary-button"; edit.textContent = "Sửa đề"; edit.href = "upload-exam.html?edit=" + encodeURIComponent(exam.id);
                const remove = document.createElement("button"); remove.type = "button"; remove.className = "mvp-danger"; remove.textContent = "Xóa đề"; remove.setAttribute("aria-label", "Xóa đề " + exam.title);
                remove.addEventListener("click", () => {
                    if (!confirm("Xóa đề “" + exam.title + "”? Các kết quả và bài làm cũ vẫn được giữ lại.")) return;
                    try { window.ExamStore.remove(exam.id); render(); } catch (_) { message.textContent = "Chưa xóa được đề. Vui lòng thử lại."; }
                });
                actions.append(start, edit, remove); card.append(title, info, actions); list.append(card);
            });
            message.textContent = count ? "Bạn có " + count + " đề cá nhân trong trình duyệt này." : "Bạn chưa có đề. Hãy tải JSON hoặc tự tạo đề mới.";
            if (count < exams.length) message.textContent += " Một số đề không hợp lệ chưa được hiển thị.";
        } catch (error) { message.textContent = "Không đọc được danh sách đề: " + error.message; }
    }
    render(); window.addEventListener("storage", e => { if (e.key === "mock-exams") render(); });
})();
}
