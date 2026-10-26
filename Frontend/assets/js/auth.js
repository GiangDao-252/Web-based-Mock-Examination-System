console.log("auth.js đã được tải");
const registerForm = document.querySelector("#register-form");
if (registerForm) {
    const fullNameInput = registerForm.querySelector("#full-name");
    const passwordInput = registerForm.querySelector("#password");
    const confirmPasswordInput = registerForm.querySelector("#confirm-password");
    const message = registerForm.querySelector("#register-message");
    const submitButton = registerForm.querySelector(".auth-submit");

    registerForm.addEventListener("submit", function(event) {
        event.preventDefault();

        message.textContent = "";

        if (fullNameInput.value.trim() === "") {
            message.textContent = "Vui lòng nhập họ và tên";
            fullNameInput.focus();
            return;
        }

        if (passwordInput.value.length < 8) {
            message.textContent = "Mật khẩu cần có ít nhất 8 ký tự.";
            passwordInput.focus();
            return;
        }

        if (passwordInput.value !== confirmPasswordInput.value) {
            message.textContent = "Mật khẩu nhập lại chưa khớp";
            confirmPasswordInput.focus();
            return;
        }

        message.textContent = "Thông tin hợp lệ. Chưa tạo tài khoản vì chưa kết nối máy chủ";
    });

    registerForm.addEventListener("input", function(){
        message.textContent = "";
    });

    submitButton.type = "submit";
    submitButton.disabled = false;
}

const passwordToggleButtons =
    document.querySelectorAll(".password-toggle[data-target]");

passwordToggleButtons.forEach(function (button) {
    const input = document.getElementById(button.dataset.target);

    if (!input) {
        return;
    }

    button.addEventListener("click", function() {
        const shouldShow = input.type ==="password";

        input.type = shouldShow ? "text" : "password";

        button.textContent = shouldShow
            ? "Ẩn mật khẩu"
            : "Hiện mật khẩu";

            button.setAttribute("aria-pressed", String(shouldShow));
    });
});

const loginForm = document.querySelector("#login-form");

if (loginForm) {
    const message = loginForm.querySelector("#login-message");
    const submitButton = loginForm.querySelector(".auth-submit");

    loginForm.addEventListener("submit", function (event) {
        event.preventDefault();

        try {
            const email = loginForm.querySelector("#email").value;
            const password = loginForm.querySelector("#password").value;
            if (!window.MatchdayAuth.loginDemo(email, password)) {
                message.textContent = "Tài khoản demo chưa đúng. Dùng thông tin mô phỏng hiển thị phía trên.";
                return;
            }
            window.location.replace(window.MatchdayAuth.getNextPage());
        } catch (error) {
            message.textContent = "Không tạo được phiên demo trong tab này. Vui lòng cho phép lưu dữ liệu trang web.";
        }
    });
    loginForm.addEventListener("input", function () {
        message.textContent = "";
    });

    submitButton.type = "submit";
    submitButton.disabled = false;
}

const forgotForm = document.querySelector("#forgot-password-form");

if (forgotForm) {
    const message = forgotForm.querySelector("#forgot-message");
    const submitButton = forgotForm.querySelector(".auth-submit");

    forgotForm.addEventListener("submit", function (event) {
        event.preventDefault();

        message.textContent =
            "Email đúng định dạng. Chưa gửi OTP vì chưa kết nối máy chủ.";
    });

    forgotForm.addEventListener("input", function () {
        message.textContent = "";
    });

    submitButton.type = "submit";
    submitButton.disabled = false;
}

const resetForm = document.querySelector("#reset-password-form");
const previewResetButton = document.querySelector("#preview-reset");

if (resetForm && previewResetButton) {
    const emailForm = document.querySelector("#forgot-password-form");
    const otpInput = resetForm.querySelector("#otp");
    const newPasswordInput = resetForm.querySelector("#new-password");
    const confirmNewPasswordInput =
        resetForm.querySelector("#confirm-new-password");
    const resetMessage = resetForm.querySelector("#reset-message");
    const resetSubmitButton = resetForm.querySelector(".auth-submit");

    previewResetButton.addEventListener("click", function () {
        if (!emailForm.reportValidity()) {
            return;
        }

        emailForm.hidden = true;
        previewResetButton.hidden = true;
        resetForm.hidden = false;
        otpInput.focus();
    });

    resetForm.addEventListener("submit", function (event) {
        event.preventDefault();
        resetMessage.textContent = "";

        if (newPasswordInput.value.length < 8) {
            resetMessage.textContent =
                "Mật khẩu mới cần có ít nhất 8 ký tự.";
            newPasswordInput.focus();
            return;
        }

        if (newPasswordInput.value !== confirmNewPasswordInput.value) {
            resetMessage.textContent =
                "Mật khẩu nhập lại chưa khớp.";
            confirmNewPasswordInput.focus();
            return;
        }

        resetMessage.textContent =
            "Dữ liệu đúng định dạng. Chưa xác minh OTP hoặc đổi mật khẩu vì chưa kết nối máy chủ.";
    });

    resetForm.addEventListener("input", function () {
        resetMessage.textContent = "";
    });

    resetSubmitButton.type = "submit";
    resetSubmitButton.disabled = false;

    const backToEmailButton = document.querySelector("#back-to-email");

if (backToEmailButton) {
    backToEmailButton.addEventListener("click", function () {
        resetForm.hidden = true;
        emailForm.hidden = false;
        previewResetButton.hidden = false;

        resetForm.reset();
        resetMessage.textContent = "";

        resetForm.querySelectorAll(".password-toggle[data-target]").forEach(function (button) {
            const input = document.getElementById(button.dataset.target);

            if (input) {
                input.type = "password";
                button.textContent = "Hiện mật khẩu";
                button.setAttribute("aria-pressed", "false");
            }
        });

        emailForm.querySelector("#recovery-email").focus();
    });
}
}
const fillDemoButton = document.querySelector("#fill-demo-account");
if (fillDemoButton && loginForm) {
    fillDemoButton.addEventListener("click", function () {
        loginForm.querySelector("#email").value = "demo@matchday.local";
        loginForm.querySelector("#password").value = "Matchday123!";
        loginForm.querySelector("#login-message").textContent = "Đã điền tài khoản mô phỏng. Bấm Đăng nhập demo để tiếp tục.";
    });
}
