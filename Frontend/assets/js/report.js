if (document.documentElement.dataset.authBlocked !== "true") {
const reportMessage = document.querySelector("#report-message");

if (reportMessage) {
    initializeReport();
}

function initializeReport() {
    // 1. Tìm các ô thống kê.
    const totalElement = document.querySelector("#report-total");
    const answeredElement = document.querySelector("#report-answered");
    const unansweredElement = document.querySelector("#report-unanswered");
    const correctElement = document.querySelector("#report-correct");
    const wrongElement = document.querySelector("#report-wrong");
    const scoreElement = document.querySelector("#report-score");
    const pageLeavesElement = document.querySelector("#report-page-leaves");

    const reviewSection = document.querySelector("#answer-review");

    const resultElements = [
        totalElement,
        answeredElement,
        unansweredElement,
        correctElement,
        wrongElement,
        scoreElement,
        pageLeavesElement
    ];

    // 2. Kiểm tra giao diện.
    const requiredElements = [
        ...resultElements,
        reviewSection
    ];

    if (requiredElements.some(function (element) {
        return element === null;
    })) {
        reportMessage.textContent =
            "Trang kết quả thiếu thành phần HTML cần thiết.";

        console.error(
            "Kiểm tra các ID report-total, report-answered, " +
            "report-unanswered, report-correct, report-wrong, " +
            "report-score, report-page-leaves và answer-review."
        );

        return;
    }

    // Tạo danh sách nếu HTML chưa có.
    let reviewList = reviewSection.querySelector("#review-list");

    if (!reviewList) {
        reviewList = document.createElement("div");
        reviewList.id = "review-list";
        reviewSection.append(reviewList);
    }

    // 3. Đặt trạng thái ban đầu.
    resultElements.forEach(function (element) {
        element.textContent = "—";
    });

    reviewList.replaceChildren();
    reviewSection.hidden = true;

    try {
        // 4. Đọc kết quả.
        const savedResult = sessionStorage.getItem("mock-exam-result");

        if (savedResult === null) {
            reportMessage.textContent =
                "Chưa có kết quả. Hãy hoàn thành và nộp một bài thi trước.";

            return;
        }

        const result = JSON.parse(savedResult);

        // 5. Kiểm tra các thông số tổng hợp.
        const summaryIsValid =
            result !== null &&
            typeof result === "object" &&
            !Array.isArray(result) &&
            result.version === 1 &&
            typeof result.examTitle === "string" &&
            result.examTitle.trim().length > 0 &&
            Number.isSafeInteger(result.totalQuestions) &&
            result.totalQuestions > 0 &&
            Number.isSafeInteger(result.answeredQuestions) &&
            result.answeredQuestions >= 0 &&
            result.answeredQuestions <= result.totalQuestions &&
            Number.isSafeInteger(result.correctQuestions) &&
            result.correctQuestions >= 0 &&
            result.correctQuestions <= result.answeredQuestions &&
            Number.isSafeInteger(result.wrongQuestions) &&
            result.wrongQuestions ===
                result.answeredQuestions - result.correctQuestions &&
            Number.isFinite(result.score) &&
            result.score === Number(
                (result.correctQuestions / result.totalQuestions * 10)
                    .toFixed(2)
            ) &&
            Number.isSafeInteger(result.pageLeaveCount) &&
            result.pageLeaveCount >= 0 &&
            (result.reason === "manual" || result.reason === "timeout");

        if (!summaryIsValid) {
            reportMessage.textContent =
                "Dữ liệu kết quả không hợp lệ hoặc thuộc phiên bản cũ. " +
                "Hãy làm và nộp lại bài thi.";

            return;
        }

        // 6. Kiểm tra chi tiết từng câu.
        const answerKeys = ["a", "b", "c", "d"];

        const detailsAreValid =
            Array.isArray(result.questions) &&
            result.questions.length === result.totalQuestions &&
            result.questions.every(function (question, index) {
                return (
                    question !== null &&
                    typeof question === "object" &&
                    !Array.isArray(question) &&
                    question.questionNumber === index + 1 &&
                    typeof question.questionText === "string" &&
                    question.questionText.trim().length > 0 &&
                    (
                        question.selectedAnswer === null ||
                        answerKeys.includes(question.selectedAnswer)
                    ) &&
                    answerKeys.includes(question.correctAnswer)
                );
            });

        // Đối chiếu thống kê nếu có chi tiết hợp lệ.
        if (detailsAreValid) {
            const actualAnswered = result.questions.filter(
                function (question) {
                    return question.selectedAnswer !== null;
                }
            ).length;

            const actualCorrect = result.questions.filter(
                function (question) {
                    return question.selectedAnswer === question.correctAnswer;
                }
            ).length;

            if (
                actualAnswered !== result.answeredQuestions ||
                actualCorrect !== result.correctQuestions
            ) {
                reportMessage.textContent =
                    "Thống kê không khớp với chi tiết bài làm. " +
                    "Hãy làm và nộp lại bài thi.";

                return;
            }
        }

        // 7. Hiển thị thống kê.
        totalElement.textContent = result.totalQuestions;
        answeredElement.textContent = result.answeredQuestions;

        unansweredElement.textContent =
            result.totalQuestions - result.answeredQuestions;

        correctElement.textContent = result.correctQuestions;
        wrongElement.textContent = result.wrongQuestions;
        scoreElement.textContent = result.score.toFixed(2);
        pageLeavesElement.textContent = result.pageLeaveCount;

        const finishMessage = result.reason === "timeout"
            ? "Bài thi đã kết thúc do hết thời gian."
            : "Bạn đã nộp bài.";

        reportMessage.textContent =
            result.examTitle.trim() + " — " +
            finishMessage +
            " Kết quả được lưu trong trình duyệt, " +
            "chưa được gửi lên máy chủ.";

        // 8. Chuẩn bị bộ lọc.
        let reviewFilter = reviewSection.querySelector("#review-filter");
        let filterMessage = reviewSection.querySelector(
            "#review-filter-message"
        );

        // Tự tạo bộ lọc nếu HTML chưa có.
        if (!reviewFilter) {
            const filterContainer = document.createElement("div");
            filterContainer.className = "review-filter";

            const label = document.createElement("label");
            label.htmlFor = "review-filter";
            label.textContent = "Hiển thị câu hỏi";

            reviewFilter = document.createElement("select");
            reviewFilter.id = "review-filter";

            const filterOptions = [
                { value: "all", text: "Tất cả câu hỏi" },
                { value: "correct", text: "Câu đúng" },
                { value: "wrong", text: "Câu sai" },
                { value: "unanswered", text: "Câu chưa trả lời" }
            ];

            filterOptions.forEach(function (item) {
                const option = document.createElement("option");
                option.value = item.value;
                option.textContent = item.text;
                reviewFilter.append(option);
            });

            filterContainer.append(label, reviewFilter);

            reviewList.before(filterContainer);
        }

        if (!filterMessage) {
            filterMessage = document.createElement("p");
            filterMessage.id = "review-filter-message";
            filterMessage.setAttribute("role", "status");

            reviewList.before(filterMessage);
        }

        // Hiện thông báo rõ nếu kết quả cũ thiếu chi tiết.
        if (!detailsAreValid) {
            reviewFilter.disabled = true;

            filterMessage.textContent =
                "Kết quả này thiếu chi tiết câu hỏi hợp lệ. " +
                "Hãy làm và nộp lại bài thi để xem đáp án.";

            reviewSection.hidden = false;
            return;
        }

        // 9. Tạo thẻ xem lại từng câu.
        const fragment = document.createDocumentFragment();
        const reviewCards = [];

        result.questions.forEach(function (question) {
            const card = document.createElement("article");
            card.className = "review-card";

            const title = document.createElement("h3");
            title.textContent = question.questionText.trim();

            const status = document.createElement("p");
            status.className = "review-status";

            if (question.selectedAnswer === null) {
                card.dataset.status = "unanswered";
                card.classList.add("review-unanswered");
                status.textContent = "Chưa trả lời";
            } else if (
                question.selectedAnswer === question.correctAnswer
            ) {
                card.dataset.status = "correct";
                card.classList.add("review-correct");
                status.textContent = "Đúng";
            } else {
                card.dataset.status = "wrong";
                card.classList.add("review-wrong");
                status.textContent = "Sai";
            }

            const selected = document.createElement("p");

            selected.textContent = question.selectedAnswer === null
                ? "Đáp án của bạn: chưa chọn"
                : "Đáp án của bạn: " +
                    question.selectedAnswer.toUpperCase();

            const correct = document.createElement("p");

            correct.textContent =
                "Đáp án đúng: " + question.correctAnswer.toUpperCase();

            card.append(title, status, selected, correct);

            reviewCards.push(card);
            fragment.append(card);
        });

        reviewList.append(fragment);

        // 10. Lọc câu hỏi.
        function applyReviewFilter() {
            const allowedFilters = [
                "all",
                "correct",
                "wrong",
                "unanswered"
            ];

            const filterValue = allowedFilters.includes(reviewFilter.value)
                ? reviewFilter.value
                : "all";

            let visibleCount = 0;

            reviewCards.forEach(function (card) {
                const shouldShow =
                    filterValue === "all" ||
                    card.dataset.status === filterValue;

                card.hidden = !shouldShow;

                if (shouldShow) {
                    visibleCount += 1;
                }
            });

            filterMessage.textContent = visibleCount === 0
                ? "Không có câu hỏi thuộc nhóm này."
                : "Đang hiển thị " + visibleCount +
                    " / " + reviewCards.length + " câu.";
        }

        reviewFilter.disabled = false;
        reviewFilter.value = "all";
        reviewFilter.onchange = applyReviewFilter;

        applyReviewFilter();

        reviewSection.hidden = false;
    } catch (error) {
        // 11. Xử lý lỗi.
        resultElements.forEach(function (element) {
            element.textContent = "—";
        });

        reviewList.replaceChildren();
        reviewSection.hidden = true;

        reportMessage.textContent =
            "Không đọc hoặc hiển thị được kết quả bài làm. " +
            "Vui lòng quay lại trang cá nhân.";

        console.error(error);
    }
}
}
