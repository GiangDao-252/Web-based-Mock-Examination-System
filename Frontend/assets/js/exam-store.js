(function () {
    "use strict";
    const keys = ["a", "b", "c", "d"];
    const text = value => typeof value === "string" && value.trim().length > 0;

    function validate(exam) {
        if (!exam || Array.isArray(exam) || !text(exam.title) || exam.title.length > 120) throw new Error("Tên đề phải có từ 1 đến 120 ký tự.");
        if (!Number.isInteger(exam.durationMinutes) || exam.durationMinutes < 1 || exam.durationMinutes > 180) throw new Error("Thời lượng phải là số nguyên từ 1 đến 180 phút.");
        if (!Array.isArray(exam.questions) || exam.questions.length < 1 || exam.questions.length > 100) throw new Error("Đề cần có từ 1 đến 100 câu.");
        exam.questions.forEach((q, i) => {
            if (!q || !text(q.text) || q.text.length > 10000) throw new Error("Câu " + (i + 1) + ": nội dung cần có từ 1 đến 10.000 ký tự.");
            if (!q.options || Array.isArray(q.options) || Object.keys(q.options).length !== 4 || !keys.every(k => text(q.options[k]) && q.options[k].length <= 10000)) throw new Error("Câu " + (i + 1) + " cần đúng bốn lựa chọn A–D, mỗi lựa chọn tối đa 10.000 ký tự.");
            if (!keys.includes(q.correctAnswer)) throw new Error("Câu " + (i + 1) + " cần chọn đáp án đúng.");
            if (q.explanation !== undefined && (typeof q.explanation !== "string" || q.explanation.length > 20000)) throw new Error("Lời giải câu " + (i + 1) + " phải là văn bản, tối đa 20.000 ký tự.");
        });
        return exam;
    }

    function content(exam) {
        return {
            title: exam.title.trim(), durationMinutes: exam.durationMinutes,
            questions: exam.questions.map(q => ({text: q.text.trim(), options: Object.fromEntries(keys.map(k => [k, q.options[k].trim()])), correctAnswer: q.correctAnswer, explanation: (q.explanation || "").trim()}))
        };
    }
    // Exact content identity: no hash collisions, no grouping by title alone.
    function fingerprint(exam) { return JSON.stringify(content(exam)); }
    function revision(exam) { return Number.isSafeInteger(exam.examVersion) && exam.examVersion > 0 ? exam.examVersion : 1; }
    function readExams() {
        const value = JSON.parse(localStorage.getItem("mock-exams") || "[]");
        if (!Array.isArray(value)) throw new Error("Danh sách đề trong trình duyệt không hợp lệ.");
        return value;
    }
    function save(exam, original) {
        validate(exam);
        const all = readExams();
        let saved;
        if (original) {
            const index = all.findIndex(e => e && e.id === original.id);
            if (index < 0) throw new Error("Đề này đã bị xóa. Hãy tải lại danh sách.");
            const current = all[index];
            if (revision(current) !== revision(original) || fingerprint(current) !== fingerprint(original)) throw new Error("Đề đã thay đổi ở tab khác. Hãy tải lại trang trước khi sửa tiếp.");
            const changed = fingerprint(current) !== fingerprint(exam);
            saved = {...current, ...content(exam), examVersion: revision(current) + (changed ? 1 : 0), updatedAt: new Date().toISOString()};
            all[index] = saved;
        } else {
            saved = {...content(exam), id: crypto.randomUUID(), version: 1, examVersion: 1, createdAt: new Date().toISOString()};
            all.push(saved);
        }
        localStorage.setItem("mock-exams", JSON.stringify(all));
        return saved;
    }
    function remove(id) {
        const all = readExams();
        localStorage.setItem("mock-exams", JSON.stringify(all.filter(e => e && e.id !== id)));
    }
    function validResult(r) {
        if (!r || r.version !== 1 || !text(r.examTitle) || !text(r.submittedAt) || !Number.isFinite(Date.parse(r.submittedAt)) ||
            !Number.isSafeInteger(r.totalQuestions) || r.totalQuestions < 1 || !Number.isSafeInteger(r.answeredQuestions) || r.answeredQuestions < 0 || r.answeredQuestions > r.totalQuestions ||
            !Number.isSafeInteger(r.correctQuestions) || r.correctQuestions < 0 || r.correctQuestions > r.answeredQuestions || r.wrongQuestions !== r.answeredQuestions - r.correctQuestions ||
            !Number.isSafeInteger(r.pageLeaveCount) || r.pageLeaveCount < 0 || !["manual", "timeout"].includes(r.reason) ||
            r.score !== Number((r.correctQuestions / r.totalQuestions * 10).toFixed(2)) || !Array.isArray(r.questions) || r.questions.length !== r.totalQuestions) return false;
        return r.questions.every((q, i) => q && q.questionNumber === i + 1 && text(q.questionText) && (q.selectedAnswer === null || keys.includes(q.selectedAnswer)) && keys.includes(q.correctAnswer)) &&
            r.questions.filter(q => q.selectedAnswer !== null).length === r.answeredQuestions && r.questions.filter(q => q.selectedAnswer === q.correctAnswer).length === r.correctQuestions;
    }
    function comparisonKey(r) {
        if (!text(r.examId) || !Number.isSafeInteger(r.examVersion) || r.examVersion < 1 || !text(r.examFingerprint)) return null;
        return JSON.stringify([r.examId, r.examVersion, r.examFingerprint]);
    }
    window.ExamStore = {keys, validate, content, fingerprint, revision, readExams, save, remove, validResult, comparisonKey};
})();
