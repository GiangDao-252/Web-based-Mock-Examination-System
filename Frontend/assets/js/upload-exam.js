(function () {
    "use strict";

    const keys = ["a", "b", "c", "d"];
    const $ = (selector) => document.querySelector(selector);
    const asText = (value) => typeof value === "string" ? value : "";
    const warningStrings = (value) => Array.isArray(value)
        ? value.filter((item) => typeof item === "string" && item.trim())
        : [];

    function element(tag, text, className) {
        const node = document.createElement(tag);
        if (text != null) node.textContent = text;
        if (className) node.className = className;
        return node;
    }

    function blankQuestion() {
        return {
            text: "",
            options: { a: "", b: "", c: "", d: "" },
            correctAnswer: "",
            explanation: ""
        };
    }

    function normalizeQuestion(question) {
        if (!question || typeof question !== "object" || Array.isArray(question)) {
            throw new Error("Dữ liệu câu hỏi không hợp lệ.");
        }
        return {
            text: asText(question.text),
            options: Object.fromEntries(
                keys.map((key) => [key, asText(question.options?.[key])])
            ),
            correctAnswer: keys.includes(question.correctAnswer)
                ? question.correctAnswer
                : "",
            explanation: asText(question.explanation)
        };
    }

    function normalizeDraft(exam, fallbackTitle = "") {
        if (!Array.isArray(exam?.questions) ||
            exam.questions.length < 1 || exam.questions.length > 100) {
            throw new Error("Bản nháp phải có từ 1 đến 100 câu hỏi.");
        }
        return {
            title: (asText(exam.title).trim() || fallbackTitle).slice(0, 120),
            durationMinutes: exam.durationMinutes ?? "",
            questions: exam.questions.map(normalizeQuestion)
        };
    }

    async function init() {
        const auth = window.MatchdayAuth;
        await auth.ready;
        if (!auth.getSession()) return;

        const form = $("#exam-editor-form");
        if (!form) return;

        const api = window.MatchdayAPI;
        const store = window.ExamStore;
        const math = window.MatchdayMath;

        const fileInput = $("#exam-file");
        const importButton = $("#import-exam");
        const importMessage = $("#import-message");
        const warningBox = $("#import-warnings");
        const editorTitle = $("#editor-title");
        const titleInput = $("#exam-title-input");
        const durationInput = $("#exam-duration-input");
        const editor = $("#question-editor");
        const preview = $("#preview-questions");
        const previewSection = $("#exam-preview");
        const savedLink = $("#saved-exam-link");

        const subjectSelect = $("#exam-subject-input");
        const newSubjectInput = $("#new-subject-input");
        const addSubjectButton = $("#add-subject");
        const subjectMessage = $("#subject-message");
        const editId = new URLSearchParams(location.search).get("edit");

        let original = null;
        let busy = false;
        let touched = false;
        let subjectsReady = false;
        let nextIndex = 0;
        let previousControls = [];
        let currentWarnings = [];

        const status = (text) => { $("#upload-message").textContent = text; };
        const importStatus = (text) => { importMessage.textContent = text; };

        function setBusy(value) {
            busy = value;

            if (value) {
                const controls = [
                    ...form.querySelectorAll("input, select, textarea, button"),
                    fileInput,
                    importButton
                ];
                previousControls = controls.map((control) => {
                    const wasDisabled = control.disabled;
                    control.disabled = true;
                    return [control, wasDisabled];
                });
                return;
            }

            for (const [control, wasDisabled] of previousControls) {
                control.disabled = wasDisabled;
            }
            previousControls = [];

            subjectSelect.disabled = !subjectsReady;
            addSubjectButton.disabled = !subjectsReady;
            importButton.disabled = !subjectsReady;
            $("#save-exam").disabled = !subjectsReady;
        }

        function invalidatePreview() {
            touched = true;
            math.clear(preview);
            previewSection.hidden = true;
            savedLink.hidden = true;
        }

        function showImportWarnings(warnings) {
            currentWarnings = warningStrings(warnings);
            warningBox.replaceChildren();
            warningBox.hidden = currentWarnings.length === 0;
            if (warningBox.hidden) return;

            const list = element("ul");
            for (const warning of currentWarnings) {
                list.append(element("li", warning));
            }
            warningBox.append(element("p", "Nội dung cần kiểm tra:"), list);
        }

        async function loadSubjects(selectedId = null) {
            const subjects = await api.request("/subjects");
            if (!Array.isArray(subjects)) {
                throw new Error("Danh mục môn trả về không hợp lệ.");
            }

            const selected = selectedId == null ? "" : String(selectedId);
            if (selected && !subjects.some((subject) => String(subject.id) === selected)) {
                throw new Error("Không tìm thấy môn đã chọn trong danh mục.");
            }

            const empty = element("option", "Chưa phân loại");
            empty.value = "";
            const options = subjects.map((subject) => {
                const name = subject.name + (subject.isShared ? "" : " — môn của tôi");
                const option = element("option", name);
                option.value = String(subject.id);
                return option;
            });

            subjectSelect.replaceChildren(empty, ...options);
            subjectSelect.value = selected;
            subjectsReady = true;
        }

        function field(labelText, value, key, index) {
            const wrap = element("div", null, "mvp-field");
            const label = element("label", labelText);
            const isAnswer = key === "correctAnswer";
            const input = element(isAnswer ? "select" : "textarea");

            input.id = `editor-${index}-${key}`;
            input.dataset.field = key;
            input.required = key !== "explanation";
            label.htmlFor = input.id;

            if (isAnswer) {
                const empty = element("option", "— Chọn đáp án đúng —");
                empty.value = "";
                input.append(empty);

                for (const answer of keys) {
                    const option = element("option", answer.toUpperCase());
                    option.value = answer;
                    input.append(option);
                }
            } else {
                input.rows = ["text", "explanation"].includes(key) ? 3 : 2;
                input.maxLength = key === "explanation" ? 20000 : 10000;
            }

            input.value = value ?? "";
            wrap.append(label, input);
            return wrap;
        }

        function renumber() {
            Array.from(editor.children).forEach((card, index) => {
                card.querySelector("legend").textContent = `Câu ${index + 1}`;
                card.querySelector("button").setAttribute("aria-label", `Xóa câu ${index + 1}`);
            });
        }

        function appendQuestion(question) {
            const index = nextIndex++;
            const card = element("fieldset", null, "mvp-question-editor");
            const options = element("div", null, "mvp-grid");

            for (const key of keys) {
                options.append(field(
                    `Lựa chọn ${key.toUpperCase()}`, question.options[key], key, index
                ));
            }

            const remove = element("button", "Xóa câu", "mvp-danger");
            remove.type = "button";
            remove.addEventListener("click", () => {
                if (busy) return;
                if (editor.children.length <= 1) {
                    status("Đề cần có ít nhất một câu hỏi.");
                    return;
                }

                const populated = Array.from(card.querySelectorAll("textarea, select"))
                    .some((input) => input.value.trim());

                if (populated && !confirm("Xóa câu hỏi này khỏi bản đang chỉnh sửa?")) return;

                card.remove();
                renumber();
                invalidatePreview();
            });

            card.append(
                element("legend"),
                field("Nội dung câu hỏi", question.text, "text", index),
                options,
                field("Đáp án đúng", question.correctAnswer, "correctAnswer", index),
                field("Lời giải (không bắt buộc)", question.explanation, "explanation", index),
                remove
            );
            editor.append(card);
        }

        function collect() {
            return {
                title: titleInput.value.trim(),
                durationMinutes: durationInput.value,
                questions: Array.from(editor.children, (card) => {
                    const get = (key) => card.querySelector(`[data-field="${key}"]`).value;
                    return {
                        text: get("text"),
                        options: Object.fromEntries(keys.map((key) => [key, get(key)])),
                        correctAnswer: get("correctAnswer"),
                        explanation: get("explanation")
                    };
                })
            };
        }

        function checkedExam() {
            titleInput.setCustomValidity(
                titleInput.value.trim() ? "" : "Vui lòng nhập tên bài thi."
            );
            if (!form.reportValidity()) return null;

            try {
                const exam = collect();
                exam.durationMinutes = Number(exam.durationMinutes);
                store.validate(exam);
                return exam;
            } catch (error) {
                status(error.message);
                return null;
            }
        }

        function loadExam(exam) {
            math.clear(preview);
            preview.replaceChildren();
            previewSection.hidden = true;
            savedLink.hidden = true;
            titleInput.setCustomValidity("");
            titleInput.value = exam.title;
            durationInput.value = exam.durationMinutes ?? "";
            editor.replaceChildren();
            exam.questions.forEach(appendQuestion);
            renumber();
            touched = false;
        }

        function renderPreview(exam) {
            math.clear(preview);
            preview.replaceChildren();

            const subjectName =
                subjectSelect.selectedOptions[0]?.textContent || "Chưa phân loại";

            $("#preview-summary").textContent =
                `${exam.title} • ${subjectName} • ` +
                `${exam.durationMinutes} phút • ${exam.questions.length} câu`;

            exam.questions.forEach((question, index) => {
                const card = element("article", null, "preview-question");
                const options = element("ul");

                for (const key of keys) {
                    options.append(element(
                        "li", `${key.toUpperCase()}. ${question.options[key]}`, "mvp-math"
                    ));
                }

                card.append(
                    element("h3", `Câu ${index + 1}. ${question.text}`, "mvp-math"),
                    options,
                    element("p", `Đáp án đúng: ${question.correctAnswer.toUpperCase()}`)
                );

                if (question.explanation?.trim()) {
                    card.append(element(
                        "p", `Lời giải: ${question.explanation}`, "mvp-solution mvp-math"
                    ));
                }
                preview.append(card);
            });

            previewSection.hidden = false;
            math.render(preview);
        }

        titleInput.addEventListener("input", () => titleInput.setCustomValidity(""));
        fileInput.addEventListener("change", () => importStatus(""));

        function onEditorChange(event) {
            if (event.target !== newSubjectInput) invalidatePreview();
        }

        form.addEventListener("input", onEditorChange);
        form.addEventListener("change", onEditorChange);

        $("#add-question").addEventListener("click", () => {
            if (busy) return;
            if (editor.children.length >= 100) {
                status("Mỗi đề tối đa 100 câu.");
                return;
            }
            appendQuestion(blankQuestion());
            renumber();
            invalidatePreview();
            editor.lastElementChild.querySelector("textarea").focus();
        });

        $("#preview-exam").addEventListener("click", () => {
            if (busy) return;
            const exam = checkedExam();
            if (!exam) return;
            renderPreview(exam);
            status("Đã cập nhật bản xem trước.");
        });

        addSubjectButton.addEventListener("click", async () => {
            if (busy || !subjectsReady) return;
            const name = newSubjectInput.value.replace(/\s+/g, " ").trim();

            if (!name) {
                subjectMessage.textContent = "Vui lòng nhập tên môn.";
                newSubjectInput.focus();
                return;
            }

            setBusy(true);
            subjectMessage.textContent = "Đang thêm môn…";

            try {
                const subject = await api.request("/subjects", {
                    method: "POST",
                    body: { name }
                });
                await loadSubjects(subject.id);
                newSubjectInput.value = "";
                invalidatePreview();
                subjectMessage.textContent = `Đã chọn môn “${subject.name}”.`;
            } catch (error) {
                subjectMessage.textContent = error.message;
            } finally {
                setBusy(false);
            }
        });

        importButton.addEventListener("click", async () => {
            if (busy || !subjectsReady) return;

            const file = fileInput.files[0];
            if (!file) {
                importStatus("Hãy chọn file đề thi trước.");
                return;
            }

            const extension = file.name.toLowerCase().match(/\.(json|docx|pdf)$/)?.[1];
            if (!extension) {
                importStatus("Chỉ hỗ trợ JSON, DOCX và PDF.");
                return;
            }
            if (file.size === 0) {
                importStatus("File đang trống.");
                return;
            }

            const isJson = extension === "json";
            const maxMB = isJson ? 1 : 10;

            if (file.size > maxMB * 1024 * 1024) {
                importStatus(`File ${isJson ? "JSON" : "Word/PDF"} tối đa ${maxMB} MB.`);
                return;
            }

            if ((touched || original) &&
                !confirm("Thay nội dung trong trình chỉnh sửa bằng nội dung file?")) {
                return;
            }

            setBusy(true);
            importStatus(extension === "pdf"
                ? "Đang đọc PDF. Bản scan có thể mất thêm thời gian để nhận dạng chữ…"
                : "Đang đọc file…");

            try {
                let prepared;
                let warnings = [];

                if (isJson) {
                    const data = await api.previewExam(file);
                    prepared = {
                        title: data.title,
                        durationMinutes: data.durationMinutes,
                        questions: data.questions
                    };
                    store.validate(prepared);
                } else {
                    const body = new FormData();
                    body.append("file", file);

                    const result = await api.request("/exams/convert", {
                        method: "POST",
                        body,
                        timeoutMs: extension === "pdf" ? 150000 : 15000
                    });

                    prepared = normalizeDraft(
                        result?.exam,
                        file.name.replace(/\.[^.]+$/, "")
                    );

                    warnings = warningStrings(result.warnings);
                    result.exam.questions.forEach((question, index) => {
                        const source = Number.isInteger(question.sourceNumber)
                            ? ` (câu gốc ${question.sourceNumber})`
                            : "";
                        for (const warning of warningStrings(question.warnings)) {
                            warnings.push(`Câu ${index + 1}${source}: ${warning}`);
                        }
                    });
                }

                loadExam(prepared);
                touched = true;
                showImportWarnings(warnings);

                const count = prepared.questions.length;
                const answered = prepared.questions.filter(
                    (question) => keys.includes(question.correctAnswer)
                ).length;

                importStatus(`Đã nhập ${count} câu · Có đáp án: ${answered}/${count}.`);

                if (isJson) {
                    renderPreview(prepared);
                    status("Kiểm tra môn học và nội dung trước khi lưu.");
                } else {
                    status(
                        "Đối chiếu nội dung và đáp án với file gốc. " +
                        "Bổ sung thời lượng và các đáp án còn thiếu trước khi lưu đề."
                    );
                }

                if (warnings.length) {
                    warningBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
                } else {
                    editorTitle.focus({ preventScroll: true });
                    editorTitle.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            } catch (error) {
                importStatus(`Không đọc được đề: ${error.message}`);
            } finally {
                setBusy(false);
            }
        });

        async function getDraftKey() {
            const user = await api.request("/me");
            if (user?.id == null) {
                throw new Error("Không xác định được tài khoản.");
            }
            return `matchday:exam-draft:${user.id}:${original?.examId ?? "new"}`;
        }

        $("#save-exam-draft").addEventListener("click", async () => {
            if (busy || !subjectsReady) return;
            setBusy(true);

            try {
                const key = await getDraftKey();
                localStorage.setItem(key, JSON.stringify({
                    exam: collect(),
                    subjectId: subjectSelect.value,
                    examVersion: original?.examVersion ?? null,
                    warnings: currentWarnings
                }));
                touched = false;
                status("Đã lưu nháp trên trình duyệt này.");
            } catch (error) {
                status(`Không lưu được bản nháp: ${error.message}`);
            } finally {
                setBusy(false);
            }
        });

        $("#restore-exam-draft").addEventListener("click", async () => {
            if (busy || !subjectsReady) return;
            if (touched && !confirm("Thay nội dung đang chỉnh sửa bằng bản nháp đã lưu?")) return;

            setBusy(true);

            try {
                const key = await getDraftKey();
                const raw = localStorage.getItem(key);
                if (!raw) {
                    status("Chưa có bản nháp đã lưu cho đề này.");
                    return;
                }

                const draft = JSON.parse(raw);
                const exam = normalizeDraft(draft?.exam);

                if (draft.examVersion !== (original?.examVersion ?? null) &&
                    !confirm("Bản nháp thuộc phiên bản cũ. Bạn vẫn muốn mở để đối chiếu?")) {
                    return;
                }

                loadExam(exam);
                subjectSelect.value = Array.from(subjectSelect.options).some(
                    (option) => option.value === draft.subjectId
                ) ? draft.subjectId : "";

                showImportWarnings(draft.warnings);
                importStatus("");
                touched = true;
                status("Đã mở bản nháp. Hãy kiểm tra nội dung trước khi lưu đề.");
            } catch (error) {
                status(`Không mở được bản nháp: ${error.message}`);
            } finally {
                setBusy(false);
            }
        });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (busy || !subjectsReady) return;

            const exam = checkedExam();
            if (!exam) return;

            const payload = {
                title: exam.title,
                subjectId: subjectSelect.value ? Number(subjectSelect.value) : null,
                durationMinutes: exam.durationMinutes,
                questions: exam.questions.map((question) => ({
                    text: question.text,
                    options: question.options,
                    correctAnswer: question.correctAnswer,
                    ...(question.explanation.trim()
                        ? { explanation: question.explanation }
                        : {})
                }))
            };

            if (original) payload.expectedVersion = original.examVersion;

            const path = original
                ? `/exams/${encodeURIComponent(original.examId)}`
                : "/exams";

            setBusy(true);
            status("Đang lưu đề…");

            try {
                const saved = await api.request(path, {
                    method: original ? "PUT" : "POST",
                    body: payload
                });

                original = { ...saved, questions: payload.questions };
                touched = false;

                const url = new URL(location.href);
                url.searchParams.set("edit", saved.examId);
                history.replaceState(null, "", url);

                editorTitle.textContent = "Chỉnh sửa đề đã lưu";
                savedLink.href = "exam.html?examVersionId=" +
                    encodeURIComponent(saved.examVersionId);
                savedLink.hidden = false;

                status(
                    `Đã lưu “${saved.title}” — phiên bản ${saved.examVersion} — ` +
                    `${saved.subjectName || "Chưa phân loại"}.`
                );
            } catch (error) {
                status(error.status === 409
                    ? "Đề đã thay đổi. Hãy lưu nháp trước khi tải lại trang."
                    : `Chưa lưu được đề: ${error.message}`);
            } finally {
                setBusy(false);
            }
        });

        window.addEventListener("beforeunload", (event) => {
            if (!touched && !busy) return;
            event.preventDefault();
            event.returnValue = "";
        });

        setBusy(true);

        try {
            if (editId) {
                original = await api.request(`/exams/${encodeURIComponent(editId)}`);
            }

            await loadSubjects(original?.subjectId ?? null);

            if (original) {
                const exam = normalizeDraft(original);
                store.validate(exam);
                loadExam(exam);
                editorTitle.textContent = "Chỉnh sửa đề đã lưu";
                status(`Đang sửa phiên bản ${original.examVersion}. Lưu đề sẽ tạo phiên bản mới.`);
            } else {
                loadExam({
                    title: "",
                    durationMinutes: 60,
                    questions: [blankQuestion()]
                });
            }
        } catch (error) {
            status(`Không khởi tạo được trình biên soạn: ${error.message}`);
            form.hidden = true;
            subjectsReady = false;
        } finally {
            setBusy(false);
        }
    }

    init().catch((error) => {
        console.error("Không khởi tạo được trang:", error);
        const message = $("#upload-message");
        if (message) message.textContent = error.message;
    });
})();