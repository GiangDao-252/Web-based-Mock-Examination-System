(function () {
    "use strict";

    console.log("auth.js đã được tải — v8");

    // Chụp đường dẫn trở về trước khi người dùng đăng nhập.
    const script = document.currentScript;
    const root = new URL("../../", script.src);
    const requestedNext = new URLSearchParams(location.search).get("next");

    const allowedPages = new Set([
        "student/profile.html",
        "student/exams.html",
        "student/my-exams.html",
        "student/upload-exam.html",
        "student/exam.html",
        "student/report.html"
    ]);

    function resolveNextPage() {
        const fallback = new URL("student/exams.html", root);

        if (!requestedNext) return fallback.href;

        try {
            const target = new URL(requestedNext, root);

            if (
                target.origin !== root.origin ||
                !target.pathname.startsWith(root.pathname)
            ) {
                return fallback.href;
            }

            const page = target.pathname.slice(root.pathname.length);

            if (!allowedPages.has(page)) return fallback.href;

            target.hash = "";
            return target.href;
        } catch {
            return fallback.href;
        }
    }

    const nextPage = resolveNextPage();

    console.log("Trang sau đăng nhập:", nextPage);

    function getAuth() {
        if (!window.MatchdayAuth) {
            throw new Error(
                "Chưa tải được auth-session.js. Hãy tải lại trang."
            );
        }

        return window.MatchdayAuth;
    }

    function getAPI() {
        if (!window.MatchdayAPI) {
            throw new Error(
                "Chưa tải được api.js. Hãy tải lại trang."
            );
        }

        return window.MatchdayAPI;
    }

    function prepareSubmit(button) {
        if (!button) return;

        button.type = "submit";
        button.disabled = false;
    }

    // Hiện / ẩn mật khẩu.
    document
        .querySelectorAll(".password-toggle[data-target]")
        .forEach(function (button) {
            const input = document.getElementById(button.dataset.target);

            if (!input) return;

            button.type = "button";

            button.addEventListener("click", function () {
                const show = input.type === "password";

                input.type = show ? "text" : "password";
                button.textContent = show
                    ? "Ẩn mật khẩu"
                    : "Hiện mật khẩu";
                button.setAttribute("aria-pressed", String(show));
            });
        });

    // Đăng ký.
    const registerForm = document.querySelector("#register-form");

    if (registerForm) {
        const fullNameInput = registerForm.querySelector("#full-name");
        const emailInput = registerForm.querySelector('input[type="email"]');
        const passwordInput = registerForm.querySelector("#password");
        const confirmInput = registerForm.querySelector("#confirm-password");
        const message = registerForm.querySelector("#register-message");
        const button = registerForm.querySelector(".auth-submit");

        let submitting = false;

        prepareSubmit(button);

        registerForm.addEventListener("submit", async function (event) {
            event.preventDefault();

            if (submitting || !registerForm.reportValidity()) return;

            message.textContent = "";

            if (!fullNameInput.value.trim()) {
                message.textContent = "Vui lòng nhập họ và tên.";
                fullNameInput.focus();
                return;
            }

            if (passwordInput.value.length < 8) {
                message.textContent = "Mật khẩu cần có ít nhất 8 ký tự.";
                passwordInput.focus();
                return;
            }

            if (passwordInput.value !== confirmInput.value) {
                message.textContent = "Mật khẩu nhập lại chưa khớp.";
                confirmInput.focus();
                return;
            }

            try {
                const auth = getAuth();

                if (!auth.apiMode) {
                    message.textContent =
                        "Thông tin hợp lệ. Chế độ demo chưa tạo tài khoản thật.";
                    return;
                }

                submitting = true;
                button.disabled = true;

                await getAPI().request("/register", {
                    method: "POST",
                    auth: false,
                    body: {
                        email: emailInput.value.trim().toLowerCase(),
                        display_name: fullNameInput.value.trim(),
                        password: passwordInput.value
                    }
                });

                registerForm.reset();
                message.textContent =
                    "Đã đăng ký thành công. Bạn có thể sang trang đăng nhập.";
            } catch (error) {
                message.textContent =
                    error.message || "Không đăng ký được.";
            } finally {
                submitting = false;
                button.disabled = false;
            }
        });

        registerForm.addEventListener("input", function () {
            message.textContent = "";
        });
    }

    // Đăng nhập.
    const loginForm = document.querySelector("#login-form");

    if (loginForm) {
        const emailInput = loginForm.querySelector("#email");
        const passwordInput = loginForm.querySelector("#password");
        const message = loginForm.querySelector("#login-message");
        const button = loginForm.querySelector(".auth-submit");

        let submitting = false;

        prepareSubmit(button);

        loginForm.addEventListener("submit", async function (event) {
            event.preventDefault();

            if (submitting || !loginForm.reportValidity()) return;

            message.textContent = "";
            submitting = true;
            button.disabled = true;

            try {
                const auth = getAuth();
                const email = emailInput.value.trim().toLowerCase();

                // Giữ nguyên mật khẩu, không trim hoặc đổi chữ hoa/thường.
                const password = passwordInput.value;

                if (auth.apiMode) {
                    const api = getAPI();

                    await api.login(email, password);

                    try {
                        await api.request("/me");
                    } catch (error) {
                        api.clearToken();
                        throw error;
                    }
                } else if (!auth.loginDemo(email, password)) {
                    message.textContent =
                        "Tài khoản demo chưa đúng. Kiểm tra lại email và mật khẩu.";
                    return;
                }

                console.log("Đăng nhập thành công. Mở:", nextPage);
                window.location.replace(nextPage);
            } catch (error) {
                message.textContent =
                    error.message || "Không đăng nhập được.";
            } finally {
                submitting = false;
                button.disabled = false;
            }
        });

        loginForm.addEventListener("input", function () {
            message.textContent = "";
        });
    }

    // Điền tài khoản demo.
    const fillDemoButton = document.querySelector("#fill-demo-account");

    if (fillDemoButton && loginForm) {
        fillDemoButton.type = "button";

        fillDemoButton.addEventListener("click", function () {
            const message = loginForm.querySelector("#login-message");

            try {
                loginForm.querySelector("#email").value =
                    "demo@matchday.local";

                loginForm.querySelector("#password").value =
                    getAuth().apiMode
                        ? "MatchdayDemo!2026"
                        : "Matchday123!";

                message.textContent =
                    "Đã điền tài khoản demo. Bấm Đăng nhập để tiếp tục.";
            } catch (error) {
                message.textContent = error.message;
            }
        });
    }

    // Quên mật khẩu: hiện chưa có API gửi OTP.
    const forgotForm = document.querySelector("#forgot-password-form");

    if (forgotForm) {
        const message = forgotForm.querySelector("#forgot-message");
        const button = forgotForm.querySelector(".auth-submit");

        prepareSubmit(button);

        forgotForm.addEventListener("submit", function (event) {
            event.preventDefault();

            if (!forgotForm.reportValidity()) return;

            message.textContent =
                "Email đúng định dạng. Chức năng gửi OTP chưa được kết nối.";
        });

        forgotForm.addEventListener("input", function () {
            message.textContent = "";
        });
    }

    // Xem thử giao diện đặt lại mật khẩu.
    const resetForm = document.querySelector("#reset-password-form");
    const previewResetButton = document.querySelector("#preview-reset");

    if (resetForm && previewResetButton && forgotForm) {
        const otpInput = resetForm.querySelector("#otp");
        const passwordInput = resetForm.querySelector("#new-password");
        const confirmInput =
            resetForm.querySelector("#confirm-new-password");
        const message = resetForm.querySelector("#reset-message");
        const button = resetForm.querySelector(".auth-submit");
        const backButton = document.querySelector("#back-to-email");

        prepareSubmit(button);
        previewResetButton.type = "button";

        previewResetButton.addEventListener("click", function () {
            if (!forgotForm.reportValidity()) return;

            forgotForm.hidden = true;
            previewResetButton.hidden = true;
            resetForm.hidden = false;
            otpInput.focus();
        });

        resetForm.addEventListener("submit", function (event) {
            event.preventDefault();

            if (!resetForm.reportValidity()) return;

            message.textContent = "";

            if (passwordInput.value.length < 8) {
                message.textContent =
                    "Mật khẩu mới cần có ít nhất 8 ký tự.";
                passwordInput.focus();
                return;
            }

            if (passwordInput.value !== confirmInput.value) {
                message.textContent = "Mật khẩu nhập lại chưa khớp.";
                confirmInput.focus();
                return;
            }

            message.textContent =
                "Dữ liệu đúng định dạng. Chức năng xác minh OTP và đổi mật khẩu chưa được kết nối.";
        });

        resetForm.addEventListener("input", function () {
            message.textContent = "";
        });

        if (backButton) {
            backButton.type = "button";

            backButton.addEventListener("click", function () {
                resetForm.hidden = true;
                forgotForm.hidden = false;
                previewResetButton.hidden = false;

                resetForm.reset();
                message.textContent = "";

                resetForm
                    .querySelectorAll(".password-toggle[data-target]")
                    .forEach(function (toggle) {
                        const input = document.getElementById(
                            toggle.dataset.target
                        );

                        if (!input) return;

                        input.type = "password";
                        toggle.textContent = "Hiện mật khẩu";
                        toggle.setAttribute("aria-pressed", "false");
                    });

                const emailInput =
                    forgotForm.querySelector("#recovery-email");

                if (emailInput) emailInput.focus();
            });
        }
    }

    if (window.MatchdayAuth && window.MatchdayAuth.apiMode) {
        document.querySelectorAll(".md-demo-notice").forEach(function (el) {
            el.hidden = true;
        });

        if (loginForm) {
            loginForm.querySelector(".auth-submit").textContent =
                "Đăng nhập";
        }
    }
})();