window.MatchdayAuth.ready.then(function () {
if (!window.MatchdayAuth.getSession()) return;
const examForm = document.querySelector("#exam-form");

if (examForm && examForm.dataset.loadError !== "true") {
    prepareExam();
}

function examIdentity(exam) {
    return JSON.stringify([exam.id, window.ExamStore.revision(exam), window.ExamStore.fingerprint(exam)]);
}
function prepareExam() {
    const exam = examForm.examData;
    const gate = document.querySelector("#exam-preflight");
    const layout = document.querySelector(".exam-layout");
    const monitorPanel = document.querySelector(".exam-monitor");
    const timer = document.querySelector(".exam-header");
    const startButton = document.querySelector("#start-exam");
    if (!exam || !gate || !startButton) return;
    timer.hidden = true; layout.hidden = true; monitorPanel.hidden = true;
    document.querySelector("#preflight-summary").textContent = exam.title + " • Phiên bản " + window.ExamStore.revision(exam) + " • " + exam.questions.length + " câu • " + exam.durationMinutes + " phút.";
    let draft = null;
    try { draft = JSON.parse(sessionStorage.getItem("mock-exam-draft")); } catch (_) { /* The gate stays usable. */ }
    function start() {
        gate.hidden = true; timer.hidden = false; layout.hidden = false; monitorPanel.hidden = false;
        initializeExam();
        window.MatchdayMath.render(examForm);
    }
    if (draft && draft.examSignature === examIdentity(exam)) {
        // Resume immediately: the original deadline continues, including elapsed time away.
        start(); return;
    }
    gate.hidden = false;
    if (draft) document.querySelector("#preflight-message").textContent = "Có tiến độ của đề hoặc phiên bản khác trong tab này. Bắt đầu lượt mới sẽ thay tiến độ đó.";
    startButton.addEventListener("click", function () {
        if (draft && !confirm("Bắt đầu lượt mới và thay tiến độ đang lưu trong tab này?")) return;
        startButton.disabled = true; start();
    }, {once: false});
}

function initializeExam() {
    // 1. Tìm các phần tử giao diện.
    const questionCards = Array.from(
        examForm.querySelectorAll(".question-card")
    );

    const questionButtons = Array.from(
        document.querySelectorAll(".question-button")
    );

    const flagButton = document.querySelector("#flag-question");
    const currentQuestionText = document.querySelector("#current-question");
    const answeredCountText = document.querySelector("#answered-count");
    const previousButton = document.querySelector("#previous-question");
    const nextButton = document.querySelector("#next-question");

    const timeRemaining = document.querySelector("#time-remaining");
    const timerMessage = document.querySelector("#timer-message");
    const timerContainer = document.querySelector(".exam-timer");

    const submitButton = examForm.querySelector("#submit-exam");
    const submitMessage = examForm.querySelector("#exam-submit-message");
    const viewReportLink = document.querySelector("#view-report");
    const saveMessage = document.querySelector("#exam-save-message");

    // 2. Kiểm tra giao diện.
    const requiredElements = [
        flagButton,
        currentQuestionText,
        answeredCountText,
        previousButton,
        nextButton,
        timeRemaining,
        timerMessage,
        timerContainer,
        submitButton,
        submitMessage,
        viewReportLink
    ];

    if (requiredElements.some(function (element) {
        return element === null;
    })) {
        console.error("Trang thi thiếu phần tử HTML cần thiết.");

        if (submitMessage) {
            submitMessage.textContent =
                "Không khởi động được bài thi. Giao diện thiếu thành phần.";
        }

        if (submitButton) {
            submitButton.disabled = true;
        }

        return;
    }

    function showSetupError(message) {
        submitMessage.textContent = message;
        submitButton.disabled = true;
        viewReportLink.hidden = true;
    }

    if (questionCards.length === 0) {
        showSetupError("Đề thi chưa có câu hỏi.");
        return;
    }

    const navigationIsValid =
        questionButtons.length === questionCards.length &&
        questionCards.every(function (card, index) {
            const legend = card.querySelector("legend");

            return (
                card.dataset.question === String(index + 1) &&
                questionButtons[index].dataset.question ===
                    card.dataset.question &&
                legend !== null &&
                legend.textContent.trim().length > 0
            );
        });

    if (!navigationIsValid) {
        showSetupError(
            "Kiểm tra tiêu đề câu hỏi, số thứ tự và bảng điều hướng."
        );
        return;
    }

    // 3. Đọc dữ liệu đề.
    const examData = examForm.examData;
    const hasExamData = examData !== undefined && examData !== null;

    if (
        hasExamData &&
        (
            typeof examData !== "object" ||
            Array.isArray(examData) ||
            !Array.isArray(examData.questions) ||
            typeof examData.title !== "string" ||
            examData.title.trim().length === 0
        )
    ) {
        showSetupError("Dữ liệu đề thi không hợp lệ.");
        return;
    }

    const examTitle = hasExamData
        ? examData.title.trim()
        : "Thi thử Toán học";

    // Đáp án dự phòng chỉ dành cho đề mẫu ba câu có sẵn.
    const correctAnswers = hasExamData
        ? examData.questions.map(function (question) {
            return question ? question.correctAnswer : null;
        })
        : ["b", "c", "c"];

    const answerKeys = ["a", "b", "c", "d"];

    const radioGroups = questionCards.map(function (card) {
        return Array.from(
            card.querySelectorAll('input[type="radio"]')
        );
    });

    const answersAreValid =
        correctAnswers.length === questionCards.length &&
        correctAnswers.every(function (answer, index) {
            return (
                answerKeys.includes(answer) &&
                radioGroups[index].some(function (input) {
                    return input.value === answer;
                })
            );
        });

    if (!answersAreValid) {
        showSetupError(
            "Đáp án đúng không khớp với các câu hỏi trong đề."
        );
        return;
    }

    const durationMinutes =
        examForm.dataset.durationMinutes === undefined
            ? 60
            : Number(examForm.dataset.durationMinutes);

    if (
        !Number.isInteger(durationMinutes) ||
        durationMinutes < 1 ||
        durationMinutes > 180
    ) {
        showSetupError("Thời lượng đề thi không hợp lệ.");
        return;
    }

    // 4. Thiết lập trạng thái.
    const draftKey = "mock-exam-draft";
    const resultKey = "mock-exam-result";
    const durationMilliseconds = durationMinutes * 60 * 1000;

    const questionNumbers = questionCards.map(function (card) {
        return card.dataset.question;
    });

    // Keep original source text; MathJax-generated DOM must never enter a saved snapshot.
    const questionTexts = examData.questions.map((q, i) => "Câu " + (i + 1) + ". " + q.text);
    const examSignature = examIdentity(examData);

    const monitor =
        window.examMonitor &&
        typeof window.examMonitor.start === "function" &&
        typeof window.examMonitor.stop === "function" &&
        typeof window.examMonitor.getLeaveCount === "function"
            ? window.examMonitor
            : null;

    let startedAt = Date.now();
    let attemptId = crypto.randomUUID();
    let deadline = startedAt + durationMilliseconds;
    let currentQuestion = questionNumbers[0];
    let selectedAnswers = questionCards.map(function () {
        return null;
    });

    let isSubmitted = false;
    let timerInterval = null;
    let restoredLeaveCount = 0;
    let restoredLeaveEvents = [];
    let monitorStarted = false;

    const flaggedQuestions = new Set();

    examForm.noValidate = true;

    viewReportLink.hidden = true;
    submitMessage.textContent = "";
    timerMessage.textContent = "";

    // Các nút điều hướng không được tự submit form.
    [
        flagButton,
        previousButton,
        nextButton,
        ...questionButtons
    ].forEach(function (button) {
        button.type = "button";
    });

    questionCards.forEach(function (card) {
        if (!card.hasAttribute("tabindex")) {
            card.tabIndex = -1;
        }
    });

    // 5. Đọc và hiển thị đáp án.
    function readAnswersFromForm() {
        return radioGroups.map(function (inputs) {
            const selectedInput = inputs.find(function (input) {
                return input.checked;
            });

            return selectedInput ? selectedInput.value : null;
        });
    }

    function renderSelectedAnswers() {
        radioGroups.forEach(function (inputs, index) {
            inputs.forEach(function (input) {
                input.checked = input.value === selectedAnswers[index];
                input.disabled = isSubmitted;
            });
        });
    }

    function getPageLeaveCount() {
        if (monitorStarted) {
            const count = monitor.getLeaveCount();

            if (Number.isSafeInteger(count) && count >= 0) {
                return count;
            }
        }

        return restoredLeaveCount;
    }

    function getRemainingSeconds() {
        return Math.max(
            0,
            Math.ceil((deadline - Date.now()) / 1000)
        );
    }

    // 6. Lưu bài đang làm.
    function saveDraft() {
        if (isSubmitted) {
            return;
        }

        const draft = {
            version: 1,
            examSignature: examSignature,
            deadline: deadline,
            startedAt: startedAt,
            attemptId: attemptId,
            selectedAnswers: selectedAnswers.slice(),
            flaggedQuestions: Array.from(flaggedQuestions),
            currentQuestion: currentQuestion,
            pageLeaveCount: getPageLeaveCount(),
            leaveEvents: monitorStarted && monitor.getEvents ? monitor.getEvents() : restoredLeaveEvents
        };

        try {
            sessionStorage.setItem(draftKey, JSON.stringify(draft));

            if (saveMessage) {
                saveMessage.textContent =
                    "Đã lưu tiến độ trong tab này.";
            }
        } catch (error) {
            if (saveMessage) {
                saveMessage.textContent =
                    "Không lưu được tiến độ. Tải lại trang có thể làm mất bài đang làm.";
            }

            console.error(error);
        }
    }

    // 7. Khôi phục bài đang làm.
    function restoreDraft() {
        try {
            const savedDraft = sessionStorage.getItem(draftKey);

            if (savedDraft === null) {
                return;
            }

            const draft = JSON.parse(savedDraft);

            const draftIsValid =
                draft !== null &&
                typeof draft === "object" &&
                !Array.isArray(draft) &&
                draft.version === 1 &&
                draft.examSignature === examSignature &&
                Number.isSafeInteger(draft.deadline) &&
                draft.deadline > 0 &&
                draft.deadline <= Date.now() + durationMilliseconds &&
                Array.isArray(draft.selectedAnswers) &&
                draft.selectedAnswers.length === questionCards.length &&
                draft.selectedAnswers.every(function (answer, index) {
                    return (
                        answer === null ||
                        radioGroups[index].some(function (input) {
                            return input.value === answer;
                        })
                    );
                }) &&
                Array.isArray(draft.flaggedQuestions) &&
                draft.flaggedQuestions.every(function (number) {
                    return questionNumbers.includes(number);
                }) &&
                questionNumbers.includes(draft.currentQuestion) &&
                Number.isSafeInteger(draft.pageLeaveCount) &&
                draft.pageLeaveCount >= 0;

            if (!draftIsValid) {
                sessionStorage.removeItem(draftKey);
                return;
            }

            deadline = draft.deadline;
            startedAt = Number.isSafeInteger(draft.startedAt) ? draft.startedAt : deadline - durationMilliseconds;
            attemptId = typeof draft.attemptId === "string" ? draft.attemptId : attemptId;
            restoredLeaveEvents = Array.isArray(draft.leaveEvents) ? draft.leaveEvents : [];
            currentQuestion = draft.currentQuestion;
            selectedAnswers = draft.selectedAnswers.slice();
            restoredLeaveCount = draft.pageLeaveCount;

            draft.flaggedQuestions.forEach(function (number) {
                flaggedQuestions.add(number);
            });
        } catch (error) {
            if (saveMessage) {
                saveMessage.textContent =
                    "Không đọc được tiến độ đã lưu.";
            }

            console.error(error);
        }
    }

    // 8. Cập nhật bảng điều hướng.
    function updateNavigation() {
        questionButtons.forEach(function (button, index) {
            const number = button.dataset.question;
            const isAnswered = selectedAnswers[index] !== null;
            const isFlagged = flaggedQuestions.has(number);

            button.classList.toggle("is-answered", isAnswered);
            button.classList.toggle("is-flagged", isFlagged);

            button.setAttribute(
                "aria-current",
                String(number === currentQuestion)
            );

            button.textContent = number + (isFlagged ? " ⚑" : "");

            button.setAttribute(
                "aria-label",
                "Câu " + number +
                (isAnswered ? ", đã trả lời" : ", chưa trả lời") +
                (isFlagged ? ", cần xem lại" : "")
            );
        });

        const answeredCount = selectedAnswers.filter(function (answer) {
            return answer !== null;
        }).length;

        answeredCountText.textContent =
            "Đã trả lời " + answeredCount +
            " / " + questionCards.length + " câu.";

        const isFlagged = flaggedQuestions.has(currentQuestion);

        flagButton.setAttribute("aria-pressed", String(isFlagged));

        flagButton.textContent = isFlagged
            ? "⚑ Bỏ đánh dấu"
            : "⚑ Đánh dấu xem lại";

        flagButton.disabled = isSubmitted;
    }

    // 9. Chuyển câu.
    function showQuestion(questionNumber, moveFocus) {
        const currentIndex = questionNumbers.indexOf(questionNumber);

        if (currentIndex === -1) {
            return;
        }

        currentQuestion = questionNumber;

        questionCards.forEach(function (card, index) {
            card.hidden = index !== currentIndex;
        });

        currentQuestionText.textContent =
            "Câu " + questionNumber + " / " + questionCards.length;

        previousButton.disabled = currentIndex === 0;
        nextButton.disabled = currentIndex === questionCards.length - 1;

        updateNavigation();

        if (moveFocus) {
            questionCards[currentIndex].focus();
            saveDraft();
        }
    }

    // 10. Hiển thị đồng hồ.
    function renderTime(remainingSeconds) {
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;

        timeRemaining.textContent =
            String(minutes).padStart(2, "0") + ":" +
            String(seconds).padStart(2, "0");

        timerContainer.classList.toggle(
            "is-warning",
            remainingSeconds <= 5 * 60
        );
    }

    // 11. Kết thúc bài, chấm điểm và lưu kết quả.
    function finishExam(reason) {
        if (isSubmitted) {
            return;
        }

        // Giữ bản dự phòng nếu lưu kết quả bị lỗi.
        saveDraft();

        const pageLeaveCount = getPageLeaveCount();

        isSubmitted = true;
        clearInterval(timerInterval);

        if (monitorStarted) {
            monitor.stop(reason === "timeout" ? deadline : Date.now());
        }

        renderSelectedAnswers();

        renderTime(reason === "timeout" ? 0 : getRemainingSeconds());

        const answeredCount = selectedAnswers.filter(function (answer) {
            return answer !== null;
        }).length;

        const correctCount = selectedAnswers.filter(
            function (answer, index) {
                return answer === correctAnswers[index];
            }
        ).length;

        const wrongCount = answeredCount - correctCount;

        const score = Number(
            (correctCount / questionCards.length * 10).toFixed(2)
        );

        submitButton.disabled = true;
        submitButton.textContent = "Đã kết thúc";

        timerMessage.textContent = reason === "timeout"
            ? "Đã hết thời gian. Bạn chỉ có thể xem lại bài."
            : "Bạn đã nộp bài. Đồng hồ đã dừng.";

        submitMessage.textContent =
            "Đã trả lời " + answeredCount +
            " / " + questionCards.length +
            " câu. Điểm: " + score.toFixed(2) +
            " / 10. Đúng " + correctCount +
            " câu, sai " + wrongCount +
            " câu, bỏ trống " +
            (questionCards.length - answeredCount) +
            " câu. Kết quả chưa được gửi lên máy chủ.";

        const result = {
            version: 1,
            attemptId: attemptId,
            startedAt: new Date(startedAt).toISOString(),
            endedAt: new Date(reason === "timeout" ? deadline : Date.now()).toISOString(),
            durationMinutes: durationMinutes,
            examId: examData.id,
            examVersion: window.ExamStore.revision(examData),
            examFingerprint: window.ExamStore.fingerprint(examData),
            submittedAt: new Date().toISOString(),
            examTitle: examTitle,
            totalQuestions: questionCards.length,
            answeredQuestions: answeredCount,
            correctQuestions: correctCount,
            wrongQuestions: wrongCount,
            score: score,

            questions: questionCards.map(function (card, index) {
                return {
                    questionNumber: index + 1,
                    questionText: questionTexts[index],
                    selectedAnswer: selectedAnswers[index],
                    correctAnswer: correctAnswers[index],
                    options: {...examData.questions[index].options},
                    explanation: examData.questions[index].explanation || ""
                };
            }),

            reason: reason,
            pageLeaveCount: pageLeaveCount,
            leaveEvents: monitorStarted && monitor.getEvents ? monitor.getEvents() : restoredLeaveEvents
        };

        let resultSaved = false;

        try {
            sessionStorage.setItem(resultKey, JSON.stringify(result));

            resultSaved = true;
            viewReportLink.hidden = false;

            // Lưu lịch sử riêng; lỗi lịch sử không làm mất kết quả hiện tại.
            try {
                const historyKey = "mock-exam-history";
                const savedHistory = localStorage.getItem(historyKey);

                const history = savedHistory === null
                    ? []
                    : JSON.parse(savedHistory);

                if (!Array.isArray(history)) {
                    throw new Error("Dữ liệu lịch sử không hợp lệ.");
                }

                const updatedHistory = [
                    result,
                    ...history.filter(function (item) {
                        return (
                            item !== null &&
                            typeof item === "object" &&
                            item.attemptId !== result.attemptId
                        );
                    })
                ];

                localStorage.setItem(
                    historyKey,
                    JSON.stringify(updatedHistory)
                );
            } catch (error) {
                submitMessage.textContent +=
                    " Không lưu được lượt thi vào lịch sử.";

                console.error(error);
            }

            if (saveMessage) {
                saveMessage.textContent =
                    "Đã lưu kết quả trong tab này.";
            }
        } catch (error) {
            submitMessage.textContent +=
                " Không lưu được dữ liệu để mở trang kết quả.";

            if (saveMessage) {
                saveMessage.textContent =
                    "Không lưu được kết quả. Hãy giữ trang này để xem điểm.";
            }

            console.error(error);
        }

        if (resultSaved) {
            try {
                sessionStorage.removeItem(draftKey);
            } catch (error) {
                if (saveMessage) {
                    saveMessage.textContent =
                        "Đã lưu kết quả, nhưng chưa xóa được bản bài đang làm.";
                }

                console.error(error);
            }
        }

        updateNavigation();
    }

    // 12. Cập nhật thời gian.
    function updateTimer() {
        if (isSubmitted) {
            return;
        }

        const remainingSeconds = getRemainingSeconds();

        renderTime(remainingSeconds);

        if (remainingSeconds === 0) {
            finishExam("timeout");
        }
    }

    // 13. Điều hướng bằng số câu.
    questionButtons.forEach(function (button) {
        button.addEventListener("click", function () {
            updateTimer();
            showQuestion(button.dataset.question, true);
        });
    });

    // 14. Ghi nhận lựa chọn trước thời hạn.
    examForm.addEventListener("change", function (event) {
        if (
            !(event.target instanceof HTMLInputElement) ||
            event.target.type !== "radio"
        ) {
            return;
        }

        if (isSubmitted) {
            renderSelectedAnswers();
            return;
        }

        if (Date.now() >= deadline) {
            // Không nhận thay đổi diễn ra sau thời hạn.
            renderSelectedAnswers();
            updateTimer();
            return;
        }

        selectedAnswers = readAnswersFromForm();

        updateNavigation();
        saveDraft();
    });

    // 15. Đánh dấu câu cần xem lại.
    flagButton.addEventListener("click", function () {
        if (isSubmitted) {
            return;
        }

        if (Date.now() >= deadline) {
            updateTimer();
            return;
        }

        if (flaggedQuestions.has(currentQuestion)) {
            flaggedQuestions.delete(currentQuestion);
        } else {
            flaggedQuestions.add(currentQuestion);
        }

        updateNavigation();
        saveDraft();
    });

    // 16. Câu trước và câu tiếp.
    previousButton.addEventListener("click", function () {
        updateTimer();

        const index = questionNumbers.indexOf(currentQuestion);

        if (index > 0) {
            showQuestion(questionNumbers[index - 1], true);
        }
    });

    nextButton.addEventListener("click", function () {
        updateTimer();

        const index = questionNumbers.indexOf(currentQuestion);

        if (index < questionNumbers.length - 1) {
            showQuestion(questionNumbers[index + 1], true);
        }
    });

    // 17. Xác nhận nộp bài.
    examForm.addEventListener("submit", function (event) {
        event.preventDefault();

        if (isSubmitted) {
            return;
        }

        if (Date.now() >= deadline) {
            updateTimer();
            return;
        }

        const unansweredCount = selectedAnswers.filter(function (answer) {
            return answer === null;
        }).length;

        const confirmationMessage = unansweredCount > 0
            ? "Bạn còn " + unansweredCount +
                " câu chưa trả lời. Bạn muốn nộp bài?"
            : "Bạn đã trả lời tất cả câu hỏi. Bạn muốn nộp bài?";

        const confirmed = window.confirm(confirmationMessage);

        // Thời gian vẫn chạy trong lúc hộp xác nhận mở.
        if (Date.now() >= deadline) {
            updateTimer();
            return;
        }

        if (confirmed) {
            finishExam("manual");
        }
    });

    // 18. Đồng bộ thời gian khi quay lại trang.
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
            updateTimer();
        }
    });

    window.addEventListener("pageshow", function () {
        updateTimer();

        // Đồng bộ lại input khi trình duyệt khôi phục trang.
        renderSelectedAnswers();
    });

    window.addEventListener("pagehide", function () {
        saveDraft();
    });

    // 19. Khôi phục và khởi động bài thi.
    restoreDraft();
    renderSelectedAnswers();
    showQuestion(currentQuestion, false);

    submitButton.disabled = false;

    if (monitor) {
        monitor.start(
            function () {
                return !isSubmitted && Date.now() < deadline;
            },
            restoredLeaveCount,
            saveDraft,
            restoredLeaveEvents,
            deadline
        );

        monitorStarted = true;
    }

    timerInterval = setInterval(updateTimer, 1000);

    updateTimer();

    if (!isSubmitted) {
        saveDraft();
    }
}
}).catch(function (error) { console.error("Không khởi tạo được trang:", error.message); });
