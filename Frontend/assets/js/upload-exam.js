if (document.documentElement.dataset.authBlocked !== "true") {
const uploadForm = document.querySelector("#upload-exam-form");

if (uploadForm) {
    const fileInput = uploadForm.querySelector("#exam-file");
    const previewButton = uploadForm.querySelector("#preview-exam");
    const uploadMessage = uploadForm.querySelector("#upload-message");

    const previewSection = document.querySelector("#exam-preview");
    const previewSummary = document.querySelector("#preview-summary");
    const previewQuestions = document.querySelector("#preview-questions");
    const saveButton = document.querySelector("#save-exam");
    const titleInput = document.querySelector("#exam-title-input");
    const durationInput = document.querySelector("#exam-duration-input");

    let uploadedExam = null;

    function isNonEmptyText(value) {
        return typeof value === "string" && value.trim().length > 0;
    }

    function validateExam(data) {
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            throw new Error("Nội dung file phải là một đối tượng đề thi.");
        }

        if (!isNonEmptyText(data.title)) {
            throw new Error("Đề thi cần có tên.");
        }

        if (
            !Number.isInteger(data.durationMinutes) ||
            data.durationMinutes < 1 ||
            data.durationMinutes > 180
        ) {
            throw new Error("Thời lượng phải là số nguyên từ 1 đến 180 phút.");
        }

        if (
            !Array.isArray(data.questions) ||
            data.questions.length < 1 ||
            data.questions.length > 100
        ) {
            throw new Error("Đề thi phải có từ 1 đến 100 câu hỏi.");
        }

        const optionKeys = ["a", "b", "c", "d"];

        data.questions.forEach(function (question, index) {
            const questionNumber = index + 1;

            if (!question || !isNonEmptyText(question.text)) {
                throw new Error("Câu " + questionNumber + " thiếu nội dung.");
            }

            if (
                !question.options ||
                typeof question.options !== "object" ||
                Array.isArray(question.options) ||
                Object.keys(question.options).length !== 4
            ) {
                throw new Error(
                    "Câu " + questionNumber + " phải có bốn lựa chọn a, b, c, d."
                );
            }

            optionKeys.forEach(function (key) {
                if (!isNonEmptyText(question.options[key])) {
                    throw new Error(
                        "Câu " + questionNumber +
                        " thiếu lựa chọn " + key.toUpperCase() + "."
                    );
                }
            });

            if (!optionKeys.includes(question.correctAnswer)) {
                throw new Error(
                    "Đáp án đúng của câu " + questionNumber +
                    " phải là a, b, c hoặc d."
                );
            }
        });
    }

    function updateExamSettings() {
        saveButton.disabled = true;
        if (!uploadedExam) return false;
        const title = titleInput.value.trim();
        titleInput.setCustomValidity(title ? "" : "Vui lòng nhập tên bài thi.");
        if (!titleInput.checkValidity() || !durationInput.checkValidity()) {
            previewSummary.textContent = "Hãy nhập tên bài thi và thời lượng hợp lệ trước khi lưu.";
            return false;
        }
        const duration = Number(durationInput.value);
        if (!Number.isInteger(duration) || duration < 1 || duration > 180) return false;
        uploadedExam.title = title;
        uploadedExam.durationMinutes = duration;
        previewSummary.textContent = title + " • " + duration + " phút • " + uploadedExam.questions.length + " câu";
        saveButton.disabled = false;
        return true;
    }
    titleInput.addEventListener("input", updateExamSettings);
    durationInput.addEventListener("input", updateExamSettings);

    function renderPreview(exam) {
        previewSummary.textContent =
            exam.title.trim() +
            " • " + exam.durationMinutes + " phút" +
            " • " + exam.questions.length + " câu";
    
        previewQuestions.replaceChildren();
    
        exam.questions.forEach(function (question, index) {
            const card = document.createElement("article");
            card.className = "preview-question";
    
            const heading = document.createElement("h3");
            heading.textContent = "Câu " + (index + 1) + ". " + question.text;
    
            const optionsList = document.createElement("ul");
    
            ["a", "b", "c", "d"].forEach(function (key) {
                const option = document.createElement("li");
    
                option.textContent =
                    key.toUpperCase() + ". " + question.options[key];
    
                optionsList.append(option);
            });
    
            const answer = document.createElement("p");
            answer.textContent =
                "Đáp án đúng: " + question.correctAnswer.toUpperCase();
    
            card.append(heading, optionsList, answer);
            previewQuestions.append(card);
        });
    
        previewSection.hidden = false;
    }
    
    fileInput.addEventListener("change", function () {
        uploadedExam = null;
    
        previewSection.hidden = true;
        previewQuestions.replaceChildren();
    
        uploadMessage.textContent = "";
        saveButton.disabled = true;
    });
    
    previewButton.addEventListener("click", async function () {
        if (!uploadForm.reportValidity()) {
            return;
        }
    
        uploadedExam = null;
        previewSection.hidden = true;
        saveButton.disabled = true;
        uploadMessage.textContent = "";
    
        const file = fileInput.files[0];
    
        if (!file.name.toLowerCase().endsWith(".json")) {
            uploadMessage.textContent = "Vui lòng chọn file có đuôi .json.";
            return;
        }
    
        if (file.size > 1024 * 1024) {
            uploadMessage.textContent = "File đề không được lớn hơn 1 MB.";
            return;
        }
    
        previewButton.disabled = true;
        fileInput.disabled = true;
    
        try {
            const content = await file.text();
    
            const data = JSON.parse(content);
    
            if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Nội dung file phải là một đối tượng đề thi.");
            const preparedExam = {
                ...data,
                title: typeof data.title === "string" && data.title.trim() ? data.title.trim().slice(0, 120) : file.name.replace(/\.json$/i, "").slice(0, 120),
                durationMinutes: Number.isInteger(data.durationMinutes) && data.durationMinutes >= 1 && data.durationMinutes <= 180 ? data.durationMinutes : 60
            };
            validateExam(preparedExam);
            uploadedExam = preparedExam;
            titleInput.disabled = false;
            durationInput.disabled = false;
            titleInput.setCustomValidity("");
            titleInput.value = preparedExam.title;
            durationInput.value = String(preparedExam.durationMinutes);

            renderPreview(uploadedExam);
            updateExamSettings();

            saveButton.disabled = false;
            saveButton.textContent = "Lưu đề";

            uploadMessage.textContent =
                "Đề đúng cấu trúc. Hãy kiểm tra nội dung và đáp án bên dưới.";
        } catch (error) {
            uploadMessage.textContent = error instanceof SyntaxError
                ? "File không đúng cú pháp JSON. Kiểm tra dấu ngoặc và dấu phẩy."
                : error.message;
        } finally {
            previewButton.disabled = false;
            fileInput.disabled = false;
        }
    });
    
    saveButton.addEventListener("click", function () {
        if (!uploadedExam) {
            uploadMessage.textContent =
                "Hãy kiểm tra đề trước khi lưu.";
    
            return;
        }
    
        if (!updateExamSettings()) {
            titleInput.reportValidity();
            if (titleInput.checkValidity()) durationInput.reportValidity();
            uploadMessage.textContent = "Vui lòng kiểm tra tên bài thi và thời gian làm bài.";
            return;
        }
        try {
            const savedData = localStorage.getItem("mock-exams");
    
            const exams = savedData === null
                ? []
                : JSON.parse(savedData);
    
            if (!Array.isArray(exams)) {
                throw new Error("Danh sách đề đã lưu không đúng cấu trúc.");
            }
    
            const newExam = {
                id: crypto.randomUUID(),
                version: 1,
                title: uploadedExam.title.trim(),
                durationMinutes: uploadedExam.durationMinutes,
                questions: uploadedExam.questions,
                createdAt: new Date().toISOString()
            };
    
            exams.push(newExam);
    
            localStorage.setItem(
                "mock-exams",
                JSON.stringify(exams)
            );
    
            saveButton.disabled = true;
            saveButton.textContent = "Đã lưu đề";
            titleInput.disabled = true;
            durationInput.disabled = true;
    
            uploadMessage.textContent =
                'Đã lưu đề "' + newExam.title +
                '". Bạn có thể xem trong mục “Đề của tôi”.';
        } catch (error) {
            uploadMessage.textContent =
                "Không lưu được đề. " + error.message;
        }
    });

    previewButton.disabled = false;
}
}
