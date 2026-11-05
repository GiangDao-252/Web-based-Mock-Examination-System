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

        // Khôi phục mật khẩu qua OTP.
        const forgotForm = document.querySelector("#forgot-password-form");
        const resetForm = document.querySelector("#reset-password-form");

        if (forgotForm && resetForm) {
            const emailInput = forgotForm.querySelector("#recovery-email");
            const forgotMessage = forgotForm.querySelector("#forgot-message");
            const requestButton = forgotForm.querySelector(".auth-submit");

            const otpInput = resetForm.querySelector("#otp");
            const passwordInput = resetForm.querySelector("#new-password");
            const confirmInput =
                resetForm.querySelector("#confirm-new-password");

            const resetMessage = resetForm.querySelector("#reset-message");
            const resetButton = resetForm.querySelector(".auth-submit");
            const backButton = document.querySelector("#back-to-email");
            const previewButton = document.querySelector("#preview-reset");

            let recoveryEmail = "";
            let requesting = false;
            let resetting = false;
            let cooldownUntil = 0;

            prepareSubmit(requestButton);
            prepareSubmit(resetButton);

            if (previewButton) previewButton.hidden = true;

            const help = resetForm.querySelector(".form-help");
            if (help) {
                help.textContent =
                    "Nhập mã OTP trong email và mật khẩu mới. " +
                    "Mã có hiệu lực 10 phút; chỉ mã được gửi gần nhất còn hiệu lực.";
            }

            passwordInput.maxLength = 128;
            confirmInput.maxLength = 128;

            const resendButton = document.createElement("button");
            resendButton.type = "button";
            resendButton.className = "password-toggle";
            resendButton.textContent = "Gửi lại OTP";

            resetButton.after(resendButton);

            const loginLink = document.createElement("a");
            loginLink.href = "login.html";
            loginLink.className = "secondary-button";
            loginLink.textContent = "Về đăng nhập";
            loginLink.hidden = true;
            resetMessage.after(loginLink);

            function refreshCooldown() {
                const seconds = Math.max(
                    0,
                    Math.ceil((cooldownUntil - Date.now()) / 1000)
                );

                resendButton.disabled =
                    requesting || resetting || seconds > 0;

                resendButton.textContent = seconds > 0
                    ? `Gửi lại OTP sau ${seconds}s`
                    : "Gửi lại OTP";
            }

            async function requestOTP(email) {
                if (!getAuth().apiMode) {
                    throw new Error(
                        "Khôi phục mật khẩu cần bật kết nối backend."
                    );
                }

                const result = await getAPI().request("/forgot-password", {
                    method: "POST",
                    auth: false,
                    body: { email }
                });

                cooldownUntil = Date.now() + 60000;
                refreshCooldown();
                return result;
            }

            forgotForm.addEventListener("submit", async function (event) {
                event.preventDefault();

                if (requesting || !forgotForm.reportValidity()) return;

                requesting = true;
                requestButton.disabled = true;
                forgotMessage.textContent = "Đang yêu cầu mã OTP…";

                try {
                    const email = emailInput.value.trim().toLowerCase();
                    const result = await requestOTP(email);

                    recoveryEmail = email;
                    forgotForm.hidden = true;
                    resetForm.hidden = false;
                    resetForm.reset();
                    loginLink.hidden = true;
                    resetButton.disabled = false;
                    resetMessage.textContent = result.message;
                    otpInput.focus();
                } catch (error) {
                    forgotMessage.textContent =
                        error.message || "Không yêu cầu được mã OTP.";
                } finally {
                    requesting = false;
                    requestButton.disabled = false;
                    refreshCooldown();
                }
            });

            resendButton.addEventListener("click", async function () {
                if (
                    requesting || resetting ||
                    Date.now() < cooldownUntil ||
                    !recoveryEmail
                ) return;

                requesting = true;
                resetButton.disabled = true;
                refreshCooldown();
                resetMessage.textContent = "Đang yêu cầu mã mới…";

                try {
                    const result = await requestOTP(recoveryEmail);
                    otpInput.value = "";
                    resetMessage.textContent = result.message;
                    otpInput.focus();
                } catch (error) {
                    resetMessage.textContent =
                        error.message || "Không gửi lại được mã OTP.";
                } finally {
                    requesting = false;
                    resetButton.disabled = false;
                    refreshCooldown();
                }
            });

            resetForm.addEventListener("submit", async function (event) {
                event.preventDefault();

                if (
                    resetting || requesting ||
                    !resetForm.reportValidity()
                ) return;

                resetMessage.textContent = "";

                if (!recoveryEmail) {
                    resetMessage.textContent =
                        "Hãy quay lại bước nhập email để yêu cầu OTP.";
                    return;
                }

                if (passwordInput.value !== confirmInput.value) {
                    resetMessage.textContent =
                        "Mật khẩu nhập lại chưa khớp.";
                    confirmInput.focus();
                    return;
                }

                resetting = true;
                resetButton.disabled = true;
                if (backButton) backButton.disabled = true;
                refreshCooldown();

                let success = false;

                try {
                    const result = await getAPI().request("/reset-password", {
                        method: "POST",
                        auth: false,
                        body: {
                            email: recoveryEmail,
                            otp: otpInput.value.trim(),
                            new_password: passwordInput.value
                        }
                    });

                    success = true;
                    resetForm.reset();

                    // Xóa token trong tab hiện tại, yêu cầu đăng nhập lại.
                    getAPI().clearToken();

                    resetMessage.textContent = result.message;
                    loginLink.hidden = false;
                    resendButton.hidden = true;
                    if (backButton) backButton.hidden = true;
                    resetButton.textContent = "Đã đổi mật khẩu";
                } catch (error) {
                    resetMessage.textContent =
                        error.message || "Không đổi được mật khẩu.";
                } finally {
                    resetting = false;
                    resetButton.disabled = success;
                    if (backButton) backButton.disabled = false;
                    refreshCooldown();
                }
            });

            if (backButton) {
                backButton.type = "button";

                backButton.addEventListener("click", function () {
                    if (requesting || resetting) return;

                    resetForm.hidden = true;
                    forgotForm.hidden = false;
                    resetForm.reset();
                    resetMessage.textContent = "";
                    forgotMessage.textContent = "";
                    emailInput.focus();
                });
            }

            forgotForm.addEventListener("input", function () {
                forgotMessage.textContent = "";
            });

            const cooldownTimer = setInterval(refreshCooldown, 1000);

            window.addEventListener("pagehide", function () {
                clearInterval(cooldownTimer);
            }, { once: true });
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
