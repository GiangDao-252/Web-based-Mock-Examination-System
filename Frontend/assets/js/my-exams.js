if (document.documentElement.dataset.authBlocked !== "true") {
const myExamsList = document.querySelector("#my-exams-list");

if (myExamsList) {
    const message = document.querySelector("#my-exams-message");

    try {
        const savedData = localStorage.getItem("mock-exams");

        const exams = savedData === null
            ? []
            : JSON.parse(savedData);

        if (!Array.isArray(exams)) {
            throw new Error("Danh sách đề không đúng cấu trúc.");
        }

        const isValid = exams.every(function (exam) {
            return (
                exam !== null &&
                typeof exam === "object" &&
                typeof exam.id === "string" &&
                exam.id.length > 0 &&
                typeof exam.title === "string" &&
                exam.title.trim().length > 0 &&
                Number.isInteger(exam.durationMinutes) &&
                exam.durationMinutes >= 1 &&
                exam.durationMinutes <= 180 &&
                Array.isArray(exam.questions) &&
                exam.questions.length >= 1 &&
                exam.questions.length <= 100
            );
        });

        if (!isValid) {
            throw new Error("Một số đề đã lưu có thông tin không hợp lệ.");
        }

        myExamsList.replaceChildren();

        if (exams.length === 0) {
            message.textContent =
                "Bạn chưa lưu đề nào. Hãy chọn “Tải thêm đề” để bắt đầu.";
        } else {
            message.textContent =
                "Bạn đã lưu " + exams.length + " đề.";

            exams.forEach(function (exam) {
                const card = document.createElement("article");
                card.className = "exam-card";

                const title = document.createElement("h2");
                title.className = "my-exam-title";
                title.textContent = exam.title;

                const details = document.createElement("p");
                details.className = "exam-description";

                details.textContent =
                    exam.durationMinutes + " phút • " +
                    exam.questions.length + " câu hỏi";

                const startLink = document.createElement("a");

                startLink.className = "primary-button exam-action";
                startLink.textContent = "Làm bài";
                startLink.href = "exam.html?id=" + encodeURIComponent(exam.id);
                    
                card.append(title, details, startLink);

                myExamsList.append(card);
            });
        }
    } catch (error) {
        message.textContent =
            "Không đọc được danh sách đề. " + error.message;
    }
}
}
