# MATCHDAY Backend

FastAPI và PostgreSQL phục vụ tài khoản, quản lý đề, đồng bộ lượt thi và báo cáo.

## Cài đặt local

Chuẩn bị PostgreSQL theo [README chính](../README.md#63-chuẩn-bị-database).
Với database đã có schema, kiểm tra và áp dụng các script 04 (OTP) và
05 (môn học) còn thiếu. Không chạy lại schema hoặc seed trên database đã có dữ liệu.

Từ thư mục Backend, dùng Python 3.14 như CI:

    python3 -m venv .venv
    source .venv/bin/activate
    python -m pip install -r requirements-lock.txt

Nếu chưa có .env, sao chép .env.example thành .env. Điền nhóm DB_* hoặc
DATABASE_URL. Tạo SECRET_KEY bằng lệnh:

    python -c "import secrets; print(secrets.token_hex(32))"

Phiên mặc định là 180 phút. Nếu dùng đặt lại mật khẩu, điền nhóm SMTP_*
và tạo một khóa riêng cho OTP_SECRET bằng lệnh trên. Không commit .env.

Để nhập PDF scan trên macOS, cài Poppler và Tesseract:

    brew install poppler tesseract tesseract-lang
    tesseract --list-langs

Kiểm tra danh sách có vie và eng. PDF scan tối đa 5 trang.

## Chạy và kiểm thử

    python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

- Swagger: <http://127.0.0.1:8000/docs>
- Health check: <http://127.0.0.1:8000/health>
- Frontend: phục vụ thư mục Frontend trên cổng 5500, bật MATCHDAY_API_MODE.

| API nhập đề | Chức năng |
| --- | --- |
| GET /api/v1/exams/template | Tải đề JSON mẫu |
| POST /api/v1/exams/preview | Kiểm tra JSON, tối đa 1 MB |
| POST /api/v1/exams/convert | Chuyển DOCX hoặc PDF thành bản nháp, tối đa 10 MB |

Hai API POST nhận multipart/form-data với trường file và yêu cầu Bearer token.
Đối chiếu công thức và đáp án với tài liệu gốc trước khi lưu.

Chạy bộ kiểm thử:

    python -m pytest tests -v
