-- Chạy sau schema và seed. Mọi dữ liệu thử được ROLLBACK.
BEGIN;
SET LOCAL search_path=public,pg_catalog;
CREATE FUNCTION pg_temp.assert_true(ok BOOLEAN, label TEXT) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.expect_rejected(command TEXT, label TEXT, expected_state TEXT DEFAULT 'P0001')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected BOOLEAN := false;
BEGIN
    BEGIN EXECUTE command;
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE <> expected_state THEN RAISE EXCEPTION 'FAIL %: expected %, got % (%)',label,expected_state,SQLSTATE,SQLERRM; END IF;
        rejected := true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'FAIL: được phép thao tác sai: %',label; END IF;
END $$;

DO $$
DECLARE uid BIGINT; eid UUID; vid UUID; other_vid UUID; draft UUID; qid UUID;
 a attempts%ROWTYPE; b attempts%ROWTYPE; payload JSONB; ev UUID; counts INTEGER;
BEGIN
 SELECT id INTO uid FROM users WHERE email='demo@matchday.local';
 PERFORM pg_temp.assert_true(uid IS NOT NULL,'seed có tài khoản demo');
 PERFORM pg_temp.assert_true((SELECT count(*)=7 FROM exams),'5 đề mẫu + 2 đề cá nhân');
 PERFORM pg_temp.assert_true((SELECT count(*)=4 FROM v_attempt_history),'4 lịch sử đã kết thúc');
 PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM attempts WHERE status='timed_out'),'bài hết giờ');
 PERFORM pg_temp.assert_true((SELECT score=8 AND page_leave_count=1 FROM v_attempt_history WHERE legacy_key='sample-math'),'chấm đúng/sai và đếm rời trang');
 PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM v_attempt_history WHERE exam_deleted_at IS NOT NULL),'xóa mềm giữ lịch sử');
 PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM v_attempt_review r JOIN attempts att ON att.id=r.attempt_id
   WHERE att.status='timed_out' AND selected_answer IS NULL AND is_flagged),'câu bỏ trống gắn cờ');
 PERFORM pg_temp.expect_rejected(format('INSERT INTO users(email,password_hash,display_name) VALUES(%L,%L,%L)',
   'DEMO@MATCHDAY.LOCAL','test-hash','trùng email'),'email không phân biệt hoa thường','23505');

 SELECT v.id INTO vid FROM exams e JOIN exam_versions v ON v.exam_id=e.id WHERE e.legacy_key='sample-math';
 SELECT id INTO qid FROM questions WHERE exam_version_id=vid AND question_no=1;
 PERFORM pg_temp.expect_rejected(format('UPDATE questions SET body=%L WHERE id=%L','nội dung khác',qid),'sửa câu công bố');
 PERFORM pg_temp.expect_rejected(format('DELETE FROM questions WHERE id=%L',qid),'xóa câu công bố');
 PERFORM pg_temp.expect_rejected(format('INSERT INTO questions(exam_version_id,question_no,body,option_a,option_b,option_c,option_d,correct_answer) VALUES(%L,6,%L,%L,%L,%L,%L,%L)',
   vid,'câu mới','a','b','c','d','a'),'thêm câu vào bản công bố');
 PERFORM pg_temp.expect_rejected(format('UPDATE exam_versions SET title=%L WHERE id=%L','đổi tên',vid),'sửa tiêu đề');
 PERFORM pg_temp.expect_rejected(format('UPDATE exam_versions SET duration_minutes=180 WHERE id=%L',vid),'sửa thời lượng');
 PERFORM pg_temp.expect_rejected(format('UPDATE exam_versions SET published_at=NULL WHERE id=%L',vid),'mở lại bản công bố');

 INSERT INTO exams(owner_id) VALUES(uid) RETURNING id INTO eid;
 INSERT INTO exam_versions(exam_id,version_no,title,duration_minutes) VALUES(eid,1,'Nháp kiểm tra',10) RETURNING id INTO draft;
 PERFORM pg_temp.expect_rejected(format('UPDATE questions SET exam_version_id=%L WHERE id=%L',draft,qid),'chuyển câu cũ sang nháp');
 PERFORM pg_temp.expect_rejected(format('UPDATE exam_versions SET published_at=now() WHERE id=%L',draft),'công bố đề rỗng');
 PERFORM pg_temp.expect_rejected(format('INSERT INTO questions(exam_version_id,question_no,body,option_a,option_b,option_c,option_d,correct_answer) VALUES(%L,1,%L,%L,%L,%L,%L,%L)',
   draft,'   ','a','b','c','d','a'),'nội dung khoảng trắng','23514');
 DELETE FROM exam_versions WHERE id=draft;
 payload := '[{"text":"Câu kiểm tra","options":{"a":"A","b":"B","c":"C","d":"D"},"correctAnswer":"a"}]'::jsonb;
 vid := create_exam_version(eid,uid,0,'Đề kiểm tra',10,payload);
 PERFORM pg_temp.assert_true((SELECT content_hash IS NOT NULL FROM exam_versions WHERE id=vid),'fingerprint được sinh');
 PERFORM pg_temp.expect_rejected(format('SELECT create_exam_version(%L,%s,0,%L,10,%L::jsonb)',eid,uid,'bản ghi đè',payload),'version conflict','40001');
 a := start_attempt(uid,vid);
 b := start_attempt(uid,vid,a.id);
 PERFORM pg_temp.assert_true(b.id=a.id,'start retry không tạo trùng');
 SELECT id INTO qid FROM questions WHERE exam_version_id=vid;
 SELECT v.id INTO other_vid FROM exams e JOIN exam_versions v ON v.exam_id=e.id WHERE e.legacy_key='sample-english';
 PERFORM pg_temp.expect_rejected(format('INSERT INTO attempt_answers(attempt_id,question_id,exam_version_id,selected_answer) SELECT %L,id,%L,%L FROM questions WHERE exam_version_id=%L LIMIT 1',
   a.id,vid,'a',other_vid),'câu thuộc nhầm đề');
 PERFORM pg_temp.expect_rejected(format('SELECT save_attempt(%s,%L,99,%L::jsonb,1)',uid,a.id,'[]'),'sync conflict','40001');
 PERFORM pg_temp.expect_rejected(format('UPDATE attempts SET status=%L WHERE id=%L','timed_out',a.id),'không ép timeout sớm');
 payload := jsonb_build_array(jsonb_build_object('questionId',qid,'selectedAnswer','a','isFlagged',true));
 a := save_attempt(uid,a.id,0,payload,1);
 PERFORM pg_temp.assert_true(a.sync_version=1 AND a.answered_count=1 AND a.score IS NULL,'autosave chưa có điểm chính thức');
 UPDATE attempt_answers SET is_correct=false WHERE attempt_id=a.id;
 PERFORM pg_temp.assert_true((SELECT is_correct FROM attempt_answers WHERE attempt_id=a.id),'không giả is_correct');
 UPDATE attempts SET answered_count=0,correct_count=0,wrong_count=0,score=0 WHERE id=a.id RETURNING * INTO a;
 PERFORM pg_temp.assert_true(a.answered_count=1 AND a.correct_count=1 AND a.score IS NULL,'không giả bộ đếm hoặc điểm lúc đang làm');
 ev:=gen_random_uuid();
 PERFORM record_leave_event(uid,a.id,ev,'hidden',a.started_at);
 PERFORM record_leave_event(uid,a.id,ev,'hidden',a.started_at);
 PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM attempt_leave_events WHERE attempt_id=a.id),'retry event không đếm trùng');
 PERFORM pg_temp.expect_rejected(format('SELECT record_leave_event(%s,%L,%L,%L,%L::timestamptz)',
   uid,a.id,gen_random_uuid(),'hidden',a.started_at-interval '1 minute'),'nhật ký trước khi bắt đầu');
 a := submit_attempt(uid,a.id,1,'[]');
 PERFORM pg_temp.assert_true(a.score=10 AND a.correct_count=1 AND a.page_leave_count=1 AND a.status='submitted','chấm bài từ DB');
 PERFORM pg_temp.assert_true((SELECT ended_at IS NOT NULL FROM attempt_leave_events WHERE id=ev),'đóng sự kiện mở');
 PERFORM pg_temp.expect_rejected(format('UPDATE attempt_leave_events SET ended_at=NULL WHERE id=%L',ev),'không mở lại sự kiện đã đóng');
 b := submit_attempt(uid,a.id,0,'[{"questionId":"invalid"}]');
 PERFORM pg_temp.assert_true(b IS NOT DISTINCT FROM a,'submit retry trả nguyên kết quả');
 PERFORM pg_temp.expect_rejected(format('UPDATE attempt_answers SET selected_answer=%L WHERE attempt_id=%L','b',a.id),'đổi đáp án sau nộp');
 PERFORM pg_temp.expect_rejected(format('DELETE FROM attempt_answers WHERE attempt_id=%L',a.id),'xóa đáp án sau nộp');
 PERFORM pg_temp.expect_rejected(format('UPDATE attempts SET score=0 WHERE id=%L',a.id),'đổi điểm sau nộp');
 PERFORM pg_temp.expect_rejected(format('UPDATE attempts SET status=%L WHERE id=%L','in_progress',a.id),'mở lại bài đã nộp');
 PERFORM pg_temp.expect_rejected(format('DELETE FROM attempts WHERE id=%L',a.id),'xóa cứng lịch sử');
 -- Deadline server, chấm snapshot offline, phân biệt ended/submitted.
 INSERT INTO attempts(user_id,exam_version_id,started_at,deadline_at,total_questions)
 VALUES(uid,vid,clock_timestamp()-interval '1 hour',clock_timestamp(),99) RETURNING * INTO a;
 PERFORM pg_temp.assert_true(a.total_questions=1 AND a.deadline_at=a.started_at+interval '10 minutes','không tin tổng câu/deadline truyền vào');
 a := submit_attempt(uid,a.id,0,payload);
 PERFORM pg_temp.assert_true(a.status='timed_out' AND a.score=10 AND a.ended_at=a.deadline_at AND a.submitted_at>a.ended_at,'offline timeout');
 -- Xóa mềm đề không làm mất review; không bắt đầu lượt mới.
 UPDATE exams SET deleted_at=clock_timestamp() WHERE id=eid;
 PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM v_attempt_review WHERE attempt_id=a.id),'review sau xóa mềm');
 PERFORM pg_temp.expect_rejected(format('SELECT start_attempt(%s,%L)',uid,vid),'không mở đề đã xóa');
 RAISE NOTICE 'PASS: toàn bộ assertion và các thao tác sai đều được kiểm tra.';
END $$;
ROLLBACK;
