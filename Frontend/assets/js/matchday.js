(function () {
    "use strict";

    document.documentElement.dataset.club = "arsenal";

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = "#DB0007";

    document.querySelectorAll("[data-club-name]").forEach(element => {
        element.textContent = "MATCHDAY";
    });

    document.querySelectorAll("[data-club-short]").forEach(element => {
        element.textContent = "MD";
    });

    document.querySelectorAll("[data-club-motto]").forEach(element => {
        element.textContent = "RED & WHITE";
    });
})();