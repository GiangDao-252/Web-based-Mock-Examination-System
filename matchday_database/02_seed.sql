-- MATCHDAY: chạy SAU 01_mock_exam_schema_v2.sql, chỉ trên DB phát triển.
-- Seed là atomic: có dữ liệu trước đó => từ chối, rollback toàn bộ. Không nhân bản khi chạy lại.
-- Tài khoản demo: demo@matchday.local / MatchdayDemo!2026
-- Hash PBKDF2-HMAC-SHA256 thật; backend cần hỗ trợ định dạng được giải thích trong README.
BEGIN;
SET LOCAL search_path = public, pg_catalog;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM users) OR EXISTS(SELECT 1 FROM exams) THEN
   RAISE EXCEPTION 'Seed yêu cầu users và exams rỗng; không ghi đè dữ liệu hiện có.';
 END IF;
END $$;
INSERT INTO users(email,password_hash,display_name) VALUES
('demo@matchday.local','pbkdf2_sha256$600000$matchday-demo-v2$QIWMSirx5KR/bIfQKDgo7ocwhH7ehqvOKfHriIZeiwM=','Cầu thủ Demo');
INSERT INTO user_profiles(user_id,goal) SELECT id,'Đạt 8 điểm Toán' FROM users WHERE email='demo@matchday.local';
CREATE TEMP TABLE _q (exam_key text, no int, body text, a text, b text, c text, d text, ans char(1), expl text);
INSERT INTO _q VALUES
 ('sample-math',1,'Giá trị của 2 + 3 × 4 là bao nhiêu?','20','14','24','9','b',NULL),
 ('sample-math',2,'Nghiệm của phương trình 2x + 6 = 14 là gì?','2','3','4','5','c',NULL),
 ('sample-math',3,'Diện tích hình chữ nhật dài 8 cm, rộng 5 cm là bao nhiêu?','13 cm²','26 cm²','40 cm²','80 cm²','c',NULL),
 ('sample-math',4,'25% của 200 bằng bao nhiêu?','25','50','75','100','b',NULL),
 ('sample-math',5,'Trung bình cộng của 4, 6 và 8 bằng bao nhiêu?','5','6','7','8','b',NULL),
 ('sample-computing',1,'Một byte thường gồm bao nhiêu bit?','2','4','8','16','c',NULL),
 ('sample-computing',2,'HTML được dùng chủ yếu để làm gì?','Mô tả cấu trúc trang web','Quản lý bộ nhớ RAM','Mã hóa ổ đĩa','Biên dịch Java','a',NULL),
 ('sample-computing',3,'Trong Python, len([1, 2, 3]) trả về giá trị nào?','1','2','3','4','c',NULL),
 ('sample-computing',4,'SQL SELECT được dùng để làm gì?','Xóa một bảng','Truy vấn dữ liệu','Định dạng văn bản','Tắt máy chủ','b',NULL),
 ('sample-computing',5,'CSS chủ yếu dùng để làm gì?','Lưu mật khẩu','Thiết lập kiểu hiển thị trang web','Chia địa chỉ IP','Quản lý tiến trình','b',NULL),
 ('sample-english',1,'Choose the correct sentence.','She go to school every day.','She goes to school every day.','She going to school every day.','She gone to school every day.','b',NULL),
 ('sample-english',2,'What is the plural of ''child''?','Childs','Childes','Children','Childrens','c',NULL),
 ('sample-english',3,'Complete: I have lived here ___ 2020.','for','since','at','on','b',NULL),
 ('sample-english',4,'Choose the opposite of ''expensive''.','Cheap','Large','Fast','Heavy','a',NULL),
 ('sample-english',5,'Complete: If it rains, we ___ stay at home.','will','would','did','have','a',NULL),
 ('van-hoc-co-ban',1,'Tác giả của tác phẩm "Truyện Kiều" là ai?','Nguyễn Trãi','Nguyễn Du','Hồ Xuân Hương','Nguyễn Khuyến','b',NULL),
 ('van-hoc-co-ban',2,'Bài thơ "Tây Tiến" là của nhà thơ nào?','Quang Dũng','Tố Hữu','Chế Lan Viên','Xuân Diệu','a',NULL),
 ('van-hoc-co-ban',3,'Truyện ngắn "Vợ nhặt" là của nhà văn nào?','Nam Cao','Kim Lân','Ngô Tất Tố','Nguyên Hồng','b',NULL),
 ('van-hoc-co-ban',4,'Thể thơ lục bát có đặc điểm nào sau đây?','Mỗi câu bảy chữ','Mỗi câu năm chữ','Câu sáu chữ xen kẽ câu tám chữ','Không hạn chế số chữ','c',NULL),
 ('van-hoc-co-ban',5,'Biện pháp tu từ so sánh là gì?','Đối chiếu sự vật này với sự vật khác có nét tương đồng','Phóng đại mức độ của sự vật','Gọi sự vật bằng tên của sự vật khác','Lặp lại một từ nhiều lần','a',NULL),
 ('toan-cong-thuc',1,'Tính tích phân \( \int_0^1 x^2\,dx \).','\( \frac{1}{2} \)','\( \frac{1}{3} \)','\( 1 \)','\( 2 \)','b',
    'Nguyên hàm là \( \frac{x^3}{3} \). Do đó \[ \int_0^1 x^2\,dx=\left[\frac{x^3}{3}\right]_0^1=\frac{1}{3}. \]'),
 ('toan-cong-thuc',2,'Cho \( A=\begin{pmatrix}1 & 2\\3 & 4\end{pmatrix} \). Tính \( \det(A) \).','2','10','−2','−10','c',
    'Với ma trận cấp hai, \( \det(A)=ad-bc=1\times4-2\times3=-2 \).');

CREATE TEMP TABLE _e (key text, subj text, title text, mins int, descr text);
INSERT INTO _e VALUES
 ('sample-math','Toán học','Toán học — Khởi động',15,'Ôn số học, phương trình và hình học cơ bản.'),
 ('sample-computing','Tin học','Tin học — Kiến thức nền tảng',10,'Làm quen với dữ liệu, lập trình và kiến thức web.'),
 ('sample-english','Tiếng Anh','Tiếng Anh — Everyday English',10,'Luyện từ vựng và ngữ pháp tiếng Anh cơ bản.'),
 ('van-hoc-co-ban','Ngữ văn','Ngữ văn — Kiến thức cơ bản',10,'Ôn tác giả, tác phẩm và biện pháp tu từ.'),
 ('toan-cong-thuc','Toán học','Toán học — Công thức và lời giải',15,NULL);

INSERT INTO exams (legacy_key, subject_id, description)
SELECT e.key, s.id, e.descr FROM _e e JOIN subjects s ON s.name = e.subj;

INSERT INTO exam_versions (exam_id, version_no, title, duration_minutes)
SELECT x.id, 1, e.title, e.mins FROM _e e JOIN exams x ON x.legacy_key = e.key;

INSERT INTO questions (exam_version_id, question_no, body, option_a, option_b, option_c, option_d, correct_answer, explanation)
SELECT v.id, q.no, q.body, q.a, q.b, q.c, q.d, q.ans, q.expl
FROM _q q JOIN exams x ON x.legacy_key = q.exam_key JOIN exam_versions v ON v.exam_id = x.id;


UPDATE exam_versions SET published_at=clock_timestamp();
-- Tất cả ID người dùng/câu hỏi được truy vấn bằng khóa ổn định, không giả định sequence.
DO $$
DECLARE uid BIGINT; eid UUID; v1 UUID; v2 UUID; a attempts%ROWTYPE; payload JSONB;
BEGIN
 SELECT id INTO uid FROM users WHERE email='demo@matchday.local';
 SELECT v.id INTO v1 FROM exams e JOIN exam_versions v ON v.exam_id=e.id WHERE e.legacy_key='sample-math';
 INSERT INTO attempts(user_id,exam_version_id,started_at,deadline_at,total_questions)
 VALUES(uid,v1,clock_timestamp()-interval '5 minutes',clock_timestamp(),1) RETURNING * INTO a;
 SELECT jsonb_agg(jsonb_build_object('questionId',id,'selectedAnswer',
     CASE WHEN question_no=3 THEN 'a' ELSE correct_answer::text END,'isFlagged',false))
 INTO payload FROM questions WHERE exam_version_id=v1;
 PERFORM record_leave_event(uid,a.id,gen_random_uuid(),'hidden',a.started_at+interval '1 minute',a.started_at+interval '80 seconds');
 PERFORM submit_attempt(uid,a.id,0,payload);

 -- Bài hết giờ; câu cuối bỏ trống nhưng có cờ. Thời điểm kết thúc khác lúc server nhận.
 SELECT v.id INTO v1 FROM exams e JOIN exam_versions v ON v.exam_id=e.id WHERE e.legacy_key='sample-english';
 INSERT INTO attempts(user_id,exam_version_id,started_at,deadline_at,total_questions)
 VALUES(uid,v1,clock_timestamp()-interval '1 day',clock_timestamp(),1) RETURNING * INTO a;
 SELECT jsonb_agg(jsonb_build_object('questionId',id,'selectedAnswer',
     CASE WHEN question_no=5 THEN NULL ELSE correct_answer::text END,'isFlagged',question_no=5))
 INTO payload FROM questions WHERE exam_version_id=v1;
 PERFORM submit_attempt(uid,a.id,0,payload);

 -- Đề cá nhân có hai phiên bản; lịch sử vẫn tham chiếu v1.
 INSERT INTO exams(owner_id,subject_id,legacy_key,description)
 SELECT uid,id,'demo-personal','Đề cá nhân để thử quản lý phiên bản' FROM subjects WHERE name='Toán học' RETURNING id INTO eid;
 v1 := create_exam_version(eid,uid,0,'Đề riêng của Giang — phiên bản 1',15,
   '[{"text":"2 + 2 = ?","options":{"a":"3","b":"4","c":"5","d":"6"},"correctAnswer":"b","explanation":"Cộng hai số 2."}]');
 INSERT INTO attempts(user_id,exam_version_id,started_at,deadline_at,total_questions)
 VALUES(uid,v1,clock_timestamp()-interval '2 minutes',clock_timestamp(),1) RETURNING * INTO a;
 SELECT jsonb_agg(jsonb_build_object('questionId',id,'selectedAnswer','b')) INTO payload FROM questions WHERE exam_version_id=v1;
 PERFORM submit_attempt(uid,a.id,0,payload);
 v2 := create_exam_version(eid,uid,1,'Đề riêng của Giang — phiên bản 2',20,
   '[{"text":"3 + 3 = ?","options":{"a":"3","b":"4","c":"5","d":"6"},"correctAnswer":"d","explanation":"3 + 3 = 6."}]');

 -- Đề đã xóa mềm vẫn xem được kết quả và câu hỏi cũ.
 INSERT INTO exams(owner_id,legacy_key) VALUES(uid,'demo-deleted') RETURNING id INTO eid;
 v1 := create_exam_version(eid,uid,0,'Đề đã xóa — lịch sử còn nguyên',10,
   '[{"text":"Một tuần có bao nhiêu ngày?","options":{"a":"5","b":"6","c":"7","d":"8"},"correctAnswer":"c"}]');
 INSERT INTO attempts(user_id,exam_version_id,started_at,deadline_at,total_questions)
 VALUES(uid,v1,clock_timestamp()-interval '1 minute',clock_timestamp(),1) RETURNING * INTO a;
 SELECT jsonb_agg(jsonb_build_object('questionId',id,'selectedAnswer','c')) INTO payload FROM questions WHERE exam_version_id=v1;
 PERFORM submit_attempt(uid,a.id,0,payload);
 UPDATE exams SET deleted_at=clock_timestamp() WHERE id=eid;

 -- Một lượt đang làm, có câu bỏ trống gắn cờ; dùng để thử resume.
 SELECT v.id INTO v1 FROM exams e JOIN exam_versions v ON v.exam_id=e.id WHERE e.legacy_key='toan-cong-thuc';
 a := start_attempt(uid,v1);
 SELECT jsonb_agg(jsonb_build_object('questionId',id,'selectedAnswer',NULL,'isFlagged',question_no=1))
 INTO payload FROM questions WHERE exam_version_id=v1;
 PERFORM save_attempt(uid,a.id,0,payload,1);
END $$;
DROP TABLE _q;
DROP TABLE _e;
COMMIT;

