(function () {
    "use strict";
    document.documentElement.dataset.club = "arsenal";
    try { localStorage.removeItem("mock-exam-club"); } catch (error) { /* Giao diện đỏ vẫn hoạt động. */ }
})();
