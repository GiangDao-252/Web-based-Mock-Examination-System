# Web CTQ - Web-based Mock Examination System 

[![Status](https://img.shields.io/badge/Status-Proposal-blue.svg)]()
[![Platform](https://img.shields.io/badge/Platform-Web--based-lightgrey.svg)]()
[![Cloud](https://img.shields.io/badge/Infrastructure-Cloud%20(AWS)-orange.svg)]()

Hệ thống Thi thử Trực tuyến Nền tảng Web tích hợp AI Giám sát (Proctoring) và Phân tích Dữ liệu Học tập (Data Analytics). Dự án được thiết kế nhằm đón đầu Đề án số hóa thi tốt nghiệp THPT trên máy tính của Bộ GD-ĐT (giai đoạn 2026 - 2036).

**Khách hàng mục tiêu:** Các trường THPT, Trung tâm Luyện thi THPTQG và cá nhân thí sinh tham dự kỳ thi THPTQG.

##  Giải pháp & Giá trị cốt lõi

*   **Minh bạch hóa kết quả:** Giải quyết triệt để vấn nạn gian lận bằng công nghệ AI Proctoring đám mây, không yêu cầu cài đặt phần mềm bên thứ ba nặng nề lên máy thí sinh.
*   **Trải nghiệm chuẩn quốc gia:** Mô phỏng chính xác áp lực và quy chế giám sát của kỳ thi trên máy tính.
*   **Giá trị định hướng tuyển sinh:** Thay vì chỉ trả về điểm số, hệ thống cung cấp báo cáo cá nhân hóa dựa trên phân tích dữ liệu chuyên sâu để dự báo khả năng trúng tuyển Đại học.

---

##  Tính năng Nổi bật

###  Dành cho Học sinh (Môi trường thi khép kín)
*   **Browser Lockdown (Khóa trình duyệt):** Ép buộc toàn màn hình, khóa phím tắt sao chép/chụp màn hình, chặn mở tab mới và kết nối màn hình phụ.
*   **Offline-Tolerance (Chịu lỗi mạng):** Tự động lưu bài cục bộ (Local Storage). Nếu rớt mạng, thí sinh vẫn làm bài bình thường và hệ thống sẽ tự động đồng bộ (Auto-sync) khi có kết nối lại.
*   **Báo cáo Năng lực Cá nhân hóa:** Nhận ngay vị trí xếp hạng (Percentile/Tứ phân vị) so với toàn bộ phổ điểm và danh sách các trường Đại học/Ngành học phù hợp (An toàn - Vừa sức - Rủi ro) dựa trên điểm chuẩn lịch sử.

###  Dành cho Giáo viên (Trung tâm điều hành)
*   **Live Proctoring Dashboard:** Theo dõi toàn cảnh trạng thái phòng thi (kết nối, tiến độ bài làm) theo thời gian thực.
*   **AI-Powered Smart Flagging:** AI đóng vai trò "người gác cổng", tự động phân loại video giám sát thành các luồng Cờ Xanh (Bình thường) - Vàng (Nghi ngờ) - Đỏ (Vi phạm). 
*   **Cơ chế Human-in-the-loop:** Giám thị chỉ cần xem lại các clip vi phạm ngắn (3-5s) được AI đính kèm timestamp để đưa ra quyết định cuối cùng, tránh tình trạng máy móc chấm sai (False Positives).
*   **Item Analysis Report:** Tự động phân tích độ khó và độ phân biệt của từng câu hỏi trong đề thi.

---

##  Kiến trúc Hệ thống

Hệ thống triển khai 100% trên nền tảng Điện toán đám mây (Cloud Computing) với cơ chế **Auto-scaling**, tối ưu cho thiết bị cấu hình yếu của học sinh (Thin Client).

| Phân hệ | Chi tiết Kỹ thuật |
| :--- | :--- |
| **Real-time AI Proctoring** | Client chụp ảnh/sự kiện ➔ Message Queue (SQS/Kafka) ➔ AI Workers phân tích bất thường ➔ Lưu ảnh minh chứng (Amazon S3) & Ghi Log (Amazon RDS). |
| **Data Analytics Pipeline** | Thu thập điểm thô ➔ Xử lý ETL (Python/SQL) ➔ Tính toán Tứ phân vị/Percentile Rank & Tham chiếu điểm chuẩn ➔ Lưu vào Cache (Redis) để tải báo cáo tốc độ cao. |
| **Frontend & Security** | Giao diện khép kín chống gian lận. Mã hóa End-to-end, thiết lập vòng đời dữ liệu tự động xóa (Auto-purge) sau 30 ngày để đảm bảo Đạo đức Dữ liệu. |

---

##  Lộ trình Triển khai

- [x] **Giai đoạn 1 (2 tuần):** Khảo sát, Thiết kế UI/UX, Kiến trúc Cloud (VPC, IAM, Lược đồ DB).
- [ ] **Giai đoạn 2 (4 tuần):** Phát triển MVP Cốt lõi (Frontend Browser Lockdown, cơ chế Offline-Tolerance, API luân chuyển bài thi).
- [ ] **Giai đoạn 3 (4 tuần):** Tích hợp AI Proctoring (Computer Vision nhận diện khuôn mặt/thiết bị) và Module Data Analytics (Tính toán phổ điểm, đối chiếu điểm chuẩn).
- [ ] **Giai đoạn 4 (1 tuần):** Stress-testing với 5.000 - 10.000 concurrent users, chạy Pilot tại các trường THPT đối tác và tinh chỉnh (Fine-tuning) mô hình.

---

## Thành viên
*   **Cao Quý Đức**
*   **Đào Hương Giang** 
*   **Đoàn Công Tân**
