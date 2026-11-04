(function () {
    "use strict";

    const $ = selector => document.querySelector(selector);
    const form = $("#exam-form");
    if (!form) return;

    const api = window.MatchdayAPI;
    const auth = window.MatchdayAuth;
    const params = new URLSearchParams(location.search);

    const gate = $("#exam-preflight");
    const startButton = $("#start-exam");
    const layout = $(".exam-layout");
    const timerHeader = $(".exam-header");
    const monitor = $(".exam-monitor");
    const saveMessage = $("#exam-save-message");
    const submitMessage = $("#exam-submit-message");
    const submitButton = $("#submit-exam");

    let attempt = null;
    let answers = [];
    let current = 1;
    let revision = 0;
    let savedRevision = 0;
    let events = [];
    let leaveCount = 0;
    let ending = false;
    let finished = false;
    let blocked = false;
    let sending = false;
    let storageOK = true;
    let interval = null;
    let journalKey = "";
    let lastSent = null;

    function text(selector, value) {
        const element = $(selector);
        if (element) element.textContent = String(value);
    }

    function hide(element, value) {
        if (element) element.hidden = value;
    }

    function setExamInfo(exam, count) {
        document.title = exam.title + " | MATCHDAY";
        text("h1", exam.title);

        // Không dùng ".exam-note" chung vì thông báo nộp bài
        // cũng có thể sử dụng class này.
        const heading = $("h1");
        const container = heading && heading.parentElement;
        const note = container && container.querySelector(".exam-note");

        if (note && note !== submitMessage && note !== saveMessage) {
            note.textContent =
                `${count} câu · ${exam.durationMinutes} phút · ` +
                `Phiên bản ${exam.examVersion}`;
        }

        text(
            "#preflight-summary",
            `${exam.title} · ${count} câu · ` +
            `${exam.durationMinutes} phút · v${exam.examVersion}`
        );
    }

    hide(layout, true);
    hide(timerHeader, true);
    hide(monitor, true);
    hide(gate, true);
    hide($("#view-report"), true);
    if (startButton) startButton.disabled = true;
    if (submitButton) submitButton.disabled = true;

    function deadline() {
        return attempt ? Date.parse(attempt.deadlineAt) : 0;
    }

    function editable() {
        return Boolean(attempt) &&
            !finished && !ending && !blocked &&
            Date.now() < deadline();
    }

    function snapshot() {
        return answers.map(answer => ({ ...answer }));
    }

    function normalizeAnswers(state) {
        const saved = new Map(
            (state.answers || []).map(answer => [
                answer.questionId,
                answer
            ])
        );

        return state.exam.questions.map(question => ({
            questionId: question.id,
            selectedAnswer:
                saved.get(question.id)?.selectedAnswer ?? null,
            isFlagged: saved.get(question.id)?.isFlagged ?? false
        }));
    }

    function sameAnswers(left, right) {
        function normalize(values) {
            return values.map(value => ({
                questionId: value.questionId,
                selectedAnswer: value.selectedAnswer ?? null,
                isFlagged: value.isFlagged === true
            })).sort((a, b) =>
                a.questionId.localeCompare(b.questionId)
            );
        }

        return JSON.stringify(normalize(left)) ===
            JSON.stringify(normalize(right));
    }

    function persist() {
        if (!attempt || !journalKey || finished) return;

        try {
            sessionStorage.setItem(journalKey, JSON.stringify({
                syncVersion: attempt.syncVersion,
                answers,
                current,
                events,
                leaveCount,
                dirty: revision !== savedRevision,
                ending,
                lastSent
            }));
        } catch {
            storageOK = false;
            text(
                "#exam-save-message",
                "Không lưu được bản nháp trong tab. " +
                "Giữ trang mở để đồng bộ với máy chủ."
            );
        }
    }

    function showConflict(message) {
        blocked = true;
        clearInterval(interval);

        text(
            "#exam-save-message",
            message ||
            "Lượt làm đã thay đổi ở nơi khác. Bản nháp trong tab " +
            "được giữ lại và chưa ghi đè dữ liệu máy chủ."
        );

        renderNavigation();

        if ($("#reload-attempt")) return;

        const button = document.createElement("button");
        button.id = "reload-attempt";
        button.type = "button";
        button.className = "secondary-button";
        button.textContent = "Tải trạng thái máy chủ";

        button.addEventListener("click", function () {
            if (!confirm(
                "Bỏ bản nháp chưa đồng bộ trong tab này " +
                "và tải dữ liệu đang lưu trên máy chủ?"
            )) return;

            try {
                sessionStorage.removeItem(journalKey);
            } catch {
                text(
                    "#exam-save-message",
                    "Không xóa được bản nháp. Kiểm tra quyền lưu trữ."
                );
                return;
            }

            location.reload();
        });

        (saveMessage || submitMessage || form).after(button);
    }

    function renderNavigation() {
        if (!attempt || !answers.length) return;

        form.querySelectorAll(".question-card").forEach((card, index) => {
            card.hidden = index + 1 !== current;
        });

        document.querySelectorAll(".question-button")
            .forEach((button, index) => {
                const answer = answers[index];
                if (!answer) return;

                const active = index + 1 === current;
                const answered = answer.selectedAnswer !== null;

                button.classList.toggle("active", active);
                button.classList.toggle("is-current", active);
                button.classList.toggle("answered", answered);
                button.classList.toggle("is-answered", answered);
                button.classList.toggle("flagged", answer.isFlagged);
                button.classList.toggle("is-flagged", answer.isFlagged);
                button.textContent =
                    String(index + 1) + (answer.isFlagged ? " ⚑" : "");
                button.setAttribute("aria-current", String(active));
            });

        text("#current-question", `Câu ${current} / ${answers.length}`);
        text(
            "#answered-count",
            `Đã trả lời ${
                answers.filter(answer => answer.selectedAnswer !== null)
                    .length
            } / ${answers.length}`
        );

        const flag = $("#flag-question");
        if (flag) {
            const flagged = answers[current - 1].isFlagged;
            flag.textContent = flagged
                ? "⚑ Bỏ đánh dấu"
                : "⚑ Đánh dấu xem lại";
            flag.setAttribute("aria-pressed", String(flagged));
            flag.disabled = !editable();
        }

        const previous = $("#previous-question");
        const next = $("#next-question");

        if (previous) previous.disabled = current === 1;
        if (next) next.disabled = current === answers.length;

        form.querySelectorAll('input[type="radio"]').forEach(input => {
            const answer = answers[Number(input.dataset.index)];
            input.checked = answer.selectedAnswer === input.value;
            input.disabled = !editable();
        });

        if (submitButton) {
            submitButton.disabled = finished || blocked || sending;
            submitButton.textContent = ending
                ? "Thử nộp lại"
                : "Nộp bài";
        }

        text("#page-leave-count", leaveCount);
    }

    function move(number) {
        if (!attempt || !answers.length) return;

        const target = Math.max(1, Math.min(answers.length, number));
        if (target === current) return;

        current = target;
        if (editable()) revision++;

        persist();
        renderNavigation();
    }

    function buildQuestions() {
        const grid = $(".question-grid");
        const actions = form.querySelector(".question-actions");

        if (!grid || !actions) {
            throw new Error("Trang thi thiếu vùng câu hỏi hoặc điều hướng.");
        }

        grid.replaceChildren();
        form.querySelectorAll(".question-card").forEach(card => card.remove());

        attempt.exam.questions.forEach((question, index) => {
            const nav = document.createElement("button");
            nav.type = "button";
            nav.className = "question-button";
            nav.dataset.question = String(index + 1);
            nav.addEventListener("click", () => move(index + 1));
            grid.append(nav);

            const card = document.createElement("fieldset");
            card.className = "question-card";
            card.dataset.question = String(index + 1);
            card.tabIndex = -1;

            const legend = document.createElement("legend");
            legend.className = "mvp-math";
            legend.textContent = `Câu ${index + 1}. ${question.text}`;
            card.append(legend);

            ["a", "b", "c", "d"].forEach(key => {
                if (question.options[key] === undefined) return;

                const label = document.createElement("label");
                label.className = "answer-option";

                const input = document.createElement("input");
                input.type = "radio";
                input.name = "question-" + index;
                input.value = key;
                input.dataset.index = String(index);

                input.addEventListener("change", function () {
                    if (!editable()) {
                        renderNavigation();
                        return;
                    }

                    answers[index].selectedAnswer = key;
                    revision++;
                    persist();
                    renderNavigation();
                });

                const content = document.createElement("span");
                content.className = "mvp-math";
                content.textContent =
                    key.toUpperCase() + ". " + question.options[key];

                label.append(input, content);
                card.append(label);
            });

            form.insertBefore(card, actions);
        });
    }

    function closeEvent() {
        const open = events.find(event =>
            !event.visibleAt && !event.endedAt
        );
        if (!open || !attempt) return;

        const at = Math.max(
            Date.parse(open.hiddenAt),
            Math.min(Date.now(), deadline())
        );

        if (ending || Date.now() >= deadline()) {
            open.endedAt = new Date(at).toISOString();
        } else {
            open.visibleAt = new Date(at).toISOString();
        }

        persist();
    }

    async function flushEvents() {
        for (const event of [...events]) {
            const payload = { ...event };
            const before = JSON.stringify(event);

            await api.request(
                "/attempts/" + encodeURIComponent(attempt.attemptId) +
                "/leave-events",
                { method: "POST", body: payload }
            );

            if (
                (payload.visibleAt || payload.endedAt) &&
                JSON.stringify(event) === before
            ) {
                events = events.filter(item => item !== event);
            }

            persist();
        }
    }

    function complete() {
        finished = true;
        clearInterval(interval);

        try {
            sessionStorage.removeItem(journalKey);
        } catch {
            // Kết quả đã nằm trên máy chủ.
        }

        location.replace(
            "report.html?attemptId=" +
            encodeURIComponent(attempt.attemptId)
        );
    }

    async function recoverConflict(error, operation) {
        const state = await api.request(
            "/attempts/" + encodeURIComponent(attempt.attemptId)
        );

        if (state.status !== "in_progress") {
            complete();
            return;
        }

        const serverAnswers = normalizeAnswers(state);

        if (state.syncVersion !== attempt.syncVersion) {
            // Chấp nhận trường hợp request đã được lưu nhưng mất phản hồi.
            const matchesCurrent = sameAnswers(serverAnswers, answers);
            const matchesSent = lastSent &&
                lastSent.expectedSync === attempt.syncVersion &&
                sameAnswers(serverAnswers, lastSent.answers) &&
                state.currentQuestion === lastSent.currentQuestion;

            if (!matchesCurrent && !matchesSent) {
                showConflict();
                return;
            }

            attempt.syncVersion = state.syncVersion;
            lastSent = null;
            revision++;
            persist();

            text(
                "#exam-save-message",
                "Đã lấy lại phiên đồng bộ. Đang tiếp tục gửi dữ liệu…"
            );
            return;
        }

        // PATCH có thể đến máy chủ ngay sau lúc hết giờ.
        if (
            operation === "save" &&
            (state.isExpired || Date.now() >= deadline())
        ) {
            ending = true;
            closeEvent();
            persist();
            text("#timer-message", "Đã hết giờ. Đang gửi bài…");
            return;
        }

        showConflict(
            error.message +
            " Bản nháp vẫn được giữ. Có thể tải lại trạng thái máy chủ."
        );
    }

    async function synchronize() {
        if (!attempt || finished || blocked || sending) return;

        sending = true;
        let operation = "events";
        renderNavigation();

        try {
            if (ending) closeEvent();
            await flushEvents();

            if (ending) {
                operation = "submit";

                await api.request(
                    "/attempts/" + encodeURIComponent(attempt.attemptId) +
                    "/submit",
                    {
                        method: "POST",
                        body: {
                            expectedSync: attempt.syncVersion,
                            answers: snapshot()
                        }
                    }
                );

                complete();
                return;
            }

            if (
                revision !== savedRevision &&
                Date.now() < deadline()
            ) {
                operation = "save";

                const sentRevision = revision;
                const payload = {
                    expectedSync: attempt.syncVersion,
                    currentQuestion: current,
                    answers: snapshot()
                };

                lastSent = payload;
                persist();

                const result = await api.request(
                    "/attempts/" + encodeURIComponent(attempt.attemptId),
                    { method: "PATCH", body: payload }
                );

                attempt.syncVersion = result.syncVersion;
                savedRevision = sentRevision;
                lastSent = null;
                persist();
            }

            if (storageOK) {
                text(
                    "#exam-save-message",
                    revision === savedRevision
                        ? "Đã đồng bộ đáp án với máy chủ."
                        : "Đang chờ đồng bộ thay đổi mới…"
                );
            }
        } catch (error) {
            if (error.status === 409) {
                try {
                    await recoverConflict(error, operation);
                } catch (readError) {
                    text(
                        "#exam-save-message",
                        readError.message +
                        " Bản nháp được giữ; hệ thống sẽ thử lại."
                    );
                }
            } else if (error.status === 401) {
                blocked = true;
                clearInterval(interval);
                text(
                    "#exam-submit-message",
                    "Phiên đăng nhập hết hạn. Đăng nhập lại trong cùng " +
                    "tab rồi mở lại URL lượt làm này để khôi phục."
                );
            } else {
                text(
                    "#exam-save-message",
                    error.message +
                    " Bản nháp được giữ trong tab; sẽ thử lại khi có kết nối."
                );

                if (ending) {
                    text(
                        "#exam-submit-message",
                        "Chưa nhận được xác nhận nộp bài. Giữ trang mở; " +
                        "hệ thống sẽ thử lại."
                    );
                }
            }
        } finally {
            sending = false;
            if (!finished) renderNavigation();
        }
    }

    function tick() {
        if (!attempt || finished || blocked) return;

        const seconds = Math.max(
            0,
            Math.ceil((deadline() - Date.now()) / 1000)
        );

        text(
            "#time-remaining",
            String(Math.floor(seconds / 60)).padStart(2, "0") +
            ":" + String(seconds % 60).padStart(2, "0")
        );

        if (seconds === 0 && !ending) {
            ending = true;
            closeEvent();
            persist();
            text("#timer-message", "Đã hết giờ. Đang gửi bài lên máy chủ…");
            renderNavigation();
            synchronize();
        }
    }

    function restoreDraft(state) {
        try {
            const draft = JSON.parse(sessionStorage.getItem(journalKey));
            if (!draft) return false;

            const valid = Array.isArray(draft.answers) &&
                draft.answers.length === answers.length &&
                draft.answers.every((answer, index) =>
                    answer.questionId === answers[index].questionId &&
                    [null, "a", "b", "c", "d"].includes(
                        answer.selectedAnswer
                    ) &&
                    typeof answer.isFlagged === "boolean"
                );

            if (!valid) return false;

            events = Array.isArray(draft.events)
                ? draft.events.filter(event =>
                    event &&
                    typeof event.eventId === "string" &&
                    Number.isFinite(Date.parse(event.hiddenAt)) &&
                    (!event.visibleAt ||
                        Number.isFinite(Date.parse(event.visibleAt))) &&
                    (!event.endedAt ||
                        Number.isFinite(Date.parse(event.endedAt)))
                )
                : [];

            leaveCount = Math.max(
                leaveCount,
                Number.isInteger(draft.leaveCount)
                    ? draft.leaveCount : 0
            );

            ending = draft.ending === true;

            if (!draft.dirty && !ending) return false;

            const sent = draft.lastSent;
            const matchesSent = sent &&
                sent.expectedSync === draft.syncVersion &&
                Array.isArray(sent.answers) &&
                sameAnswers(sent.answers, answers) &&
                state.currentQuestion === sent.currentQuestion;

            const compatible =
                draft.syncVersion === state.syncVersion ||
                sameAnswers(draft.answers, answers) ||
                matchesSent;

            answers = draft.answers.map(answer => ({ ...answer }));

            if (Number.isInteger(draft.current)) {
                current = draft.current;
            }

            revision++;
            return !compatible;
        } catch {
            text(
                "#exam-save-message",
                "Không đọc được bản nháp; đã lấy đáp án từ máy chủ."
            );
            return false;
        }
    }

    async function mount(state) {
        attempt = state;

        if (state.status !== "in_progress") {
            complete();
            return;
        }

        if (
            !state.exam ||
            !Array.isArray(state.exam.questions) ||
            !state.exam.questions.length ||
            !Number.isFinite(deadline())
        ) {
            throw new Error("Dữ liệu lượt làm từ máy chủ không hợp lệ.");
        }

        const user = auth.getSession();
        journalKey =
            "matchday-attempt:" + user.accountId + ":" + state.attemptId;

        revision = 0;
        savedRevision = 0;
        events = [];
        ending = false;
        blocked = false;
        lastSent = null;
        leaveCount = Number.isInteger(state.pageLeaveCount)
            ? state.pageLeaveCount : 0;

        answers = normalizeAnswers(state);
        current = state.currentQuestion || 1;

        const conflict = restoreDraft(state);

        current = Math.max(1, Math.min(answers.length, current));

        history.replaceState(
            null,
            "",
            "exam.html?attemptId=" + encodeURIComponent(state.attemptId)
        );

        setExamInfo(state.exam, answers.length);
        buildQuestions();

        hide(gate, true);
        hide(timerHeader, false);
        hide(layout, false);
        hide(monitor, false);
        hide($("#view-report"), true);

        renderNavigation();

        clearInterval(interval);

        if (conflict) {
            showConflict();
        } else {
            if (document.visibilityState === "visible") closeEvent();
            persist();
            tick();
            synchronize();

            interval = setInterval(function () {
                tick();
                synchronize();
            }, 1000);
        }

        try {
            await window.MatchdayMath?.render(form);
        } catch {
            text(
                "#math-status",
                "Chưa hiển thị được công thức; nội dung văn bản vẫn còn."
            );
        }
    }

    $("#previous-question")?.addEventListener(
        "click", () => move(current - 1)
    );

    $("#next-question")?.addEventListener(
        "click", () => move(current + 1)
    );

    $("#flag-question")?.addEventListener("click", function () {
        if (!editable()) return;

        answers[current - 1].isFlagged =
            !answers[current - 1].isFlagged;

        revision++;
        persist();
        renderNavigation();
    });

    form.addEventListener("submit", function (event) {
        event.preventDefault();

        if (!attempt || finished || blocked || sending) return;

        if (!ending) {
            const remaining = answers.filter(
                answer => answer.selectedAnswer === null
            ).length;

            if (!confirm(
                `Bạn còn ${remaining} câu chưa trả lời. Nộp bài?`
            )) return;

            ending = true;
            closeEvent();
            persist();
        }

        text(
            "#exam-submit-message",
            "Đang nộp bài. Giữ trang mở đến khi nhận kết quả."
        );

        renderNavigation();
        synchronize();
    });

    document.addEventListener("visibilitychange", function () {
        if (!attempt || finished || blocked) return;

        if (document.visibilityState === "hidden" && editable()) {
            const hasOpenEvent = events.some(event =>
                !event.visibleAt && !event.endedAt
            );

            if (!hasOpenEvent) {
                events.push({
                    eventId: crypto.randomUUID(),
                    hiddenAt: new Date().toISOString()
                });

                leaveCount++;
                persist();
                text("#page-leave-count", leaveCount);
            }
        } else if (document.visibilityState === "visible") {
            closeEvent();
            tick();
        }

        synchronize();
    });

    window.addEventListener("online", synchronize);
    window.addEventListener("pagehide", persist);

    async function initialize() {
        if (!api || !auth) {
            throw new Error("Chưa tải được API hoặc phiên đăng nhập.");
        }

        await auth.ready;
        if (!auth.getSession()) return;

        const attemptId = params.get("attemptId");

        if (attemptId) {
            await mount(await api.request(
                "/attempts/" + encodeURIComponent(attemptId)
            ));
            return;
        }

        const versionId = params.get("examVersionId");

        if (!versionId) {
            throw new Error("Hãy chọn đề từ Đề mẫu hoặc Đề của tôi.");
        }

        const [mine, sample] = await Promise.all([
            api.request("/exams?scope=mine"),
            api.request("/exams?scope=sample")
        ]);

        const exam = [...mine, ...sample].find(
            item => item.examVersionId === versionId
        );

        if (!exam) {
            throw new Error("Không tìm thấy phiên bản đề có thể bắt đầu.");
        }

        // Cập nhật ngay khi mở trang, không đợi bấm Bắt đầu.
        setExamInfo(exam, exam.questionCount);

        if (!gate || !startButton) {
            throw new Error("Trang thi thiếu nút hoặc phần chuẩn bị làm bài.");
        }

        hide(gate, false);
        startButton.disabled = false;

        const clientAttemptId = crypto.randomUUID();
        let starting = false;

        startButton.addEventListener("click", async function () {
            if (starting) return;

            starting = true;
            startButton.disabled = true;
            text("#preflight-message", "Đang mở lượt làm…");

            try {
                const state = await api.request("/attempts", {
                    method: "POST",
                    body: {
                        examVersionId: versionId,
                        clientAttemptId
                    }
                });

                await mount(state);
                text("#preflight-message", "");
            } catch (error) {
                text("#preflight-message", error.message);
                startButton.disabled = false;
            } finally {
                starting = false;
            }
        });
    }

    initialize().catch(function (error) {
        console.error("Không khởi tạo được trang thi:", error);
        hide(gate, false);
        text("#preflight-message", error.message);
        text("#exam-submit-message", error.message);
        if (startButton) startButton.disabled = true;
    });
})();