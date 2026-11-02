(function () {
    "use strict";

    const base = "http://127.0.0.1:8000/api/v1";
    const key = "matchday-access-token";

    async function request(path, options = {}) {
        const headers = new Headers({
            Accept: "application/json"
        });

        const token = sessionStorage.getItem(key);

        if (options.auth !== false && token) {
            headers.set("Authorization", "Bearer " + token);
        }

        let body;

        if (options.body instanceof FormData) {
            body = options.body;
            // Trình duyệt tự đặt Content-Type kèm multipart boundary.
        } else if (options.body !== undefined) {
            if (options.form) {
                body = new URLSearchParams(options.body);
                headers.set(
                    "Content-Type",
                    "application/x-www-form-urlencoded"
                );
            } else {
                body = JSON.stringify(options.body);
                headers.set("Content-Type", "application/json");
            }
        }

        const response = await fetch(base + path, {
            method: options.method || "GET",
            headers,
            body
        });

        const text = await response.text();
        let data = null;

        if (text) {
            try {
                data = JSON.parse(text);
            } catch {
                const error = new Error(
                    "Máy chủ trả về phản hồi không đúng định dạng JSON."
                );
                error.status = response.status;
                throw error;
            }
        }

        if (!response.ok) {
            let detail = "Không thực hiện được yêu cầu.";

            if (typeof data?.detail === "string") {
                detail = data.detail;
            } else if (Array.isArray(data?.detail)) {
                detail = data.detail.map(item => {
                    const location = Array.isArray(item.loc)
                        ? item.loc.join(".")
                        : "";

                    return location + ": " + item.msg;
                }).join("; ");
            }

            const error = new Error(detail);
            error.status = response.status;
            throw error;
        }

        return data;
    }

    async function login(username, password) {
        const result = await request("/token", {
            method: "POST",
            auth: false,
            form: true,
            body: { username, password }
        });

        if (
            typeof result?.access_token !== "string" ||
            !result.access_token
        ) {
            throw new Error("Token không hợp lệ.");
        }

        sessionStorage.setItem(key, result.access_token);
        return result;
    }

    async function previewExam(file) {
        if (!sessionStorage.getItem(key)) {
            throw new Error(
                "Bạn cần đăng nhập để kiểm tra đề trên máy chủ."
            );
        }

        const body = new FormData();
        body.append("file", file);

        return request("/exams/preview", {
            method: "POST",
            body
        });
    }

    window.MatchdayAPI = {
        request,
        login,
        previewExam,
        clearToken: () => sessionStorage.removeItem(key),
        getToken: () => sessionStorage.getItem(key)
    };
})();