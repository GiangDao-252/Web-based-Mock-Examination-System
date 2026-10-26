if (document.documentElement.dataset.authBlocked !== "true") {
(function () {
    const examForm = document.querySelector("#exam-form");

    if (!examForm) {
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const examId = params.get("id");

    if (!examId) {
        examForm.dataset.loadError = "true";
        window.location.replace("exams.html");
        return;
    }

    const examNote = document.querySelector(".exam-note");

    try {
        const savedData = localStorage.getItem("mock-exams");

        const exams = savedData === null
            ? []
            : JSON.parse(savedData);

        if (!Array.isArray(exams)) {
            throw new Error("Danh sách đề không hợp lệ.");
        }

        const availableExams = [...(window.sampleExams || []), ...exams];

        const exam = availableExams.find(function (item) {
            return item && item.id === examId;
        });

        if (!exam) {
            throw new Error("Không tìm thấy đề đã chọn.");
        }

        const keys = ["a", "b", "c", "d"];

        const isText = function (value) {
            return typeof value === "string" && value.trim().length > 0;
        };

        if (
            !isText(exam.title) ||
            !Number.isInteger(exam.durationMinutes) ||
            exam.durationMinutes < 1 ||
            exam.durationMinutes > 180 ||
            !Array.isArray(exam.questions) ||
            exam.questions.length < 1 ||
            exam.questions.length > 100
        ) {
            throw new Error("Thông tin đề không hợp lệ.");
        }

        const validQuestions = exam.questions.every(function (question) {
            return (
                question &&
                isText(question.text) &&
                question.options &&
                keys.every(function (key) {
                    return isText(question.options[key]);
                }) &&
                keys.includes(question.correctAnswer)
            );
        });

        if (!validQuestions) {
            throw new Error("Nội dung câu hỏi hoặc đáp án không hợp lệ.");
        }

        const questionGrid = document.querySelector(".question-grid");
        const questionActions = examForm.querySelector(".question-actions");

        examForm.querySelectorAll(".question-card").forEach(function (card) {
            card.remove();
        });

        questionGrid.replaceChildren();

        exam.questions.forEach(function (question, index) {
            const number = String(index + 1);

            const navigationButton = document.createElement("button");
            navigationButton.type = "button";
            navigationButton.className = "question-button";
            navigationButton.dataset.question = number;
            navigationButton.textContent = number;

            questionGrid.append(navigationButton);

            const card = document.createElement("fieldset");
            card.className = "question-card";
            card.dataset.question = number;
            card.tabIndex = -1;

            const legend = document.createElement("legend");
            legend.textContent = "Câu " + number + ". " + question.text;

            card.append(legend);

            keys.forEach(function (key) {
                const label = document.createElement("label");
                label.className = "answer-option";

                const input = document.createElement("input");
                input.type = "radio";
                input.name = "question-" + number;
                input.value = key;
                input.required = true;

                const text = document.createElement("span");
                text.textContent =
                    key.toUpperCase() + ". " + question.options[key];

                label.append(input, text);
                card.append(label);
            });

            examForm.insertBefore(card, questionActions);
        });

        document.querySelector(".exam-main h1").textContent = exam.title;

        examNote.textContent =
            exam.questions.length + " câu hỏi • " +
            exam.durationMinutes + " phút. Thời gian bắt đầu khi mở trang.";

        examForm.dataset.examId = exam.id;
        examForm.examData = exam;
        examForm.dataset.durationMinutes = String(exam.durationMinutes);
    } catch (error) {
        examForm.dataset.loadError = "true";

        document.querySelector(".exam-layout").hidden = true;

        examNote.textContent =
            "Không mở được đề. " + error.message +
            " Hãy quay lại mục “Đề của tôi”.";
    }
})();
}
