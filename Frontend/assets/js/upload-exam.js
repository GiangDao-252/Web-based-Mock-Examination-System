(function () {
    "use strict";

    async function init() {
        await window.MatchdayAuth.ready;
        if (!window.MatchdayAuth.getSession()) return;

        const form = document.querySelector("#exam-editor-form");
        if (!form) return;

        const S = window.ExamStore;
        const keys = ["a", "b", "c", "d"];

        const fileInput = document.querySelector("#exam-file");
        const importButton = document.querySelector("#import-exam");
        const message = document.querySelector("#upload-message");
        const titleInput = document.querySelector("#exam-title-input");
        const durationInput = document.querySelector("#exam-duration-input");
        const editor = document.querySelector("#question-editor");
        const preview = document.querySelector("#preview-questions");
        const previewSection = document.querySelector("#exam-preview");
        const saveButton = document.querySelector("#save-exam");
        const savedLink = document.querySelector("#saved-exam-link");

        const subjectSelect = document.querySelector("#exam-subject-input");
        const newSubjectInput = document.querySelector("#new-subject-input");
        const addSubjectButton = document.querySelector("#add-subject");
        const subjectMessage = document.querySelector("#subject-message");

        if (!subjectSelect || !newSubjectInput ||
            !addSubjectButton || !subjectMessage) {
            message.textContent =
                "Thiếu phần chọn môn trong upload-exam.html. " +
                "Hãy thêm HTML môn học trước.";
            saveButton.disabled = true;
            return;
        }

        const editId = new URLSearchParams(location.search).get("edit");

        let original = null;
        let busy = false;
        let touched = false;
        let subjectsReady = false;
        let nextIndex = 0;
        let restoreControls = () => {};

        function status(text) {
            message.textContent = text;
        }

        function setBusy(value) {
            busy = value;

            if (value) {
                const controls = Array.from(new Set([
                    ...form.querySelectorAll("input, select, textarea, button"),
                    fileInput,
                    importButton
                ].filter(Boolean)));

                const previous = controls.map(control => [
                    control,
                    control.disabled
                ]);

                controls.forEach(control => {
                    control.disabled = true;
                });

                restoreControls = () => {
                    previous.forEach(([control, disabled]) => {
                        control.disabled = disabled;
                    });
                };
            } else {
                restoreControls();
                restoreControls = () => {};
                subjectSelect.disabled = !subjectsReady;
                addSubjectButton.disabled = !subjectsReady;
            }
        }

        function invalidatePreview() {
            touched = true;
            window.MatchdayMath.clear(preview);
            previewSection.hidden = true;
            savedLink.hidden = true;
        }

        function blankQuestion() {
            return {
                text: "",
                options: { a: "", b: "", c: "", d: "" },
                correctAnswer: "a",
                explanation: ""
            };
        }

        async function loadSubjects(selectedId = null) {
            subjectsReady = false;
            subjectSelect.disabled = true;
            addSubjectButton.disabled = true;

            const subjects = await window.MatchdayAPI.request("/subjects");

            if (!Array.isArray(subjects)) {
                throw new Error("Danh mục môn trả về không hợp lệ.");
            }

            const fragment = document.createDocumentFragment();
            const empty = document.createElement("option");
            empty.value = "";
            empty.textContent = "Chưa phân loại";
            fragment.append(empty);

            subjects.forEach(subject => {
                const option = document.createElement("option");
                option.value = String(subject.id);
                option.textContent = subject.name +
                    (subject.isShared ? "" : " — môn của tôi");
                fragment.append(option);
            });

            const selected = selectedId == null ? "" : String(selectedId);

            if (selected && !subjects.some(
                subject => String(subject.id) === selected
            )) {
                throw new Error(
                    "Không tìm thấy môn của đề trong danh mục được phép dùng."
                );
            }

            subjectSelect.replaceChildren(fragment);
            subjectSelect.value = selected;
            subjectsReady = true;

            if (!busy) {
                subjectSelect.disabled = false;
                addSubjectButton.disabled = false;
            }
        }

        function field(labelText, value, key, index) {
            const wrap = document.createElement("div");
            wrap.className = "mvp-field";

            const label = document.createElement("label");
            const isAnswer = key === "correctAnswer";
            const input = document.createElement(
                isAnswer ? "select" : "textarea"
            );

            input.id = "editor-" + index + "-" + key;
            input.dataset.field = key;
            label.htmlFor = input.id;
            label.textContent = labelText;

            if (isAnswer) {
                keys.forEach(keyValue => {
                    const option = document.createElement("option");
                    option.value = keyValue;
                    option.textContent = keyValue.toUpperCase();
                    input.append(option);
                });
            } else {
                input.rows = ["text", "explanation"].includes(key) ? 3 : 2;
                input.maxLength = key === "explanation" ? 20000 : 10000;
            }

            input.value = value ?? "";
            input.required = key !== "explanation";
            wrap.append(label, input);
            return wrap;
        }

        function renumber() {
            Array.from(editor.children).forEach((card, index) => {
                card.querySelector("legend").textContent =
                    "Câu " + (index + 1);
                card.querySelector("button").setAttribute(
                    "aria-label", "Xóa câu " + (index + 1)
                );
            });
        }

        function appendQuestion(question) {
            const index = nextIndex++;
            const card = document.createElement("fieldset");
            card.className = "mvp-question-editor";

            card.append(document.createElement("legend"));
            card.append(field(
                "Nội dung câu hỏi", question.text, "text", index
            ));

            const options = document.createElement("div");
            options.className = "mvp-grid";

            keys.forEach(key => {
                options.append(field(
                    "Lựa chọn " + key.toUpperCase(),
                    question.options[key],
                    key,
                    index
                ));
            });

            card.append(
                options,
                field(
                    "Đáp án đúng",
                    question.correctAnswer,
                    "correctAnswer",
                    index
                ),
                field(
                    "Lời giải (không bắt buộc)",
                    question.explanation,
                    "explanation",
                    index
                )
            );

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "mvp-danger";
            remove.textContent = "Xóa câu";

            remove.addEventListener("click", () => {
                if (busy) return;

                if (editor.children.length <= 1) {
                    status("Đề cần có ít nhất một câu hỏi.");
                    return;
                }

                const populated = Array.from(
                    card.querySelectorAll("textarea")
                ).some(input => input.value.trim());

                if (populated &&
                    !confirm("Xóa câu hỏi này khỏi bản đang chỉnh sửa?")) {
                    return;
                }

                card.remove();
                renumber();
                invalidatePreview();
            });

            card.append(remove);
            editor.append(card);
            renumber();
        }

        function collect() {
            return {
                title: titleInput.value.trim(),
                durationMinutes: Number(durationInput.value),
                questions: Array.from(editor.children).map(card => {
                    const get = key => card.querySelector(
                        '[data-field="' + key + '"]'
                    ).value;

                    return {
                        text: get("text"),
                        options: Object.fromEntries(
                            keys.map(key => [key, get(key)])
                        ),
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
                S.validate(exam);
                return exam;
            } catch (error) {
                status(error.message);
                return null;
            }
        }

        function loadExam(exam) {
            window.MatchdayMath.clear(preview);
            preview.replaceChildren();
            titleInput.value = exam.title;
            durationInput.value = exam.durationMinutes;
            editor.replaceChildren();
            exam.questions.forEach(appendQuestion);
            previewSection.hidden = true;
            savedLink.hidden = true;
            touched = false;
        }

        function renderPreview(exam) {
            window.MatchdayMath.clear(preview);
            preview.replaceChildren();

            const subjectName =
                subjectSelect.selectedOptions[0]?.textContent ||
                "Chưa phân loại";

            document.querySelector("#preview-summary").textContent =
                exam.title + " • " + subjectName + " • " +
                exam.durationMinutes + " phút • " +
                exam.questions.length + " câu";

            exam.questions.forEach((question, index) => {
                const card = document.createElement("article");
                card.className = "preview-question";

                const heading = document.createElement("h3");
                heading.className = "mvp-math";
                heading.textContent =
                    "Câu " + (index + 1) + ". " + question.text;

                const options = document.createElement("ul");

                keys.forEach(key => {
                    const item = document.createElement("li");
                    item.className = "mvp-math";
                    item.textContent =
                        key.toUpperCase() + ". " + question.options[key];
                    options.append(item);
                });

                const answer = document.createElement("p");
                answer.textContent =
                    "Đáp án đúng: " + question.correctAnswer.toUpperCase();

                card.append(heading, options, answer);

                if (question.explanation?.trim()) {
                    const explanation = document.createElement("p");
                    explanation.className = "mvp-solution mvp-math";
                    explanation.textContent =
                        "Lời giải: " + question.explanation;
                    card.append(explanation);
                }

                preview.append(card);
            });

            previewSection.hidden = false;
            window.MatchdayMath.render(preview);
        }

        titleInput.addEventListener("input", () => {
            titleInput.setCustomValidity("");
        });

        // Chỉ thay đổi nội dung đề hoặc môn đã chọn mới đánh dấu chưa lưu.
        function onEditorChange(event) {
            if (event.target === newSubjectInput) return;
            invalidatePreview();
        }

        form.addEventListener("input", onEditorChange);
        form.addEventListener("change", onEditorChange);

        document.querySelector("#add-question").addEventListener(
            "click", () => {
                if (busy) return;

                if (editor.children.length >= 100) {
                    status("Mỗi đề tối đa 100 câu.");
                    return;
                }

                appendQuestion(blankQuestion());
                invalidatePreview();
                editor.lastElementChild.querySelector("textarea").focus();
            }
        );

        document.querySelector("#preview-exam").addEventListener(
            "click", () => {
                if (busy) return;
                const exam = checkedExam();
                if (!exam) return;

                renderPreview(exam);
                status("Đã cập nhật bản xem trước.");
            }
        );

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
                const subject = await window.MatchdayAPI.request(
                    "/subjects",
                    { method: "POST", body: { name } }
                );

                await loadSubjects(subject.id);
                newSubjectInput.value = "";
                invalidatePreview();

                subjectMessage.textContent = subject.created
                    ? "Đã thêm và chọn môn “" + subject.name + "”."
                    : "Đã chọn môn có sẵn “" + subject.name + "”.";
            } catch (error) {
                subjectMessage.textContent = error.message;
            } finally {
                setBusy(false);
            }
        });

        importButton.addEventListener("click", async () => {
            if (busy) return;

            const file = fileInput.files[0];

            if (!file) {
                status("Hãy chọn file JSON trước.");
                return;
            }

            if (!/\.json$/i.test(file.name) ||
                file.size > 1024 * 1024) {
                status("Chọn file JSON tối đa 1 MB.");
                return;
            }

            if (touched &&
                !confirm("Thay nội dung đang chỉnh sửa bằng nội dung file?")) {
                return;
            }

            setBusy(true);

            try {
                const data = await window.MatchdayAPI.previewExam(file);

                if (!data || typeof data !== "object" ||
                    Array.isArray(data)) {
                    throw new Error("File phải chứa một đối tượng đề thi.");
                }

                // Không tự dùng subjectId trong file:
                // ID môn phụ thuộc database và tài khoản.
                const prepared = {
                    title: typeof data.title === "string" && data.title.trim()
                        ? data.title.trim()
                        : file.name.replace(/\.json$/i, "").slice(0, 120),
                    durationMinutes: data.durationMinutes ?? 60,
                    questions: data.questions
                };

                S.validate(prepared);
                loadExam(prepared);
                touched = true;
                renderPreview(prepared);

                status(
                    "Đã đọc file. Kiểm tra môn, câu hỏi và đáp án trước khi lưu."
                );
            } catch (error) {
                status("Không đọc được đề: " + error.message);
            } finally {
                setBusy(false);
            }
        });

        form.addEventListener("submit", async event => {
            event.preventDefault();
            if (busy) return;

            if (!subjectsReady) {
                status("Danh mục môn chưa sẵn sàng. Hãy tải lại trang.");
                return;
            }

            const exam = checkedExam();
            if (!exam) return;

            const payload = {
                title: exam.title,
                subjectId: subjectSelect.value
                    ? Number(subjectSelect.value)
                    : null,
                durationMinutes: exam.durationMinutes,
                questions: exam.questions.map(question => ({
                    text: question.text,
                    options: question.options,
                    correctAnswer: question.correctAnswer,
                    ...(question.explanation
                        ? { explanation: question.explanation }
                        : {})
                }))
            };

            if (original) {
                payload.expectedVersion = original.examVersion;
            }

            const path = original
                ? "/exams/" + encodeURIComponent(original.examId)
                : "/exams";

            setBusy(true);
            status("Đang lưu đề…");

            try {
                const saved = await window.MatchdayAPI.request(path, {
                    method: original ? "PUT" : "POST",
                    body: payload
                });

                original = { ...saved, questions: payload.questions };
                touched = false;

                const url = new URL(location.href);
                url.searchParams.set("edit", saved.examId);
                history.replaceState(null, "", url);

                document.querySelector("#editor-title").textContent =
                    "Chỉnh sửa đề đã lưu";

                savedLink.href = "exam.html?examVersionId=" +
                    encodeURIComponent(saved.examVersionId);
                savedLink.hidden = false;

                status(
                    "Đã lưu “" + saved.title + "” — phiên bản " +
                    saved.examVersion + " — " +
                    (saved.subjectName || "Chưa phân loại") + "."
                );
            } catch (error) {
                status(error.status === 409
                    ? "Đề đã thay đổi. Sao chép nội dung đang sửa " +
                      "trước khi tải lại trang."
                    : "Chưa lưu được đề: " + error.message
                );
            } finally {
                setBusy(false);
            }
        });

        window.addEventListener("beforeunload", event => {
            if (!touched && !busy) return;
            event.preventDefault();
            event.returnValue = "";
        });

        setBusy(true);

        try {
            if (editId) {
                original = await window.MatchdayAPI.request(
                    "/exams/" + encodeURIComponent(editId)
                );
            }

            await loadSubjects(original?.subjectId ?? null);

            if (original) {
                const prepared = {
                    title: original.title,
                    durationMinutes: original.durationMinutes,
                    questions: original.questions.map(question => ({
                        text: question.text,
                        options: question.options,
                        correctAnswer: question.correctAnswer,
                        explanation: question.explanation ?? ""
                    }))
                };

                S.validate(prepared);
                loadExam(prepared);

                document.querySelector("#editor-title").textContent =
                    "Chỉnh sửa đề đã lưu";

                status(
                    "Đang sửa phiên bản " + original.examVersion +
                    ". Lưu đề sẽ tạo phiên bản mới."
                );
            } else {
                loadExam({
                    title: "",
                    durationMinutes: 60,
                    questions: [blankQuestion()]
                });
            }
        } catch (error) {
            status("Không khởi tạo được trình biên soạn: " + error.message);
            form.hidden = true;
        } finally {
            setBusy(false);
        }
    }

    init().catch(error => {
        console.error("Không khởi tạo được trang:", error);
        const message = document.querySelector("#upload-message");
        if (message) message.textContent = error.message;
    });
})();