# MATCHDAY — Web-based Mock Examination System

![Status](https://img.shields.io/badge/Status-Local%20Integrated%20MVP-DB0007)
![Platform](https://img.shields.io/badge/Platform-Web--based-lightgrey)
![Scope](https://img.shields.io/badge/Scope-Student%20Self--practice-1C2C5B)

**MATCHDAY** là hệ thống thi thử dành cho học sinh, hỗ trợ quản lý đề cá nhân, luyện tập có giới hạn thời gian, xem lại bài làm và theo dõi kết quả.

Hệ thống sử dụng **HTML/CSS/JavaScript**, **FastAPI** và **PostgreSQL**. Tài khoản, hồ sơ, đề thi, đáp án và kết quả được lưu trong database. Trình duyệt giữ bản nháp tạm thời để hỗ trợ khôi phục bài đang làm.

Giao diện mang phong cách bóng đá với nhận diện MATCHDAY và màu đỏ–trắng.

> Phiên bản nộp bài chạy trên môi trường local. Không yêu cầu triển khai công khai. Frontend, backend và PostgreSQL cần hoạt động đồng thời để sử dụng đầy đủ chức năng.

## 1. Mục tiêu và phạm vi

- Cung cấp môi trường tự luyện thi trên máy tính và màn hình nhỏ.
- Cho phép học sinh tạo, nhập JSON, Word hoặc PDF và chỉnh sửa đề cá nhân.
- Hiển thị câu hỏi, lựa chọn và lời giải có công thức toán học.
- Đồng bộ đáp án và lưu kết quả theo tài khoản.
- Xem lại các lượt thi và so sánh kết quả của cùng phiên bản đề.
- Ghi nhận trạng thái trang thi bị ẩn để hỗ trợ tự đánh giá sự tập trung.

Hệ thống tập trung vào **học sinh tự luyện tập**. Không có giao diện giáo viên, quản trị viên, giám thị hoặc AI giám sát.

## 2. Tính năng

### 2.1. Tài khoản và trang cá nhân

- Đăng ký tài khoản.
- Đăng nhập bằng email và mật khẩu.
- Băm mật khẩu và cấp JWT tại backend. Phiên mặc định kéo dài 3 giờ.
- Kiểm tra phiên trước khi mở các trang được bảo vệ.
- Đăng xuất bằng cách xóa phiên/token phía trình duyệt.
- Cập nhật tên hiển thị và mục tiêu học tập.
- Lưu thông tin tài khoản và hồ sơ trong PostgreSQL.
- Hiển thị số lượt đã hoàn thành, điểm trung bình và điểm cao nhất.
- Hiển thị ba lượt hoàn thành gần nhất và liên kết xem lại.

**Khôi phục mật khẩu qua email/OTP** cần script SQL 04 và SMTP đã cấu hình.

### 2.2. Đề mẫu và đề cá nhân

- Chọn đề mẫu để luyện tập.
- Nhập JSON, Word (.docx), PDF hoặc tạo đề trực tiếp.
- Nhận dạng PDF scan bằng OCR trên máy chạy backend.
- Lưu và mở bản nháp trong trình duyệt.
- Đặt tên và thời lượng.
- Thêm, sửa và xóa câu hỏi.
- Nhập bốn lựa chọn A–D và một đáp án đúng.
- Bổ sung lời giải tùy chọn.
- Xem trước nội dung và công thức trước khi lưu.
- Tải đề cá nhân dưới dạng JSON.
- Chỉnh sửa đề bằng cách tạo phiên bản mới.
- Kiểm tra quyền sở hữu khi truy cập hoặc chỉnh sửa đề.
- Giữ phiên bản đã xuất bản để bảo toàn nội dung các lượt thi cũ.

| Nội dung | Giới hạn |
| --- | --- |
| Định dạng nhập file | JSON, DOCX, PDF |
| Kích thước file nhập | JSON: 1 MB; DOCX và PDF: 10 MB |
| Số trang PDF | Tối đa 30 trang nếu có chữ; 5 trang nếu cần OCR |
| Số câu hỏi | 1–100 câu |
| Lựa chọn mỗi câu | Bốn lựa chọn A–D |
| Đáp án đúng | Một đáp án mỗi câu |
| Thời lượng | 1–180 phút |

Kiểm tra bản nháp trước khi lưu. Bảng đáp án PDF dạng `1.B 2.C` có thể được ghép theo số câu.

### 2.3. Công thức toán học

MathJax hiển thị công thức LaTeX trong câu hỏi, lựa chọn, lời giải, bản xem trước và báo cáo.

Ví dụ nhập trực tiếp:

```latex
Tính tích phân \( \int_0^1 x^2\,dx \).
```

Trong chuỗi JSON, dấu `\` cần được viết thành `\\`:

```json
{
  "text": "Tính tích phân \\( \\int_0^1 x^2\\,dx \\)."
}
```

MathJax được đóng gói trong frontend. Hệ thống chưa hỗ trợ nhận dạng công thức từ ảnh hoặc chấm tự luận toán.

### 2.4. Làm bài thi

- Hiển thị tên đề, phiên bản, số câu, thời lượng và hướng dẫn trước khi bắt đầu.
- Tạo hoặc khôi phục lượt thi thông qua backend.
- Sử dụng thời điểm bắt đầu và hạn giờ được lưu tại database.
- Chọn đáp án, chuyển câu và đánh dấu câu cần xem lại.
- Hiển thị tiến độ trả lời và thời gian còn lại.
- Đồng bộ đáp án, cờ đánh dấu và câu hiện tại với backend.
- Giữ bản nháp trong cùng tab để hỗ trợ khôi phục.
- Xác nhận trước khi nộp.
- Gửi yêu cầu kết thúc khi hết giờ; database xác định trạng thái cuối cùng.
- Không cho chỉnh sửa lượt đã hoàn tất qua luồng lưu thông thường.

Tải lại trang hoặc chuyển tab không khởi động lại hạn giờ.

Việc khôi phục phụ thuộc vào trạng thái đã lưu và bản nháp còn tồn tại. Hệ thống không cam kết khôi phục mọi thay đổi chưa đồng bộ khi đóng tab hoặc xóa dữ liệu trình duyệt.

### 2.5. Ghi nhận rời trang

- Ghi nhận sự kiện trang thi bị ẩn và quay lại.
- Gửi mã sự kiện và các mốc thời gian tới backend.
- Lưu sự kiện theo lượt thi.
- Hiển thị số lần rời trang trong kết quả.

Chỉ số này phản ánh trạng thái hiển thị của trình duyệt. Nó không xác định nguyên nhân rời trang, không chứng minh gian lận và không ảnh hưởng điểm số.

Hệ thống không chặn đổi tab hoặc tự đình chỉ bài thi theo chỉ số này.

### 2.6. Kết quả, lịch sử và so sánh

- Lấy điểm và thống kê từ database.
- Hiển thị số câu đúng, sai và chưa trả lời.
- Xem đáp án đã chọn, đáp án đúng và lời giải.
- Mở báo cáo bằng URL có `?attemptId=...`.
- Giới hạn quyền xem báo cáo theo tài khoản sở hữu lượt thi.
- Giữ kết quả gắn với phiên bản đề đã làm.
- Nhóm các lượt hoàn thành theo `examVersionId`.
- So sánh điểm lượt mới nhất với lượt đầu trong nhóm.

Chênh lệch điểm mô tả kết quả đã ghi nhận, không chứng minh hiệu quả học tập hoặc điều kiện làm bài tương đương. Hệ thống không quy đổi kết quả thành thứ hạng toàn quốc.

## 3. Quy tắc chấm điểm

```text
Điểm = Số câu đúng / Tổng số câu × 10
```

- Các câu có trọng số bằng nhau.
- Câu sai hoặc bỏ trống không được tính điểm.
- Điểm làm tròn đến hai chữ số thập phân.
- Số câu sai không bao gồm câu chưa trả lời.
- Database tính điểm và số câu đúng; không chấp nhận điểm do frontend tự khai báo.
- Số lần rời trang không làm thay đổi điểm.

## 4. Kiến trúc và công nghệ

| Thành phần | Công nghệ / vai trò |
| --- | --- |
| Frontend | HTML5, CSS3, JavaScript |
| Giao tiếp API | Fetch API, JSON, Bearer token |
| Backend | Python, FastAPI, Uvicorn |
| Kiểm tra dữ liệu | Pydantic |
| Xác thực | JWT; Argon2 cho mật khẩu mới |
| Tương thích dữ liệu seed | Xác minh mật khẩu PBKDF2 |
| Database | PostgreSQL |
| Truy cập database | Psycopg |
| Logic dữ liệu | Constraints, functions, triggers, views |
| Công thức toán | MathJax |
| Bản nháp trình duyệt | sessionStorage |
| Quản lý mã nguồn | Git, GitHub |

Luồng xử lý chính:

1. Trình duyệt gửi yêu cầu tới API.
2. Backend kiểm tra token, dữ liệu và quyền truy cập.
3. Backend truy vấn hoặc gọi hàm PostgreSQL.
4. Database áp dụng các quy tắc toàn vẹn và xử lý dữ liệu.
5. Backend trả JSON để frontend cập nhật giao diện.

Trình duyệt không kết nối trực tiếp tới PostgreSQL.

## 5. Cấu trúc mã nguồn

Các thành phần chính:

| Đường dẫn | Nội dung |
| --- | --- |
| `Frontend/index.html` | Trang chủ |
| `Frontend/auth/` | Đăng nhập, đăng ký, giao diện quên mật khẩu |
| `Frontend/student/` | Hồ sơ, danh sách đề, biên soạn đề, làm bài, báo cáo |
| `Frontend/assets/css/` | CSS dùng chung và theo trang |
| `Frontend/assets/js/` | API client, xác thực và xử lý giao diện |
| `Frontend/assets/vendor/mathjax/` | Thư viện hiển thị công thức |
| `Frontend/data/` | Dữ liệu mẫu |
| `Backend/app/main.py` | Khởi tạo ứng dụng và đăng ký router |
| `Backend/app/config.py` | Cấu hình ứng dụng |
| `Backend/app/database.py` | Kết nối PostgreSQL |
| `Backend/app/security.py` | Băm mật khẩu và JWT |
| `Backend/app/dependencies.py` | Dependency xác thực |
| `Backend/app/routers/` | Các API theo tài nguyên |
| `Backend/app/schemas/` | Schema request và response |
| `Backend/app/services/` | Các xử lý hỗ trợ |
| `Backend/requirements.txt` | Thư viện Python |
| `matchday_database/` | Schema, seed và script kiểm tra |
| `.github/workflows/` | Các workflow của repository |

Các module frontend tích hợp chính:

| File | Vai trò |
| --- | --- |
| `api-config.js`, `api.js` | Cấu hình và gửi yêu cầu API |
| `auth.js` | Giao diện đăng nhập và đăng ký |
| `auth-session.js`, `auth-guard.js` | Phiên đăng nhập và bảo vệ trang |
| `exam-catalogue.js` | Danh sách đề mẫu |
| `my-exams.js` | Quản lý đề cá nhân |
| `upload-exam.js` | Nhập, chỉnh sửa và xem trước đề |
| `exam-engine.js` | Nạp lượt thi, đồng hồ, đáp án, đồng bộ và nộp bài |
| `history.js`, `comparison.js` | Lịch sử và so sánh kết quả |
| `profile-settings.js` | Cập nhật hồ sơ |
| `report.js` | Đọc và hiển thị báo cáo từ API |
| `math-render.js` | Hiển thị công thức |

Repository có thể còn các module từ giai đoạn frontend demo. Sự hiện diện của file không đồng nghĩa module đó đang được dùng trong luồng API hiện tại.

## 6. Cài đặt và chạy local

### 6.1. Yêu cầu

- Git.
- Python và công cụ tạo môi trường ảo.
- PostgreSQL đang hoạt động.
- pgAdmin hoặc công cụ chạy SQL tương đương.
- Trình duyệt hiện đại.

Không cần `npm install` hoặc `npm start`.

### 6.2. Tải mã nguồn

```bash
git clone https://github.com/GiangDao-252/Web-based-Mock-Examination-System.git
cd Web-based-Mock-Examination-System
```

### 6.3. Chuẩn bị database

Tạo database `matchday` trong PostgreSQL.

Với **database mới**, kết nối đúng database rồi chạy lần lượt:

1. `matchday_database/01_schema.sql`
2. `matchday_database/02_seed.sql`
3. `matchday_database/04_password_reset.sql`
4. `matchday_database/05_subject_categories.sql`
5. `matchday_database/03_verify.sql` để kiểm tra schema và dữ liệu mẫu

Đọc thêm hướng dẫn trong `matchday_database/README_VI.md`.

`02_seed_existing_users.sql` phục vụ trường hợp đã có dữ liệu người dùng. Không tự động chạy cả hai phương án seed trên cùng database.

Không chạy lại script tạo schema trên database có dữ liệu quan trọng khi chưa xem nội dung và sao lưu.

### 6.4. Cài đặt backend

Từ thư mục gốc repository:

```bash
cd Backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-lock.txt
cp .env.example .env
```

Chỉnh `Backend/.env` theo `.env.example`:

- Thông tin kết nối PostgreSQL trên máy.
- Tên database.
- Khóa ký JWT.
- Các cấu hình liên quan được ứng dụng yêu cầu.

Không đưa file `.env` chứa thông tin thật lên GitHub. Giữ `ACCESS_TOKEN_EXPIRE_MINUTES=180` cho phiên 3 giờ. Nếu dùng OTP, điền các biến SMTP và `OTP_SECRET`.

Để nhập PDF scan trên macOS, cài công cụ OCR:

    brew install poppler tesseract tesseract-lang
    tesseract --list-langs

Kiểm tra danh sách ngôn ngữ có `vie` và `eng`.

### 6.5. Khởi động backend

Trong thư mục `Backend`:

```bash
source .venv/bin/activate
python -m uvicorn app.main:app --reload \
    --host 127.0.0.1 --port 8000
```

Tài liệu Swagger:

[http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

Giữ terminal này chạy.

### 6.6. Khởi động frontend

Mở terminal khác, chuyển tới thư mục `Frontend`:

```bash
cd /path/to/Web-based-Mock-Examination-System/Frontend
python3 -m http.server 5500 --bind 127.0.0.1
```

Thay `/path/to` bằng đường dẫn repository trên máy.

Mở:

[http://127.0.0.1:5500/](http://127.0.0.1:5500/)

Đảm bảo frontend sử dụng chế độ API và địa chỉ backend local. Backend cần cho phép origin `http://127.0.0.1:5500` trong cấu hình CORS.

Dùng nhất quán `127.0.0.1` thay vì đổi qua lại với `localhost`, vì đây là các origin khác nhau đối với trình duyệt.

### 6.7. Tài khoản kiểm thử

| Tài khoản | Mật khẩu / cách sử dụng |
| --- | --- |
| `demo@matchday.local` | `MatchdayDemo!2026`, nếu đã nạp dữ liệu demo tương ứng |
| `user@example.com` | Dùng mật khẩu đã tạo trong database local |
| Tài khoản mới | Đăng ký qua giao diện |

Không dùng mật khẩu demo cũ `Matchday123!` của chế độ frontend mô phỏng cho tài khoản database.

Tài khoản được tạo thủ công trên một máy sẽ không tự xuất hiện khi người khác clone repository. Có thể đăng ký tài khoản mới nếu dữ liệu seed không chứa tài khoản cần dùng.

## 7. API chính

Các endpoint dùng tiền tố `/api/v1`.

| Method | Endpoint | Chức năng |
| --- | --- | --- |
| POST | `/register` | Đăng ký |
| POST | `/token` | Kiểm tra thông tin đăng nhập và cấp token |
| GET | `/me` | Lấy tài khoản hiện tại |
| GET | `/profile` | Lấy hồ sơ |
| PATCH | `/profile` | Cập nhật hồ sơ |
| GET | `/exams?scope=sample` | Danh sách đề mẫu |
| GET | `/exams?scope=mine` | Danh sách đề cá nhân |
| POST | `/exams` | Tạo đề |
| PUT | `/exams/{exam_id}` | Cập nhật thông qua phiên bản mới |
| DELETE | `/exams/{exam_id}` | Xóa mềm đề cá nhân |
| POST | `/attempts` | Bắt đầu hoặc khôi phục lượt thi |
| GET | `/attempts` | Lịch sử hoàn thành |
| GET | `/attempts/{attempt_id}` | Trạng thái và đáp án đã lưu |
| PATCH | `/attempts/{attempt_id}` | Đồng bộ đáp án |
| POST | `/attempts/{attempt_id}/submit` | Nộp bài |
| GET | `/attempts/{attempt_id}/report` | Báo cáo kết quả |
| POST | `/attempts/{attempt_id}/leave-events` | Ghi nhận sự kiện rời trang |

Xem Swagger để biết đầy đủ request, response và các endpoint bổ sung.

Lưu ý:

- `/token` nhận form đăng nhập; trường `username` mang giá trị email.
- Endpoint được bảo vệ yêu cầu `Authorization: Bearer <token>`.
- Backend kiểm tra quyền sở hữu tài nguyên.
- API câu hỏi cho lượt đang làm không trả đáp án đúng hoặc lời giải.
- API chỉnh sửa đề thuộc sở hữu và API báo cáo hoàn thành có mục đích khác, nên có thể trả các thông tin này.

## 8. Lưu trữ và tính nhất quán

### PostgreSQL

Lưu dữ liệu lâu dài:

- Tài khoản và hồ sơ.
- Đề, phiên bản và câu hỏi.
- Lượt thi và đáp án.
- Sự kiện rời trang.
- Trạng thái hoàn thành, điểm và thống kê.

### Trình duyệt

Giữ phiên đăng nhập và bản nháp tạm thời phục vụ giao diện, đồng bộ và khôi phục trong cùng tab.

Xóa dữ liệu trình duyệt có thể làm mất phiên hoặc thay đổi chưa đồng bộ, nhưng không tự xóa các kết quả đã lưu trong PostgreSQL.

### Kiểm soát dữ liệu

- Khóa ngoại và check constraints kiểm tra quan hệ và giá trị.
- Phiên bản đề đã xuất bản được bảo vệ khỏi thay đổi.
- Các lượt thi tham chiếu phiên bản cụ thể.
- Lưu đáp án sử dụng phiên bản đồng bộ để phát hiện cập nhật cũ.
- Database kiểm soát chấm điểm và trạng thái cuối cùng.
- Lượt đã hoàn tất được bảo vệ khỏi chỉnh sửa.

Khả năng tiếp tục trên trình duyệt hoặc thiết bị khác vẫn phụ thuộc phiên đăng nhập và luồng khôi phục; không nên coi đây là chế độ đồng bộ đa thiết bị đã được kiểm thử đầy đủ.

## 9. Kiểm thử

Luồng kiểm thử local chính:

1. Đăng ký hoặc đăng nhập.
2. Mở trang cá nhân và cập nhật hồ sơ.
3. Tạo hoặc nhập đề JSON.
4. Kiểm tra bản xem trước và lưu đề.
5. Chọn đúng đề cá nhân để bắt đầu.
6. Trả lời, đánh dấu và chờ đồng bộ.
7. Tải lại cùng tab để kiểm tra khôi phục và hạn giờ.
8. Nộp bài và kiểm tra thống kê.
9. Mở lại kết quả từ lịch sử bằng `attemptId`.
10. Kiểm tra tài khoản khác không truy cập được báo cáo.
11. Kiểm tra giao diện trên màn hình nhỏ.

### Lighthouse

Một lần đo trang chủ local bằng Chrome DevTools với cấu hình mobile ghi nhận:

| Hạng mục | Điểm / 100 |
| --- | --- |
| Performance | 100 |
| Accessibility | 100 |
| Best Practices | 96 |
| SEO | 90 |

Các điểm số áp dụng cho trang chủ trong lần đo đó, không đại diện cho mọi trang hoặc hiệu năng backend. Điểm Accessibility 100 không đồng nghĩa đã xác minh đầy đủ khả năng tiếp cận.

## 10. Hạn chế và lỗi đã biết

- Khôi phục mật khẩu cần SMTP hoạt động.
- Trình nhập hỗ trợ trắc nghiệm bốn lựa chọn. OCR có thể đọc sai công thức và không giữ hình, bảng hay đồ thị gốc.
- Chưa hỗ trợ chấm tự luận.
- Bảng so sánh trên màn hình nhỏ cần kiểm tra thêm khả năng truy cập các cột ngoài viewport.
- Chưa có bằng chứng kiểm thử tải lớn hoặc mất mạng kéo dài.
- Tiến độ làm bài chưa đồng bộ có thể mất khi đóng tab. Bản nháp đề có thể mất khi xóa dữ liệu trình duyệt.
- Việc ghi nhận rời trang không phải cơ chế giám sát thi chính thức.

## 11. Hướng phát triển

- Bổ sung regression test cho lưu đáp án và nộp bài.
- Mở rộng kiểm thử quyền sở hữu, hạn giờ và nộp lặp.
- Kiểm thử gửi và nhận OTP trên môi trường bàn giao.
- Cải thiện bảng so sánh và điều hướng bàn phím trên màn hình nhỏ.
- Kiểm tra accessibility và Lighthouse trên các trang chính khác.
- Cải thiện nhận dạng công thức và bố cục khi nhập PDF/Word.
- Bổ sung phân tích tiến bộ khi có dữ liệu và nhóm tham chiếu phù hợp.

Triển khai công khai không thuộc yêu cầu của phiên bản nộp bài hiện tại.

## 12. Thành viên

| Thành viên | Phần việc chính |
| --- | --- |
| **Đào Hương Giang** | Frontend, backend API và tích hợp frontend–API |
| **Đoàn Công Tân** | Thiết kế database, SQL functions/triggers và kết nối backend–database |
