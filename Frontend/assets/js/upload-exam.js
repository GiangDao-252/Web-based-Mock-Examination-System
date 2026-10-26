if (document.documentElement.dataset.authBlocked !== "true") {
(function () {
    "use strict";
    const S = window.ExamStore;
    const form = document.querySelector("#exam-editor-form");
    if (!form) return;
    const fileInput = document.querySelector("#exam-file");
    const message = document.querySelector("#upload-message");
    const titleInput = document.querySelector("#exam-title-input");
    const durationInput = document.querySelector("#exam-duration-input");
    const editor = document.querySelector("#question-editor");
    const preview = document.querySelector("#preview-questions");
    const previewSection = document.querySelector("#exam-preview");
    const saveButton = document.querySelector("#save-exam");
    const editId = new URLSearchParams(location.search).get("edit");
    let original = null;
    let busy = false;
    let touched = false;
    let fileRequest = 0;
    const blankQuestion = () => ({text: "", options: {a: "", b: "", c: "", d: ""}, correctAnswer: "a", explanation: ""});
    function status(text) { message.textContent = text; }
    function invalidatePreview() {
        touched = true;
        window.MatchdayMath.clear(preview);
        previewSection.hidden = true;
    }
    function field(labelText, value, kind, key, index) {
        const wrap = document.createElement("div"); wrap.className = "mvp-field";
        const label = document.createElement("label");
        const input = document.createElement(kind === "select" ? "select" : "textarea");
        input.id = "editor-" + index + "-" + key;
        label.htmlFor = input.id; label.textContent = labelText;
        input.dataset.field = key;
        if (kind === "select") S.keys.forEach(k => { const o = document.createElement("option"); o.value = k; o.textContent = k.toUpperCase(); input.append(o); });
        else { input.rows = key === "text" || key === "explanation" ? 3 : 2; input.maxLength = key === "explanation" ? 20000 : 10000; }
        input.value = value;
        input.required = key !== "explanation";
        wrap.append(label, input); return wrap;
    }
    function renumber() {
        editor.querySelectorAll("fieldset").forEach((card, index) => {
            card.querySelector("legend").textContent = "Câu " + (index + 1);
            card.querySelector("button").setAttribute("aria-label", "Xóa câu " + (index + 1));
        });
    }
    let nextIndex = 0;
    function appendQuestion(q) {
        const index = nextIndex++;
        const card = document.createElement("fieldset"); card.className = "mvp-question-editor";
        card.append(document.createElement("legend"));
        card.append(field("Nội dung câu hỏi", q.text, "textarea", "text", index));
        const options = document.createElement("div"); options.className = "mvp-grid";
        S.keys.forEach(k => options.append(field("Lựa chọn " + k.toUpperCase(), q.options[k], "textarea", k, index)));
        card.append(options, field("Đáp án đúng", q.correctAnswer, "select", "correctAnswer", index), field("Lời giải (không bắt buộc)", q.explanation || "", "textarea", "explanation", index));
        const remove = document.createElement("button"); remove.type = "button"; remove.className = "mvp-danger"; remove.textContent = "Xóa câu";
        remove.addEventListener("click", () => {
            if (editor.children.length <= 1) { status("Đề cần có ít nhất một câu hỏi."); return; }
            const populated = Array.from(card.querySelectorAll("textarea")).some(el => el.value.trim());
            if (populated && !confirm("Xóa câu hỏi này khỏi bản đang chỉnh sửa?")) return;
            card.remove(); renumber(); invalidatePreview();
        });
        card.append(remove); editor.append(card); renumber();
    }
    function collect() {
        return {title: titleInput.value.trim(), durationMinutes: Number(durationInput.value), questions: Array.from(editor.querySelectorAll("fieldset")).map(card => {
            const get = key => card.querySelector('[data-field="' + key + '"]').value;
            return {text: get("text"), options: Object.fromEntries(S.keys.map(k => [k, get(k)])), correctAnswer: get("correctAnswer"), explanation: get("explanation")};
        })};
    }
    function load(exam) {
        titleInput.value = exam.title; durationInput.value = exam.durationMinutes;
        editor.replaceChildren(); exam.questions.forEach(appendQuestion);
        previewSection.hidden = true; touched = false;
    }
    function renderPreview(exam) {
        window.MatchdayMath.clear(preview); preview.replaceChildren();
        document.querySelector("#preview-summary").textContent = exam.title + " • " + exam.durationMinutes + " phút • " + exam.questions.length + " câu • Mỗi câu có trọng số bằng nhau.";
        exam.questions.forEach((q, i) => {
            const card = document.createElement("article"); card.className = "preview-question";
            const h = document.createElement("h3"); h.className = "mvp-math"; h.textContent = "Câu " + (i + 1) + ". " + q.text;
            const list = document.createElement("ul");
            S.keys.forEach(k => { const li = document.createElement("li"); li.className = "mvp-math"; li.textContent = k.toUpperCase() + ". " + q.options[k]; list.append(li); });
            const answer = document.createElement("p"); answer.textContent = "Đáp án đúng: " + q.correctAnswer.toUpperCase(); card.append(h, list, answer);
            if (q.explanation.trim()) { const solution = document.createElement("p"); solution.className = "mvp-solution mvp-math"; solution.textContent = "Lời giải: " + q.explanation; card.append(solution); }
            preview.append(card);
        });
        previewSection.hidden = false; window.MatchdayMath.render(preview);
    }
    function checkedExam() {
        titleInput.setCustomValidity(titleInput.value.trim() ? "" : "Vui lòng nhập tên bài thi.");
        if (!form.reportValidity()) return null;
        try { return S.validate(collect()); } catch (error) { status(error.message); return null; }
    }
    titleInput.addEventListener("input", () => titleInput.setCustomValidity(""));
    form.addEventListener("input", invalidatePreview);
    form.addEventListener("change", invalidatePreview);
    document.querySelector("#add-question").addEventListener("click", () => {
        if (editor.children.length >= 100) { status("Mỗi đề tối đa 100 câu."); return; }
        appendQuestion(blankQuestion()); invalidatePreview(); editor.lastElementChild.querySelector("textarea").focus();
    });
    document.querySelector("#preview-exam").addEventListener("click", () => {
        const exam = checkedExam(); if (!exam) return; renderPreview(exam); status("Đã cập nhật bản xem trước. Bạn có thể tiếp tục chỉnh sửa hoặc lưu đề.");
    });
    document.querySelector("#import-exam").addEventListener("click", async () => {
        const file = fileInput.files[0];
        if (!file) { status("Hãy chọn file JSON trước."); return; }
        if (!/\.json$/i.test(file.name) || file.size > 1024 * 1024) { status("Chọn file JSON tối đa 1 MB. PDF và Word chưa được hỗ trợ trong MVP."); return; }
        if (touched && !confirm("Thay nội dung đang chỉnh sửa bằng nội dung file?")) return;
        const token = ++fileRequest;
        try {
            const data = JSON.parse(await file.text());
            if (token !== fileRequest) return;
            if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("File phải chứa một đối tượng đề thi.");
            const prepared = {...data, title: typeof data.title === "string" && data.title.trim() ? data.title.trim() : file.name.replace(/\.json$/i, "").slice(0, 120), durationMinutes: data.durationMinutes === undefined ? 60 : data.durationMinutes};
            S.validate(prepared); load(prepared); touched = true; renderPreview(prepared);
            status("Đã đọc file. Kiểm tra câu hỏi, đáp án và lời giải trước khi lưu.");
        } catch (error) { status("Không đọc được đề: " + error.message); }
    });
    form.addEventListener("submit", event => {
        event.preventDefault(); if (busy) return;
        const exam = checkedExam(); if (!exam) return;
        busy = true; saveButton.disabled = true;
        try {
            const saved = S.save(exam, original); original = JSON.parse(JSON.stringify(saved)); touched = false;
            history.replaceState(null, "", "upload-exam.html?edit=" + encodeURIComponent(saved.id));
            document.querySelector("#editor-title").textContent = "Chỉnh sửa đề đã lưu";
            status("Đã lưu “" + saved.title + "” — phiên bản " + saved.examVersion + ". Lịch sử bài làm cũ được giữ nguyên.");
            renderPreview(saved);
            const link = document.querySelector("#saved-exam-link"); link.href = "exam.html?id=" + encodeURIComponent(saved.id); link.hidden = false;
        } catch (error) { status("Chưa lưu được đề: " + error.message); }
        finally { busy = false; saveButton.disabled = false; }
    });
    window.addEventListener("beforeunload", event => { if (touched) { event.preventDefault(); event.returnValue = ""; } });
    try {
        if (editId) {
            original = S.readExams().find(e => e && e.id === editId);
            if (!original) throw new Error("Không tìm thấy đề cá nhân để chỉnh sửa.");
            S.validate(original); load(original);
            document.querySelector("#editor-title").textContent = "Chỉnh sửa đề đã lưu";
            status("Đang sửa phiên bản " + S.revision(original) + ". Lưu nội dung thay đổi sẽ tạo phiên bản tiếp theo.");
        } else load({title: "", durationMinutes: 60, questions: [blankQuestion()]});
    } catch (error) { status(error.message); form.hidden = true; }
})();
}
