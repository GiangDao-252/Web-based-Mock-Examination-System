# MATCHDAY Backend

Backend FastAPI cho hệ thống tự luyện thi MATCHDAY.

## Trạng thái hiện tại

Đã có:

- Băm mật khẩu Argon2 và kiểm tra hash PBKDF2 của dữ liệu demo.
- Tạo, xác thực JWT và lấy ID người dùng từ token.
- Schema tài khoản, trang cá nhân, đề thi, bài làm và báo cáo.
- Kiểm tra file JSON tối đa 1 MB, từ 1 đến 100 câu.
- API xem trước JSON và tải đề mẫu.
- Hàm so sánh các lượt làm cùng phiên bản đề.

Chưa hoàn thành tích hợp:

- Kết nối PostgreSQL với các API nghiệp vụ.
- Đăng ký, đăng nhập và kiểm tra tài khoản thật.
- Lưu đề, làm bài, lịch sử và báo cáo qua database.
- Kiểm tra quyền sở hữu dữ liệu qua API.

## Cài đặt

Mở terminal tại thư mục Backend.

Tạo môi trường ảo nếu chưa có:

```bash
python3 -m venv .venv
```

Kích hoạt và cài thư viện:

```bash
source .venv/bin/activate
python -m pip install -r requirements-lock.txt
```

File requirements-lock.txt ghi lại phiên bản môi trường phát triển.
Môi trường đã được kiểm thử trên macOS với Python 3.14.3.

## Cấu hình

Nếu chưa có .env, copy .env.example thành .env.

Tạo khóa bí mật:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Điền khóa vào .env:

```dotenv
SECRET_KEY=DIEN_KHOA_VUA_TAO
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

DATABASE_URL sẽ được cấu hình khi tích hợp PostgreSQL.
Không commit .env hoặc gửi khóa bí mật vào tài liệu.

## Chạy server

Chạy từ thư mục Backend:

```bash
python -m uvicorn app.main:app --reload
```

- Tài liệu API: http://127.0.0.1:8000/docs
- Health check: http://127.0.0.1:8000/api/v1/health

## API hiện có

| Phương thức | Đường dẫn              | Chức năng                  |
| ----------- | ---------------------- | -------------------------- |
| GET         | /api/v1/health         | Kiểm tra API đang chạy     |
| GET         | /api/v1/exams/template | Tải đề JSON mẫu            |
| POST        | /api/v1/exams/preview  | Kiểm tra và xem trước JSON |

API preview nhận multipart/form-data với trường file và yêu cầu
Authorization: Bearer <token>.

Hiện dependency chỉ xác thực JWT và định dạng ID.
Chưa kiểm tra tài khoản tồn tại hoặc is_active trong database.

Đường dẫn /api/v1/token trong cấu hình OAuth2 là địa chỉ dự kiến;
không đồng nghĩa endpoint đăng nhập đã được triển khai.

## Frontend

Mở Frontend bằng Live Server trên cổng 5500.

Giữ cấu hình sau trong assets/js/api-config.js khi dùng chế độ demo:

```javascript
window.MATCHDAY_API_MODE = false;
```

Trong chế độ demo, đề và bài làm vẫn lưu trong trình duyệt.
Nút tải JSON mẫu gọi backend thật.
Luồng gọi API preview đã chuẩn bị nhưng cần đăng nhập thật để sử dụng.

## Kiểm thử

```bash
python -m pytest tests -v
```

Các test hiện tại không yêu cầu PostgreSQL.
Test đạt không đồng nghĩa tích hợp database đã hoàn thành.

## Lưu ý khi tích hợp database

- Dùng chung kết nối và session do nhóm thống nhất.
- Lấy ID người dùng từ token, không lấy từ request body.
- Không trả đáp án đúng hoặc lời giải khi bài đang làm.
- Lọc lịch sử và báo cáo theo tài khoản đăng nhập.
- Trước khi gọi create_exam_version, bỏ explanation có giá trị None:

```python
questions = [
    question.model_dump(exclude_none=True)
    for question in exam.questions
]
```

- Hàm so sánh chỉ xử lý dữ liệu đã được kiểm tra quyền truy cập.
- Không chạy đồng thời schema SQL và lệnh tự tạo bảng ORM trên
  cùng database khi chưa thống nhất cách quản lý migration.
