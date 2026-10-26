(function () {
    "use strict";
    function time(value) { return new Date(value).toLocaleString("vi-VN"); }
    window.renderFocusReport = function (result) {
        const panel = document.querySelector("#focus-report"); if (!panel) return;
        panel.hidden = false;
        const state = document.querySelector("#report-finish-state");
        state.textContent = result.reason === "timeout" ? "Kết thúc do hết thời gian" : "Học sinh chủ động nộp bài";
        document.querySelector("#report-exam-version").textContent = Number.isSafeInteger(result.examVersion) ? "Phiên bản " + result.examVersion : "Kết quả cũ chưa lưu phiên bản đề";
        const timings = document.querySelector("#report-timings");
        if (Number.isFinite(Date.parse(result.startedAt)) && Number.isFinite(Date.parse(result.endedAt))) timings.textContent = "Bắt đầu: " + time(result.startedAt) + ". Kết thúc: " + time(result.endedAt) + ".";
        else timings.textContent = "Lượt cũ chưa lưu thời điểm bắt đầu và kết thúc đầy đủ.";
        const body = document.querySelector("#focus-events-body"); body.replaceChildren();
        const events = Array.isArray(result.leaveEvents) ? result.leaveEvents.filter(e => {
            if (!e || !Number.isFinite(Date.parse(e.hiddenAt))) return false;
            const end = e.visibleAt || e.endedAt;
            return end && Number.isFinite(Date.parse(end)) && Date.parse(end) >= Date.parse(e.hiddenAt);
        }) : [];
        events.forEach((event, i) => {
            const row = document.createElement("tr");
            [i + 1, time(event.hiddenAt), event.visibleAt ? time(event.visibleAt) : "Kết thúc khi trang còn ẩn", Math.max(0, Math.round((Date.parse(event.visibleAt || event.endedAt) - Date.parse(event.hiddenAt)) / 1000)) + " giây"].forEach(value => {
                const cell = document.createElement("td"); cell.textContent = value; row.append(cell);
            }); body.append(row);
        });
        document.querySelector("#focus-events-message").textContent = !Array.isArray(result.leaveEvents) ? "Lượt làm cũ chỉ lưu số lần rời trang, chưa có nhật ký thời điểm." : events.length ? "Các mốc dưới đây là thời điểm trình duyệt ghi nhận trang bị ẩn/quay lại." : result.pageLeaveCount ? "Có lượt rời trang chưa đủ dữ liệu thời điểm để hiển thị." : "Không ghi nhận lần trang bị ẩn trong lượt làm bài này.";
        document.querySelector("#focus-table-wrap").hidden = events.length === 0;
    };
})();
