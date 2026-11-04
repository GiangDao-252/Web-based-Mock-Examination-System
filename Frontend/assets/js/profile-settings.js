(function () {
    "use strict";

    const form = document.querySelector("#profile-settings-form");
    if (!form) return;

    const nameInput = form.querySelector("#profile-display-name");
    const goalInput = form.querySelector("#profile-goal");
    const message = form.querySelector("#profile-settings-message");
    const submitButton = form.querySelector('button[type="submit"]');

    let loaded = false;
    let saving = false;

    function setBusy(busy) {
        nameInput.disabled = busy;
        goalInput.disabled = busy;
        submitButton.disabled = busy;
    }

    function showProfile(profile) {
        nameInput.value = profile.display_name;
        goalInput.value = profile.goal || "";

        const session = window.MatchdayAuth.getSession();
        if (session) {
            session.display_name = profile.display_name;
            session.displayName = profile.display_name;

            document.querySelectorAll(".md-nav").forEach(nav => {
                const label = nav.nextElementSibling;
                if (
                    label &&
                    label.tagName === "SPAN" &&
                    label.textContent.startsWith("Đang đăng nhập:")
                ) {
                    label.textContent =
                        "Đang đăng nhập: " + profile.display_name;
                }
            });
        }
    }

    async function loadProfile() {
        setBusy(true);
        message.textContent = "Đang tải hồ sơ…";

        try {
            await window.MatchdayAuth.ready;
            if (!window.MatchdayAuth.getSession()) return;

            const profile = await window.MatchdayAPI.request("/profile");
            showProfile(profile);
            loaded = true;
            message.textContent = "";
        } catch (error) {
            message.textContent =
                error.message + " Hãy tải lại trang để thử lại.";
        } finally {
            setBusy(!loaded);
        }
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (!loaded || saving) return;

        nameInput.setCustomValidity(
            nameInput.value.trim() ? "" : "Hãy nhập tên hiển thị."
        );
        if (!form.reportValidity()) return;

        const body = {
            display_name: nameInput.value.trim(),
            goal: goalInput.value.trim() || null
        };

        saving = true;
        setBusy(true);
        message.textContent = "Đang lưu…";

        try {
            const profile = await window.MatchdayAPI.request("/profile", {
                method: "PATCH",
                body
            });

            showProfile(profile);
            message.textContent = "Đã lưu thông tin cá nhân.";
        } catch (error) {
            message.textContent = error.message;
        } finally {
            saving = false;
            setBusy(false);
        }
    });

    nameInput.addEventListener("input", () => {
        nameInput.setCustomValidity("");
        message.textContent = "";
    });

    goalInput.addEventListener("input", () => {
        message.textContent = "";
    });

    loadProfile();
})();