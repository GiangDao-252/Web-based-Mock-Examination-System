# Web CTQ — Web-based Mock Examination System

![Status](https://img.shields.io/badge/Status-Frontend%20MVP-DB0007)
![Platform](https://img.shields.io/badge/Platform-Web--based-lightgrey)
![Scope](https://img.shields.io/badge/Scope-Student%20Self--practice-1C2C5B)

**MATCHDAY** là hệ thống thi thử trực tuyến dành cho học sinh, hỗ trợ quản lý đề cá nhân, luyện tập có giới hạn thời gian, xem lại bài làm và theo dõi kết quả qua từng lượt luyện tập.

Dự án hiện tập trung vào **MVP dành cho một nhóm người dùng là học sinh**. Giao diện sử dụng phong cách bóng đá với màu đỏ–trắng và nhận diện MATCHDAY.

> Hiện tại, hệ thống hoạt động dưới dạng frontend HTML/CSS/JavaScript. Đăng nhập là mô phỏng; đề thi, hồ sơ và lịch sử được lưu trong trình duyệt. Backend và cơ sở dữ liệu sẽ được tích hợp ở giai đoạn tiếp theo.

## 1. Mục tiêu

- Cung cấp môi trường tự luyện thi dễ sử dụng trên máy tính và điện thoại.
- Cho phép học sinh tạo, tải lên và chỉnh sửa đề cá nhân.
- Hỗ trợ câu hỏi trắc nghiệm có công thức toán học.
- Lưu kết quả và nội dung bài làm để xem lại.
- So sánh các lượt luyện tập dùng cùng đề và phiên bản.
- Ghi nhận việc trang thi bị ẩn để học sinh tự đánh giá sự tập trung.

MVP không có giao diện giáo viên, giám thị hoặc chức năng AI giám sát.

## 2. Tính năng hiện có

### 2.1. Tài khoản và trang cá nhân

- Đăng nhập và đăng xuất bằng tài khoản demo.
- Chuyển về trang đăng nhập khi truy cập trang học sinh chưa có phiên.
- Lưu tên hiển thị và mục tiêu học tập trong trình duyệt.
- Hiển thị số lượt thi, điểm trung bình và điểm cao nhất.
- Hiển thị ba lượt luyện tập gần nhất.
- Lưu toàn bộ lịch sử, không tự cắt bỏ các lượt cũ theo số lượng cố định.

Đăng ký tài khoản thật, quản lý mật khẩu và khôi phục qua email/OTP chưa được kết nối backend.

### 2.2. Đề mẫu và đề cá nhân

- Chọn đề mẫu để luyện tập.
- Nhập file JSON hoặc tạo đề trực tiếp trên giao diện.
- Đặt tên và thời lượng làm bài.
- Thêm, sửa và xóa câu hỏi.
- Chỉnh sửa bốn lựa chọn A–D và đáp án đúng.
- Bổ sung lời giải tùy chọn.
- Xem trước nội dung trước khi lưu.
- Sửa hoặc xóa đề cá nhân đã lưu.
- Tăng phiên bản khi nội dung đề thay đổi.
- Phát hiện trường hợp đề đã bị chỉnh sửa ở tab khác trước khi ghi đè.

Giới hạn hiện tại:

| Nội dung | Giới hạn |
| --- | --- |
| Định dạng nhập file | JSON |
| Kích thước file | Tối đa 1 MB |
| Số câu hỏi | 1–100 câu |
| Lựa chọn mỗi câu | Bốn lựa chọn A–D |
| Đáp án đúng | Một đáp án mỗi câu |
| Thời lượng | 1–180 phút |

PDF, Word và nhận dạng nội dung từ ảnh chưa được hỗ trợ.

### 2.3. Công thức toán học

Hệ thống sử dụng **MathJax** để hiển thị công thức LaTeX trong:

- Nội dung câu hỏi.
- Các lựa chọn.
- Lời giải.
- Bản xem trước và báo cáo sau bài thi.

Ví dụ nhập trên giao diện:

```latex
Tính tích phân \( \int_0^1 x^2\,dx \).
```

Trong JSON, dấu `\` phải được viết thành `\\`:

```json
{
  "text": "Tính tích phân \\( \\int_0^1 x^2\\,dx \\)."
}
```

MathJax được đóng gói cùng frontend. Chức năng này dùng để hiển thị công thức, chưa hỗ trợ nhận dạng công thức từ ảnh hoặc chấm tự luận toán.

### 2.4. Làm bài thi

- Hiển thị thông tin đề, quy tắc chấm và cách ghi nhận rời trang trước khi bắt đầu.
- Chỉ chạy đồng hồ sau khi học sinh bấm **Bắt đầu**.
- Chọn đáp án và chuyển câu bằng bảng số hoặc nút trước/tiếp.
- Đổi màu số câu đã trả lời.
- Gắn hoặc bỏ cờ cho câu cần xem lại.
- Hiển thị số câu đã trả lời.
- Cảnh báo khi thời gian còn ít.
- Xác nhận trước khi nộp bài.
- Tự kết thúc khi hết thời gian.
- Khóa thay đổi đáp án sau khi kết thúc.
- Khôi phục tiến độ và hạn giờ ban đầu khi tải lại trang trong cùng tab.

Rời trang hoặc tải lại không làm dừng đồng hồ của lượt thi đã bắt đầu.

### 2.5. Tự đánh giá sự tập trung

- Hiển thị số lần trang thi bị ẩn.
- Thông báo số lần ghi nhận khi học sinh quay lại.
- Lưu thời điểm trang bị ẩn và quay lại.
- Hiển thị nhật ký trong báo cáo sau bài thi.
- Ghi nhận trường hợp bài kết thúc khi trang vẫn còn ẩn.

Chỉ số này phản ánh trạng thái hiển thị của trang, không xác định nguyên nhân rời trang và không được dùng để kết luận gian lận.

Hệ thống không chặn đổi tab, không tự đình chỉ và không trừ điểm theo chỉ số này.

### 2.6. Kết quả và lịch sử

- Hiển thị điểm, số câu đúng, sai và chưa trả lời.
- Hiển thị đáp án đã chọn và đáp án đúng.
- Hiển thị lời giải nếu được cung cấp.
- Lọc câu đúng, sai hoặc chưa trả lời khi xem lại.
- Hiển thị trạng thái nộp chủ động hoặc hết giờ.
- Lưu bản nội dung câu hỏi, lựa chọn và lời giải kèm kết quả.
- Giữ bài làm cũ khi đề gốc được sửa hoặc xóa.
- So sánh các lượt có cùng mã đề, phiên bản, nội dung và thời lượng.

Các kết quả cũ thiếu thông tin phiên bản vẫn có thể xem lại khi dữ liệu hợp lệ, nhưng không được tự động ghép nhóm chỉ dựa trên tên đề.

## 3. Quy tắc chấm điểm

MVP sử dụng quy tắc chấm thống nhất:

```text
Điểm = Số câu đúng / Tổng số câu × 10
```

- Mỗi câu có trọng số bằng nhau.
- Câu sai hoặc bỏ trống không được tính điểm.
- Điểm được làm tròn đến hai chữ số thập phân.
- Số câu sai không bao gồm câu chưa trả lời.

## 4. Công nghệ

| Thành phần | Công nghệ hiện tại |
| --- | --- |
| Giao diện | HTML5, CSS3 |
| Xử lý trên trình duyệt | JavaScript |
| Hiển thị công thức | MathJax 3.2.2 |
| Lưu đề, hồ sơ và lịch sử | localStorage |
| Lưu phiên demo, tiến độ và kết quả hiện tại | sessionStorage |
| Chạy frontend khi phát triển | HTTP server cục bộ, ví dụ VS Code Live Server |
| Quản lý mã nguồn | Git, GitHub |

Công nghệ backend, cơ sở dữ liệu và phương án triển khai sẽ được nhóm thống nhất ở giai đoạn tiếp theo.

## 5. Cấu trúc thư mục

```text
Web-based-Mock-Examination-System/
├── Frontend/
│   ├── index.html
│   ├── auth/
│   │   ├── login.html
│   │   ├── register.html
│   │   └── forgot-password.html
│   ├── student/
│   │   ├── profile.html
│   │   ├── exams.html
│   │   ├── my-exams.html
│   │   ├── upload-exam.html
│   │   ├── exam.html
│   │   └── report.html
│   ├── assets/
│   │   ├── css/
│   │   ├── js/
│   │   └── vendor/
│   │       └── mathjax/
│   └── data/
│       └── de-toan.json
├── Proposal.html
├── lab.css
└── README.md
```

Một số file JavaScript chính:

| File | Vai trò |
| --- | --- |
| `auth-session.js`, `auth-guard.js` | Phiên demo và điều hướng đăng nhập |
| `exam-store.js` | Kiểm tra, lưu, sửa, xóa và quản lý phiên bản đề |
| `upload-exam.js` | Nhập file, chỉnh sửa và xem trước đề |
| `exam-loader.js` | Nạp đề được chọn |
| `exam-engine.js` | Điều hướng câu, đồng hồ, tiến độ và kết thúc bài |
| `security.js` | Ghi nhận trạng thái trang bị ẩn/quay lại |
| `report.js`, `focus-report.js` | Báo cáo, lời giải và nhật ký tập trung |
| `history.js`, `comparison.js` | Lịch sử và so sánh các lượt |
| `profile-settings.js` | Thông tin cá nhân demo |
| `math-render.js` | Hiển thị công thức |
| `matchday.js` | Nhận diện MATCHDAY và thống kê trang cá nhân |

## 6. Chạy dự án

### Bước 1: Tải mã nguồn

```bash
git clone https://github.com/GiangDao-252/Web-based-Mock-Examination-System.git
cd Web-based-Mock-Examination-System
```

### Bước 2: Mở bằng VS Code

Mở thư mục dự án, cài extension **Live Server**, sau đó mở:

```text
Frontend/index.html
```

Chọn **Open with Live Server**.

### Bước 3: Đăng nhập demo

```text
Email: demo@matchday.local
Mật khẩu: Matchday123!
```

### Bước 4: Thử luồng chính

```text
Đăng nhập
→ Chọn đề mẫu hoặc tạo đề cá nhân
→ Bắt đầu làm bài
→ Nộp bài hoặc hết giờ
→ Xem kết quả và lời giải
→ Xem lịch sử, so sánh các lượt
```

Có thể tải file `Frontend/data/de-toan.json` để thử đề có công thức và lời giải.

## 7. Lưu trữ và giới hạn hiện tại

- Dữ liệu hiện được lưu trong trình duyệt trên thiết bị đang dùng.
- Giữ nguyên địa chỉ và cổng chạy để truy cập dữ liệu cũ.
- Xóa dữ liệu website có thể làm mất đề và lịch sử.
- Chưa đồng bộ dữ liệu giữa thiết bị hoặc trình duyệt.
- Dung lượng lưu trữ phụ thuộc trình duyệt; giao diện thông báo khi lưu thất bại.
- Đăng nhập demo và kiểm tra trên FE không thay thế xác thực, phân quyền trên máy chủ.
- Chấm điểm hiện thực hiện tại trình duyệt; chưa phù hợp để sử dụng như hệ thống thi chính thức.

## 8. Lộ trình

### Frontend MVP

- [x] Giao diện dành cho học sinh.
- [x] Đăng nhập và đăng xuất demo.
- [x] Đề mẫu và quản lý đề cá nhân.
- [x] Tạo, chỉnh sửa, xóa đề và quản lý phiên bản.
- [x] Hiển thị công thức và lời giải.
- [x] Làm bài có giới hạn thời gian và khôi phục tiến độ.
- [x] Kết quả, lịch sử và so sánh lượt thi.
- [x] Nhật ký rời trang để tự đánh giá sự tập trung.
- [x] Kiểm tra các luồng chính và giao diện bằng Chromium ở độ rộng 320, 390 và 1440 px.

### Backend và tích hợp

- [ ] Đăng ký, đăng nhập, đăng xuất thật.
- [ ] Khôi phục mật khẩu qua email và OTP.
- [ ] Lưu hồ sơ, đề và kết quả theo từng tài khoản.
- [ ] Kiểm tra quyền sở hữu và quyền truy cập trên máy chủ.
- [ ] API quản lý đề và phiên bản đề.
- [ ] Quản lý lượt thi, hạn giờ và chấm điểm trên máy chủ.
- [ ] Chỉ cung cấp đáp án/lời giải sau khi lượt thi kết thúc.
- [ ] Kết nối frontend với backend.
- [ ] Kiểm thử tích hợp và triển khai.

### Hướng mở rộng sau MVP

- Hỗ trợ thêm định dạng tài liệu.
- Biểu đồ tiến bộ và phân tích theo chủ đề.
- Thống kê các câu thường làm sai.
- Phân tích phổ điểm, tứ phân vị và percentile khi có nhóm tham chiếu phù hợp.

Báo cáo phân tích phải nêu rõ nhóm dữ liệu so sánh. Không suy rộng thành thứ hạng toàn quốc.

Đối chiếu điểm chuẩn đại học, nếu được bổ sung, phải có nguồn và năm công bố rõ ràng; chỉ mang tính tham khảo.

## 9. Thành viên

- **Đào Hương Giang**
- **Đoàn Công Tân**
