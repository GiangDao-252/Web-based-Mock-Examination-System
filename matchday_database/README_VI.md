# Matchday — bộ database MVP đã chỉnh sửa

Bộ này dựa trên `mock_exam_schema.sql` và `seed.sql` bạn đã gửi. Giữ mô hình dữ liệu cốt lõi, sửa ràng buộc và bổ sung các hàm transaction để frontend/backend sử dụng. Phạm vi là học sinh tự luyện, có tài khoản, đề mẫu, đề cá nhân, phiên bản đề, lưu nháp, nộp bài, lịch sử và nhật ký rời trang.

Đây là **schema thay thế dành cho database mới**, không phải script ALTER/migration cho database cũ. Không chứa DROP DATABASE, DROP SCHEMA hoặc TRUNCATE. Bạn chưa cần xóa database đã tạo.

## 1. Các file và thứ tự chạy

| Thứ tự | File | Mục đích |
|---|---|---|
| 1 | `01_mock_exam_schema_v2.sql` | 10 bảng, index, ràng buộc, trigger, hàm nghiệp vụ, view và danh mục môn |
| 2 | `02_seed_v2.sql` | Dữ liệu demo cho môi trường phát triển |
| 3 | `03_verify_v2.sql` | Kiểm tra hành vi đúng/sai; rollback dữ liệu thử |

Schema chạy một lần trên database rỗng. Chạy lại sẽ báo bảng đã tồn tại và transaction bị hủy, không tự xóa dữ liệu. Seed từ chối nếu `users` hoặc `exams` đã có dữ liệu; đây là cơ chế từ chối chạy lặp an toàn, không phải upsert.

### Cách chạy bằng pgAdmin

1. Tạo database mới tên `matchday_v2`, encoding UTF8.
2. Chọn đúng database đó, mở Query Tool.
3. Mở file 01 và Execute **toàn bộ file**, không chỉ đoạn bôi chọn.
4. Kiểm tra không có ERROR, sau đó làm tương tự với file 02.
5. Chạy file 03; phải kết thúc thành công với thông báo PASS. File 03 kết thúc bằng ROLLBACK là chủ ý.
6. Nếu có lỗi làm transaction bị hủy, chạy `ROLLBACK;` trước khi thử lại.

### Cách chạy bằng terminal nếu dùng psql

```bash
createdb -U postgres matchday_v2
psql -X -U postgres -d matchday_v2 -v ON_ERROR_STOP=1 -f 01_mock_exam_schema_v2.sql
psql -X -U postgres -d matchday_v2 -v ON_ERROR_STOP=1 -f 02_seed_v2.sql
psql -X -U postgres -d matchday_v2 -v ON_ERROR_STOP=1 -f 03_verify_v2.sql
```

Chạy từ thư mục chứa bộ SQL. Đổi user/host/port theo PostgreSQL của bạn. Mục tiêu tương thích PostgreSQL 14+; không yêu cầu extension.

## 2. Những gì được giữ, sửa, bỏ và thêm

| Thành phần gốc | Xử lý trong bản mới |
|---|---|
| `users`, `user_profiles`, `user_otps` | Giữ; chỉ role student, hash không rỗng, OTP có hạn dùng và số lần sai |
| Email unique theo `lower(email)` | Giữ |
| `subjects` | Giữ 9 môn, khởi tạo cùng schema |
| `exams`, UUID, `legacy_key`, `owner_id`, xóa mềm | Giữ; FK owner chuyển sang RESTRICT để xóa user không biến đề cá nhân thành đề hệ thống |
| `exam_versions`, version_no, tiêu đề, 1–180 phút | Giữ; thêm công bố và fingerprint được DB tính |
| `questions`, 4 lựa chọn, một đáp án, LaTeX và lời giải | Giữ; chặn nội dung chỉ có khoảng trắng, tab hoặc xuống dòng |
| Trigger khóa đề đã dùng | Thay bằng khóa tất cả phiên bản đã công bố, kể cả chưa có bài làm |
| `attempts` | Giữ; bỏ phiên thi, đình chỉ và điểm phạt; thêm ended_at, client_ended_at |
| `attempt_answers` | Giữ; thêm exam_version_id và hai FK tổng hợp; khóa khi đã nộp |
| `attempt_leave_events` | Giữ; UUID chống đếm trùng khi đồng bộ, kiểm tra thời gian và khóa sự kiện đã đóng |
| Tổ chức, phòng thi, đợt thi, giám thị | Bỏ khỏi bộ MVP |
| AI, bằng chứng ảnh/video, khiếu nại, trừ điểm/đình chỉ | Bỏ khỏi bộ MVP |
| Tổ hợp môn, trường/ngành, điểm chuẩn, percentile, materialized view | Hoãn mở rộng; không tạo trong bộ này |
| Transaction tạo phiên bản, lưu nháp, nộp bài | Thêm các hàm nghiệp vụ |
| View lịch sử và xem lại bài | Thêm `v_attempt_history`, `v_attempt_review` |

`final_score` không còn tồn tại vì không có trừ điểm. Dùng `score` làm điểm chính thức, thang 10. Không có trigger trừ điểm từ việc rời trang.

## 3. Quan hệ và quy tắc dữ liệu

- Một user có một profile, nhiều đề cá nhân và nhiều lượt làm.
- `owner_id IS NULL` là đề hệ thống; đề cá nhân chỉ chủ sở hữu được bắt đầu làm qua luồng hiện tại.
- Một đề có nhiều phiên bản. Phiên bản có 1–100 câu được đánh số liên tục từ 1.
- Nháp có `published_at IS NULL`. Chỉ khi công bố mới có fingerprint và được làm bài.
- Khi đã công bố, không sửa/xóa phiên bản, không thêm/sửa/xóa/chuyển câu hỏi. Muốn sửa đề, tạo phiên bản mới.
- Bài làm tham chiếu chính xác một phiên bản. Đáp án tham chiếu đồng thời lượt làm và phiên bản của câu hỏi bằng FK tổng hợp.
- Mỗi user có tối đa một lượt đang làm trên cùng phiên bản; có thể làm lại sau khi lượt trước đã kết thúc.
- Xóa đề bằng `UPDATE exams SET deleted_at = ...`. Lịch sử và câu hỏi của bài cũ vẫn còn.
- Không xóa cứng lượt làm. Xóa tài khoản cần thiết kế riêng về ẩn danh/lưu giữ; trong MVP có thể vô hiệu hóa bằng `is_active=false`.

Đáp án đúng và bộ đếm luôn được DB đối chiếu lại khi chuyển trạng thái. `score`, `is_correct`, các tổng số frontend gửi không được dùng làm căn cứ chấm. Một bài bỏ trống toàn bộ nhận điểm 0; câu bỏ trống không tính vào wrong_count.

## 4. Luồng backend phải gọi

Các hàm là `SECURITY INVOKER`, không tự nâng quyền. `p_user_id` phải lấy từ phiên đăng nhập đã xác thực, không lấy trực tiếp từ request body. Chỉ backend tin cậy có kết nối DB; browser gọi HTTP API.

### Tạo hoặc sửa đề cá nhân

Tạo `exams` với owner_id là user đã xác thực. Sau đó gọi hàm sau trong cùng transaction. Với đề mới, expected_version = 0; khi sửa, gửi version_no mới nhất mà màn hình đang giữ.

```sql
SELECT create_exam_version(
    :exam_id, :authenticated_user_id, :expected_version,
    :title, :duration_minutes, :questions_jsonb
);
```

Ví dụ phần tử trong questions:

```json
{
  "text": "2 + 2 = ?",
  "options": {"a":"3", "b":"4", "c":"5", "d":"6"},
  "correctAnswer": "b",
  "explanation": "2 + 2 = 4."
}
```

Hàm khóa bản ghi đề, so sánh expected_version, tạo nháp, thêm câu hỏi, công bố và tính fingerprint. Nếu version khác, SQLSTATE `40001` và thông báo VERSION_CONFLICT. Backend trả HTTP 409 để người dùng tải lại. Không tự ghi đè bản mới hơn.

Đề hệ thống được seed bằng quyền quản trị dữ liệu, không qua endpoint dành cho học sinh.

### Bắt đầu hoặc khôi phục lượt làm

```sql
SELECT * FROM start_attempt(:authenticated_user_id, :exam_version_id, :client_attempt_uuid);
```

UUID ổn định giúp retry không tạo lượt khác. Nếu đã có bài đang làm cùng phiên bản, hàm trả bài đó, kể cả UUID request khác. Frontend phải dùng **id thực tế được trả về**. Nếu deadline đã qua, gọi submit để chốt timeout. Database không tự chạy đồng hồ nền; backend cần gọi submit khi nhận request hết giờ hoặc triển khai job chốt những bài quá hạn.

Không cho bắt đầu một lượt hoàn toàn offline chưa được server tạo trước đó. Offline trong bộ này nghĩa là mất kết nối sau khi đã bắt đầu trên server.

### Lưu nháp

```sql
SELECT * FROM save_attempt(:authenticated_user_id, :attempt_id, :expected_sync,
    :answers_jsonb, :current_question);
```

Ví dụ answers:

```json
[
  {"questionId":"UUID-do-API-tra-ve", "selectedAnswer":"b", "isFlagged":false},
  {"questionId":"UUID-khac", "selectedAnswer":null, "isFlagged":true}
]
```

Đây là PATCH theo câu hỏi: chỉ các câu được gửi mới thay đổi. Mỗi phần tử phải chứa đầy đủ lựa chọn/cờ hiện tại của câu đó. selectedAnswer=null xóa lựa chọn; isFlagged mặc định false nếu bỏ qua. Một questionId chỉ xuất hiện một lần mỗi batch. Các lựa chọn dùng chữ thường a/b/c/d.

`current_question` dùng số thứ tự **bắt đầu từ 1**. Nếu frontend dùng index bắt đầu từ 0, API cần chuyển đổi. expected_sync là sync_version lần gần nhất server trả về; mỗi save/submit thành công tăng 1. SQLSTATE 40001/SYNC_CONFLICT => trả 409, tải trạng thái mới rồi xử lý xung đột, không ghi đè mù quáng. Nếu mất response sau khi save, GET lại trạng thái để lấy sync_version.

### Nhật ký rời trang

```sql
SELECT record_leave_event(:authenticated_user_id, :attempt_id, :event_uuid,
    'hidden', :hidden_at, :visible_at, :ended_at);
```

Giữ cùng event_uuid khi retry hoặc đóng sự kiện lúc quay lại. visible_at dùng khi quay lại; ended_at dùng nếu bài kết thúc trong lúc ẩn trang. Không gửi cả hai. Sự kiện đã đóng không sửa hoặc mở lại. Chỉ ghi nhận một loại chính (ví dụ hidden) cho một lần rời trang để tránh hidden và blur đếm cùng một hành động hai lần.

### Nộp bài

```sql
SELECT * FROM submit_attempt(:authenticated_user_id, :attempt_id, :expected_sync,
    :final_answers_jsonb, :client_ended_at);
```

Hàm khóa lượt làm, áp dụng batch đáp án, tính lại bộ đếm, chấm điểm, đóng sự kiện mở và chốt trạng thái trong một transaction. Lỗi ở bất cứ bước nào làm rollback toàn bộ lời gọi. Nộp lại bài đã chốt trả nguyên kết quả cũ, bỏ qua payload mới, kể cả expected_sync cũ. Không thêm/sửa/xóa đáp án và kết quả sau khi nộp.

- Server nhận trước deadline: submitted, reason manual.
- Server nhận sau hoặc đúng deadline: timed_out, reason timeout, ended_at bằng deadline.
- submitted_at là thời điểm server chốt; client_ended_at chỉ là dữ liệu tham khảo.

**Chính sách offline cho tự luyện:** cho phép gửi snapshot đáp án cuối khi kết nối lại sau deadline; server vẫn đánh dấu timeout. Không thể chứng minh người dùng đã chọn đáp án trước deadline chỉ bằng đồng hồ client. Nếu cần kỳ thi nghiêm ngặt, phải đổi chính sách này trước khi triển khai.

Khi đồng bộ cả sự kiện và bài nộp: backend mở transaction, kiểm tra bài đã kết thúc chưa, ghi các event còn thiếu, gọi submit rồi commit. Nếu đã chốt, trả kết quả cũ ngay. Event được gửi sau khi bài đã chốt chỉ được chấp nhận nếu là retry y hệt một event đã lưu; event mới sẽ bị từ chối.

## 5. Ánh xạ dữ liệu frontend

| Frontend | SQL/API |
|---|---|
| Mã sample-math, sample-english… | exams.legacy_key để tra exams.id |
| examVersion | exam_versions.version_no |
| examVersionId | exam_versions.id; nên gửi thêm để so sánh cùng phiên bản |
| durationMinutes | duration_minutes |
| question.id | questions.id, UUID do server cấp |
| question.text | questions.body |
| options.a/b/c/d | option_a/b/c/d |
| correctAnswer | correct_answer, chỉ quản lý đề riêng hoặc xem kết quả |
| selectedAnswer, isFlagged | selected_answer, is_flagged |
| total, answered, correct, wrong | total_questions, answered_count, correct_count, wrong_count |
| unanswered | total_questions - answered_count |
| pageLeaveCount | page_leave_count |
| endedAt, submittedAt | ended_at, submitted_at |
| reason manual/timeout | status submitted/timed_out |
| score, điểm cuối cùng | score; không còn final_score |

Tên giống nhau không có nghĩa frontend hiện tại tự kết nối được. Backend vẫn phải tạo DTO đúng cấu trúc, đổi localStorage/sessionStorage sang API và xử lý UUID/đồng bộ. Fingerprint MD5 ở đây có định dạng riêng, **không cam kết bằng fingerprint JavaScript hiện có**. Khi so sánh lượt làm, nên nhóm theo exam_version_id; nếu giữ thuật toán fingerprint frontend thì API phải chuyển đổi hoặc sửa frontend.

API làm bài chỉ SELECT các cột câu hỏi cần hiển thị. Không trả correct_answer, explanation, is_correct hoặc correct_count/wrong_count khi bài còn đang làm. Không serialize nguyên bản ghi của save/start ra browser. Endpoint xem lại chỉ trả dữ liệu của user đã xác thực; view không tự lọc theo user.

## 6. Seed và mật khẩu demo

Seed giữ nguyên nội dung 5 đề từ file gốc: Toán, Tin, Anh, Văn và Toán công thức/LaTeX. Thêm đề cá nhân hai phiên bản và đề đã xóa mềm. Có tổng cộng 5 lượt làm: 3 submitted, 1 timed_out, 1 in_progress. Nhật ký đều nằm trong thời gian làm bài. Không có placeholder DEMO-HASH và không có ID sequence viết cứng.

- Email: demo@matchday.local
- Mật khẩu: MatchdayDemo!2026
- Định dạng hash: `pbkdf2_sha256$600000$<salt>$<base64-digest>`.

Hash được tạo bằng PBKDF2-HMAC-SHA256 của Python. Để backend đăng nhập được, bộ kiểm tra mật khẩu phải hỗ trợ định dạng này. Nếu backend đang dùng bcrypt/Argon2 thì tạo lại hash tương ứng trong seed trước khi chạy; không thể suy ra thuật toán backend từ hai file SQL gốc.

Ví dụ kiểm tra định dạng của seed bằng Python:

```python
import base64, hashlib, hmac

def verify_demo_hash(password: str, encoded: str) -> bool:
    algorithm, rounds, salt, digest = encoded.split("$")
    if algorithm != "pbkdf2_sha256":
        return False
    actual = base64.b64encode(hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), int(rounds)
    )).decode()
    return hmac.compare_digest(actual, digest)
```

Salt cố định chỉ dành cho seed tái lập; tài khoản đăng ký thật phải có salt ngẫu nhiên riêng. Backend cũng phải xử lý gửi OTP, xác minh hash OTP, tăng failed_attempts, tiêu thụ OTP trong transaction và giới hạn tần suất. Schema cung cấp nơi lưu/ràng buộc; không tự gửi email hoặc xác thực token.

## 7. Quyền truy cập và transaction

Các bảng/view không phải cơ chế xác thực theo hàng. Đây là database sau backend tin cậy. Không cấp quyền DB trực tiếp cho từng học sinh và không đặt thông tin kết nối trong frontend.

Schema thu hồi EXECUTE mặc định từ PUBLIC cho các hàm được tạo. Chủ sở hữu vẫn chạy được. Nếu backend dùng role khác, DBA cấp USAGE trên public, quyền cần thiết trên 10 bảng, sequence và các view, cùng EXECUTE cho các hàm nghiệp vụ và apply_answer_batch. Các hàm SECURITY INVOKER cần quyền trên bảng bên dưới, vì vậy backend role là role tin cậy, không phải người dùng cuối. Trigger vẫn hoạt động dù PUBLIC không có quyền tự gọi hàm trigger.

Tất cả thao tác API phải dùng truy vấn có tham số; p_user_id lấy từ server session. Dùng READ COMMITTED và retry phù hợp cho serialization/deadlock; lỗi expected_version/sync_version cần xử lý xung đột dữ liệu. Các đường ghi đáp án/nhật ký đều khóa lượt làm; nộp bài khóa cùng bản ghi để tránh chạy đồng thời. Công bố và thay đổi câu hỏi khóa cùng bản ghi phiên bản.

DB owner/superuser vẫn có thể vô hiệu hóa trigger hoặc TRUNCATE; không dùng quyền đó làm cơ chế phân quyền học sinh. Bản này không cấu hình sẵn DB role vì tên role và cơ chế đăng nhập backend của nhóm chưa được cung cấp.

## 8. Kiểm chứng và giới hạn

Schema, seed và file verify đã được chạy thành công bằng **PGlite (PostgreSQL nhúng)** trong môi trường kiểm tra. Seed chạy lặp được xác nhận bị từ chối và không thay đổi dữ liệu. Bộ kiểm tra xác nhận khóa phiên bản, sai phiên bản câu hỏi, bất biến sau nộp, tính điểm, đồng bộ version, sự kiện trùng, timeout và lịch sử xóa mềm.

Chưa chạy trên PostgreSQL đang cài ở máy bạn, chưa tích hợp backend/frontend thật và chưa stress test nhiều kết nối đồng thời. Bạn chạy file 03 trên PostgreSQL đích trước khi đổi cấu hình backend. Phiên bản đang làm trong seed có deadline thật, vì vậy nếu để lâu cần chốt timeout rồi tạo lượt mới để thử resume.

## 9. Khi muốn chuyển dữ liệu cũ

Giữ nguyên database cũ. Xác nhận bộ mới chạy ổn rồi mới lập migration riêng: ánh xạ user/exam/version, công bố các phiên bản cũ hợp lệ, nhập bài làm theo thứ tự, chấm lại và đối chiếu kết quả. Không chạy schema mới chồng lên bảng cũ và không copy các bảng AI/giám thị/điểm phạt vào MVP. Bộ này chưa bao gồm migration dữ liệu cũ.
