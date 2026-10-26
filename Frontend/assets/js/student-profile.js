const examList = document.querySelector("#exam-list");

if (examList) {
    const filterButtons = examList.querySelectorAll(".filter-button");
    const examCards = examList.querySelectorAll(".exam-card");
    const filterMessage = examList.querySelector("#exam-filter-message");

    function filterExams(selectedFilter) {
        let visibleCount = 0;

        examCards.forEach(function (card) {
            const shouldShow =
                selectedFilter === "all" ||
                card.dataset.status === selectedFilter;

            card.hidden = !shouldShow;

            if (shouldShow) {
                visibleCount += 1;
            }
        });

        filterButtons.forEach(function (button) {
            const isSelected = button.dataset.filter === selectedFilter;

            button.setAttribute("aria-pressed", String(isSelected));
        });

        filterMessage.textContent =
            "Đang hiển thị " + visibleCount + " đợt thi.";
    }

    filterButtons.forEach(function (button) {
        button.addEventListener("click", function () {
            filterExams(button.dataset.filter);
        });
    });

    filterExams("all");
}