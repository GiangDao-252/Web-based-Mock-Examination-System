--
-- PostgreSQL database dump
--

\restrict YPnRFzK7GQcurclocaXyTtqduP5EQ5wnDKKxMqVMxQkdisgVqKaLsl2a7JUWNXY

-- Dumped from database version 17.10
-- Dumped by pg_dump version 17.10

-- Started on 2026-11-01 08:48:46

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 252 (class 1255 OID 25165)
-- Name: apply_answer_batch(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_answer_batch(p_attempt_id uuid, p_answers jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE v UUID;
BEGIN
    IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' THEN RAISE EXCEPTION 'answers phải là array.'; END IF;
    IF jsonb_array_length(p_answers) > 100 THEN RAISE EXCEPTION 'Tối đa 100 đáp án mỗi batch.'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_answers) x GROUP BY x->>'questionId' HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'Trùng questionId trong batch.';
    END IF;
    SELECT exam_version_id INTO v FROM attempts WHERE id = p_attempt_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy lượt làm.'; END IF;
    INSERT INTO attempt_answers(attempt_id,question_id,exam_version_id,selected_answer,is_flagged)
        SELECT p_attempt_id,(x->>'questionId')::uuid,v,x->>'selectedAnswer',COALESCE((x->>'isFlagged')::boolean,false)
        FROM jsonb_array_elements(p_answers) x
        ON CONFLICT(attempt_id,question_id) DO UPDATE
            SET selected_answer=EXCLUDED.selected_answer,is_flagged=EXCLUDED.is_flagged;
END $$;


--
-- TOC entry 254 (class 1255 OID 25163)
-- Name: create_exam_version(uuid, bigint, integer, text, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_exam_version(p_exam_id uuid, p_user_id bigint, p_expected_version integer, p_title text, p_duration integer, p_questions jsonb) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
    e public.exams%ROWTYPE;
    latest INTEGER;
    vid UUID;

    q JSONB;
    question_index INTEGER := 0;
    option_key TEXT;
    option_count INTEGER;
BEGIN
    -- 1. Kiểm tra quyền sở hữu và khóa đề.
    SELECT *
    INTO e
    FROM public.exams
    WHERE id = p_exam_id
    FOR UPDATE;

    IF NOT FOUND
       OR e.owner_id IS DISTINCT FROM p_user_id
       OR e.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION
            'Chỉ chủ đề cá nhân đang hoạt động được tạo phiên bản.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.users
        WHERE id = p_user_id
          AND is_active
    ) THEN
        RAISE EXCEPTION 'Tài khoản không hoạt động.';
    END IF;

    -- 2. Kiểm tra phiên bản để tránh ghi đè giữa nhiều tab.
    SELECT COALESCE(max(version_no), 0)
    INTO latest
    FROM public.exam_versions
    WHERE exam_id = p_exam_id;

    IF p_expected_version IS NULL
       OR latest <> p_expected_version THEN
        RAISE EXCEPTION
            'VERSION_CONFLICT: phiên bản hiện tại là %.', latest
            USING ERRCODE = '40001';
    END IF;

    -- 3. Kiểm tra thông tin đề.
    IF p_title IS NULL
       OR p_title !~ '[^[:space:]]'
       OR char_length(p_title) > 120 THEN
        RAISE EXCEPTION 'Tên đề cần có từ 1 đến 120 ký tự.';
    END IF;

    IF p_duration IS NULL
       OR p_duration NOT BETWEEN 1 AND 180 THEN
        RAISE EXCEPTION 'Thời lượng phải từ 1 đến 180 phút.';
    END IF;

    -- 4. Phải là mảng trước khi kiểm tra độ dài.
    IF jsonb_typeof(p_questions) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'questions phải là một mảng JSON.';
    END IF;

    IF jsonb_array_length(p_questions) NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION 'Đề phải có từ 1 đến 100 câu.';
    END IF;

    -- 5. Kiểm tra từng câu trước khi ghi dữ liệu.
    FOR q IN
        SELECT value
        FROM jsonb_array_elements(p_questions)
    LOOP
        question_index := question_index + 1;

        IF jsonb_typeof(q) IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION
                'Câu %: dữ liệu phải là một object.', question_index;
        END IF;

        -- Nội dung phải thật sự là chuỗi, không tự đổi số thành chữ.
        IF jsonb_typeof(q->'text') IS DISTINCT FROM 'string' THEN
            RAISE EXCEPTION
                'Câu %: text phải là chuỗi văn bản.', question_index;
        END IF;

        IF (q->>'text') !~ '[^[:space:]]'
           OR char_length(q->>'text') > 10000 THEN
            RAISE EXCEPTION
                'Câu %: nội dung không được trống và tối đa 10000 ký tự.',
                question_index;
        END IF;

        -- options phải là object trước khi đếm khóa.
        IF jsonb_typeof(q->'options') IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION
                'Câu %: options phải là một object.', question_index;
        END IF;

        SELECT count(*)
        INTO option_count
        FROM jsonb_object_keys(q->'options');

        IF option_count <> 4
           OR NOT ((q->'options') ?& ARRAY['a', 'b', 'c', 'd']) THEN
            RAISE EXCEPTION
                'Câu %: options phải có đúng bốn khóa a, b, c, d.',
                question_index;
        END IF;

        -- Từng lựa chọn phải là chuỗi không trống.
        FOREACH option_key IN ARRAY ARRAY['a', 'b', 'c', 'd']
        LOOP
            IF jsonb_typeof(q->'options'->option_key)
               IS DISTINCT FROM 'string' THEN
                RAISE EXCEPTION
                    'Câu %: lựa chọn % phải là chuỗi văn bản.',
                    question_index, option_key;
            END IF;

            IF (q->'options'->>option_key) !~ '[^[:space:]]'
               OR char_length(q->'options'->>option_key) > 10000 THEN
                RAISE EXCEPTION
                    'Câu %: lựa chọn % không được trống và tối đa 10000 ký tự.',
                    question_index, option_key;
            END IF;
        END LOOP;

        -- Kiểm tra trước khi chuyển vào cột CHAR(1).
        IF jsonb_typeof(q->'correctAnswer') IS DISTINCT FROM 'string' THEN
            RAISE EXCEPTION
                'Câu %: correctAnswer phải là chuỗi.', question_index;
        END IF;

        IF (q->>'correctAnswer') NOT IN ('a', 'b', 'c', 'd') THEN
            RAISE EXCEPTION
                'Câu %: correctAnswer phải là a, b, c hoặc d.',
                question_index;
        END IF;

        -- Lời giải có thể bỏ qua; nếu có phải là chuỗi.
        IF q ? 'explanation' THEN
            IF jsonb_typeof(q->'explanation') IS DISTINCT FROM 'string' THEN
                RAISE EXCEPTION
                    'Câu %: explanation phải là chuỗi văn bản.',
                    question_index;
            END IF;

            IF char_length(q->>'explanation') > 20000 THEN
                RAISE EXCEPTION
                    'Câu %: lời giải tối đa 20000 ký tự.', question_index;
            END IF;
        END IF;
    END LOOP;

    -- 6. Chỉ tạo phiên bản khi toàn bộ dữ liệu đã hợp lệ.
    INSERT INTO public.exam_versions (
        exam_id, version_no, title, duration_minutes
    )
    VALUES (
        p_exam_id, latest + 1, p_title, p_duration
    )
    RETURNING id INTO vid;

    INSERT INTO public.questions (
        exam_version_id,
        question_no,
        body,
        option_a,
        option_b,
        option_c,
        option_d,
        correct_answer,
        explanation
    )
    SELECT
        vid,
        ord::INTEGER,
        item->>'text',
        item#>>'{options,a}',
        item#>>'{options,b}',
        item#>>'{options,c}',
        item#>>'{options,d}',
        item->>'correctAnswer',
        item->>'explanation'
    FROM jsonb_array_elements(p_questions)
         WITH ORDINALITY AS x(item, ord);

    -- Trigger công bố sẽ kiểm tra đề và tính fingerprint.
    UPDATE public.exam_versions
    SET published_at = clock_timestamp()
    WHERE id = vid;

    RETURN vid;
END;
$$;


--
-- TOC entry 250 (class 1255 OID 25161)
-- Name: guard_attempt(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_attempt() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v exam_versions%ROWTYPE; e exams%ROWTYPE; n INTEGER; answered INTEGER; correct INTEGER; received TIMESTAMPTZ;
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Không xóa cứng lượt làm; giữ lịch sử.'; END IF;
    IF TG_OP = 'INSERT' THEN
        SELECT * INTO v FROM exam_versions WHERE id = NEW.exam_version_id;
        IF NOT FOUND OR v.published_at IS NULL THEN RAISE EXCEPTION 'Chỉ làm phiên bản đã công bố.'; END IF;
        SELECT * INTO e FROM exams WHERE id = v.exam_id FOR SHARE;
        IF e.deleted_at IS NOT NULL OR (e.owner_id IS NOT NULL AND e.owner_id <> NEW.user_id) THEN
            RAISE EXCEPTION 'Đề đã xóa hoặc không thuộc quyền truy cập.';
        END IF;
        IF NOT EXISTS(SELECT 1 FROM users WHERE id = NEW.user_id AND is_active) THEN
            RAISE EXCEPTION 'Tài khoản không hoạt động.';
        END IF;
        IF NEW.status <> 'in_progress' THEN RAISE EXCEPTION 'Lượt mới phải ở trạng thái in_progress.'; END IF;
        IF NEW.started_at > clock_timestamp() THEN RAISE EXCEPTION 'Không bắt đầu trong tương lai.'; END IF;
        SELECT count(*) INTO n FROM questions WHERE exam_version_id = v.id;
        NEW.total_questions := n;
        NEW.deadline_at := NEW.started_at + make_interval(mins => v.duration_minutes);
        NEW.answered_count := 0; NEW.correct_count := 0; NEW.wrong_count := 0;
        NEW.score := NULL; NEW.ended_at := NULL; NEW.submitted_at := NULL;
        NEW.page_leave_count := 0; NEW.sync_version := 0;
        RETURN NEW;
    END IF;
    IF OLD.status <> 'in_progress' THEN
        IF NEW IS NOT DISTINCT FROM OLD THEN RETURN OLD; END IF;
        RAISE EXCEPTION 'Lượt đã chốt: không thay đổi kết quả hoặc mở lại bài.';
    END IF;
    IF (NEW.id, NEW.user_id, NEW.exam_version_id, NEW.started_at, NEW.deadline_at, NEW.total_questions)
       IS DISTINCT FROM (OLD.id, OLD.user_id, OLD.exam_version_id, OLD.started_at, OLD.deadline_at, OLD.total_questions) THEN
        RAISE EXCEPTION 'Không thay đổi danh tính hoặc thời lượng lượt làm.';
    END IF;
    SELECT count(*) FILTER (WHERE aa.selected_answer IS NOT NULL),
           count(*) FILTER (WHERE aa.selected_answer = q.correct_answer)
      INTO answered, correct FROM questions q LEFT JOIN attempt_answers aa
        ON aa.question_id = q.id AND aa.attempt_id = OLD.id
      WHERE q.exam_version_id = OLD.exam_version_id;
    NEW.answered_count := answered;
    NEW.correct_count := correct;
    NEW.wrong_count := answered - correct;
    SELECT count(*) INTO NEW.page_leave_count FROM attempt_leave_events WHERE attempt_id = OLD.id;
    IF NEW.status = 'in_progress' THEN
        NEW.score := NULL; NEW.ended_at := NULL; NEW.submitted_at := NULL;
    ELSE
        received := clock_timestamp();
        -- Không tin score/count/timestamp từ client.
        IF received >= OLD.deadline_at OR NEW.status = 'timed_out' THEN
            -- Không cho ép timeout sớm.
            IF received < OLD.deadline_at THEN RAISE EXCEPTION 'Bài chưa hết thời gian.'; END IF;
            NEW.status := 'timed_out'; NEW.ended_at := OLD.deadline_at;
        ELSE
            NEW.status := 'submitted'; NEW.ended_at := received;
        END IF;
        NEW.submitted_at := received;
        NEW.score := round(correct * 10.0 / OLD.total_questions, 2);
        -- Đóng sự kiện chưa quay lại ngay trong transaction nộp bài.
        UPDATE attempt_leave_events SET ended_at = NEW.ended_at
            WHERE attempt_id = OLD.id AND visible_at IS NULL AND ended_at IS NULL;
        IF EXISTS(SELECT 1 FROM attempt_leave_events WHERE attempt_id = OLD.id
            AND COALESCE(visible_at, ended_at, hidden_at) > NEW.ended_at) THEN
            RAISE EXCEPTION 'Nhật ký vượt quá thời điểm kết thúc.';
        END IF;
    END IF;
    RETURN NEW;
END $$;


--
-- TOC entry 248 (class 1255 OID 25157)
-- Name: guard_attempt_answer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_attempt_answer() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE a attempts%ROWTYPE; expected CHAR(1); aid UUID;
BEGIN
    IF TG_OP = 'UPDATE' AND (NEW.attempt_id, NEW.question_id, NEW.exam_version_id) IS DISTINCT FROM
       (OLD.attempt_id, OLD.question_id, OLD.exam_version_id) THEN
        RAISE EXCEPTION 'Không thay đổi danh tính đáp án.';
    END IF;
    IF TG_OP = 'DELETE' THEN aid := OLD.attempt_id; ELSE aid := NEW.attempt_id; END IF;
    SELECT * INTO a FROM attempts WHERE id = aid FOR UPDATE;
    IF NOT FOUND OR a.status <> 'in_progress' THEN RAISE EXCEPTION 'Lượt làm không tồn tại hoặc đã kết thúc.'; END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    SELECT correct_answer INTO expected FROM questions
        WHERE id = NEW.question_id AND exam_version_id = a.exam_version_id;
    IF NOT FOUND OR NEW.exam_version_id <> a.exam_version_id THEN
        RAISE EXCEPTION 'Câu hỏi không thuộc phiên bản của lượt làm.';
    END IF;
    NEW.is_correct := CASE WHEN NEW.selected_answer IS NULL THEN NULL ELSE NEW.selected_answer = expected END;
    NEW.answered_at := CASE WHEN NEW.selected_answer IS NULL THEN NULL ELSE clock_timestamp() END;
    RETURN NEW;
END $$;


--
-- TOC entry 247 (class 1255 OID 25155)
-- Name: guard_exam_version(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_exam_version() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE n INTEGER; last_no INTEGER; canonical JSONB;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.published_at IS NOT NULL THEN RAISE EXCEPTION 'Tạo nháp, thêm câu hỏi rồi mới công bố.'; END IF;
        NEW.content_hash := NULL;
        RETURN NEW;
    END IF;
    IF OLD.published_at IS NOT NULL THEN RAISE EXCEPTION 'Phiên bản đã công bố là bất biến; tạo phiên bản mới.'; END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF (NEW.id, NEW.exam_id, NEW.version_no, NEW.created_at) IS DISTINCT FROM
       (OLD.id, OLD.exam_id, OLD.version_no, OLD.created_at) THEN
        RAISE EXCEPTION 'Không thay đổi danh tính phiên bản.';
    END IF;
    NEW.content_hash := NULL;
    IF NEW.published_at IS NOT NULL THEN
        SELECT count(*), max(question_no), jsonb_agg(jsonb_build_array(
            question_no, body, option_a, option_b, option_c, option_d, correct_answer, explanation
        ) ORDER BY question_no) INTO n, last_no, canonical FROM questions WHERE exam_version_id = NEW.id;
        IF n NOT BETWEEN 1 AND 100 OR last_no <> n THEN
            RAISE EXCEPTION 'Đề cần 1–100 câu, số thứ tự liên tục từ 1.';
        END IF;
        -- MD5 là fingerprint nội dung, KHÔNG phải hash mật khẩu hoặc chữ ký bảo mật.
        NEW.content_hash := md5(jsonb_build_array(NEW.title, NEW.duration_minutes, canonical)::text);
        NEW.published_at := clock_timestamp();
    END IF;
    RETURN NEW;
END $$;


--
-- TOC entry 249 (class 1255 OID 25159)
-- Name: guard_leave_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_leave_event() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE a attempts%ROWTYPE; aid UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Không xóa nhật ký; lịch sử được giữ nguyên.'; END IF;
    IF TG_OP = 'UPDATE' AND (NEW.id, NEW.attempt_id, NEW.kind, NEW.hidden_at) IS DISTINCT FROM
       (OLD.id, OLD.attempt_id, OLD.kind, OLD.hidden_at) THEN RAISE EXCEPTION 'Không đổi danh tính sự kiện.'; END IF;
    IF TG_OP = 'UPDATE' AND (OLD.visible_at IS NOT NULL OR OLD.ended_at IS NOT NULL)
       AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Sự kiện đã đóng không được sửa hoặc mở lại.'; END IF;
    aid := NEW.attempt_id;
    SELECT * INTO a FROM attempts WHERE id = aid FOR UPDATE;
    IF NOT FOUND OR a.status <> 'in_progress' THEN RAISE EXCEPTION 'Chỉ ghi nhật ký khi bài chưa chốt.'; END IF;
    IF NEW.hidden_at < a.started_at OR NEW.hidden_at > a.deadline_at
       OR NEW.hidden_at > clock_timestamp()
       OR COALESCE(NEW.visible_at, NEW.ended_at, NEW.hidden_at) > a.deadline_at
       OR COALESCE(NEW.visible_at, NEW.ended_at, NEW.hidden_at) > clock_timestamp() THEN
        RAISE EXCEPTION 'Thời gian sự kiện nằm ngoài khoảng làm bài.';
    END IF;
    RETURN NEW;
END $$;


--
-- TOC entry 246 (class 1255 OID 25153)
-- Name: guard_question_version(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_question_version() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v UUID; stamp TIMESTAMPTZ;
BEGIN
    IF TG_OP = 'UPDATE' AND (NEW.id, NEW.exam_version_id) IS DISTINCT FROM (OLD.id, OLD.exam_version_id) THEN
        RAISE EXCEPTION 'Không chuyển câu hỏi sang phiên bản khác; hãy sao chép vào phiên bản mới.';
    END IF;
    IF TG_OP = 'DELETE' THEN v := OLD.exam_version_id; ELSE v := NEW.exam_version_id; END IF;
    SELECT published_at INTO stamp FROM exam_versions WHERE id = v FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Phiên bản đề không tồn tại.'; END IF;
    IF stamp IS NOT NULL THEN RAISE EXCEPTION 'Phiên bản đã công bố: không thêm/sửa/xóa câu hỏi.'; END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;


--
-- TOC entry 256 (class 1255 OID 25168)
-- Name: record_leave_event(bigint, uuid, uuid, text, timestamp with time zone, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_leave_event(p_user_id bigint, p_attempt_id uuid, p_event_id uuid, p_kind text, p_hidden_at timestamp with time zone, p_visible_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_ended_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE a attempts%ROWTYPE; old_event attempt_leave_events%ROWTYPE;
BEGIN
    SELECT * INTO a FROM attempts WHERE id=p_attempt_id AND user_id=p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy lượt làm thuộc tài khoản.'; END IF;
    SELECT * INTO old_event FROM attempt_leave_events WHERE id=p_event_id;
    IF FOUND THEN
        IF old_event.attempt_id <> p_attempt_id OR old_event.kind <> p_kind OR old_event.hidden_at <> p_hidden_at THEN
            RAISE EXCEPTION 'UUID sự kiện đã được sử dụng.';
        END IF;
        IF old_event.visible_at IS NOT DISTINCT FROM p_visible_at AND old_event.ended_at IS NOT DISTINCT FROM p_ended_at THEN RETURN; END IF;
    END IF;
    IF a.status <> 'in_progress' THEN RAISE EXCEPTION 'Bài đã kết thúc.'; END IF;
    INSERT INTO attempt_leave_events(id,attempt_id,kind,hidden_at,visible_at,ended_at)
        VALUES(p_event_id,p_attempt_id,p_kind,p_hidden_at,p_visible_at,p_ended_at)
        ON CONFLICT(id) DO UPDATE SET visible_at=EXCLUDED.visible_at,ended_at=EXCLUDED.ended_at;
    UPDATE attempts SET last_seen_at=clock_timestamp() WHERE id=p_attempt_id;
END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 229 (class 1259 OID 25075)
-- Name: attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id bigint NOT NULL,
    exam_version_id uuid NOT NULL,
    status character varying(12) DEFAULT 'in_progress'::character varying NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    deadline_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    submitted_at timestamp with time zone,
    client_ended_at timestamp with time zone,
    last_seen_at timestamp with time zone,
    sync_version integer DEFAULT 0 NOT NULL,
    last_synced_at timestamp with time zone,
    current_question integer,
    total_questions integer NOT NULL,
    answered_count integer DEFAULT 0 NOT NULL,
    correct_count integer DEFAULT 0 NOT NULL,
    wrong_count integer DEFAULT 0 NOT NULL,
    score numeric(4,2),
    page_leave_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT attempts_check CHECK ((deadline_at > started_at)),
    CONSTRAINT attempts_check1 CHECK (((current_question IS NULL) OR ((current_question >= 1) AND (current_question <= total_questions)))),
    CONSTRAINT attempts_check2 CHECK (((answered_count >= 0) AND (answered_count <= total_questions))),
    CONSTRAINT attempts_check3 CHECK (((correct_count >= 0) AND (correct_count <= answered_count))),
    CONSTRAINT attempts_check4 CHECK ((wrong_count = (answered_count - correct_count))),
    CONSTRAINT attempts_check5 CHECK (((score IS NULL) OR (score = round((((correct_count)::numeric * 10.0) / (total_questions)::numeric), 2)))),
    CONSTRAINT attempts_check6 CHECK (((((status)::text = 'in_progress'::text) AND (submitted_at IS NULL) AND (ended_at IS NULL) AND (score IS NULL)) OR (((status)::text = ANY ((ARRAY['submitted'::character varying, 'timed_out'::character varying])::text[])) AND (submitted_at IS NOT NULL) AND (ended_at IS NOT NULL) AND (score IS NOT NULL) AND (ended_at >= started_at) AND (ended_at <= deadline_at) AND (submitted_at >= ended_at)))),
    CONSTRAINT attempts_check7 CHECK ((((status)::text <> 'timed_out'::text) OR (ended_at = deadline_at))),
    CONSTRAINT attempts_page_leave_count_check CHECK ((page_leave_count >= 0)),
    CONSTRAINT attempts_status_check CHECK (((status)::text = ANY ((ARRAY['in_progress'::character varying, 'submitted'::character varying, 'timed_out'::character varying])::text[]))),
    CONSTRAINT attempts_sync_version_check CHECK ((sync_version >= 0)),
    CONSTRAINT attempts_total_questions_check CHECK (((total_questions >= 1) AND (total_questions <= 100)))
);


--
-- TOC entry 253 (class 1255 OID 25166)
-- Name: save_attempt(bigint, uuid, integer, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_attempt(p_user_id bigint, p_attempt_id uuid, p_expected_sync integer, p_answers jsonb, p_current_question integer) RETURNS public.attempts
    LANGUAGE plpgsql
    AS $$
DECLARE a attempts%ROWTYPE;
BEGIN
    SELECT * INTO a FROM attempts WHERE id=p_attempt_id AND user_id=p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy lượt làm thuộc tài khoản.'; END IF;
    IF a.status <> 'in_progress' THEN RAISE EXCEPTION 'Bài đã kết thúc.'; END IF;
    IF clock_timestamp() >= a.deadline_at THEN RAISE EXCEPTION 'Bài hết giờ; dùng submit_attempt để chốt.'; END IF;
    IF p_expected_sync IS NULL OR a.sync_version <> p_expected_sync THEN RAISE EXCEPTION 'SYNC_CONFLICT' USING ERRCODE='40001'; END IF;
    PERFORM apply_answer_batch(a.id,p_answers);
    UPDATE attempts SET current_question=p_current_question,sync_version=sync_version+1,
        last_seen_at=clock_timestamp(),last_synced_at=clock_timestamp() WHERE id=a.id RETURNING * INTO a;
    RETURN a;
END $$;


--
-- TOC entry 251 (class 1255 OID 25164)
-- Name: start_attempt(bigint, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_attempt(p_user_id bigint, p_version_id uuid, p_attempt_id uuid DEFAULT gen_random_uuid()) RETURNS public.attempts
    LANGUAGE plpgsql
    AS $$
DECLARE a attempts%ROWTYPE;
BEGIN
    -- Serialize theo user: cùng UUID khác phiên bản cũng không bị tạo trùng.
    PERFORM 1 FROM users WHERE id = p_user_id AND is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tài khoản không hoạt động.'; END IF;
    SELECT * INTO a FROM attempts WHERE id = p_attempt_id FOR UPDATE;
    IF FOUND THEN
        IF a.user_id <> p_user_id OR a.exam_version_id <> p_version_id THEN RAISE EXCEPTION 'UUID đã thuộc lượt khác.'; END IF;
        RETURN a;
    END IF;
    SELECT * INTO a FROM attempts WHERE user_id=p_user_id AND exam_version_id=p_version_id AND status='in_progress' FOR UPDATE;
    IF FOUND THEN RETURN a; END IF;
    INSERT INTO attempts(id,user_id,exam_version_id,started_at,deadline_at,total_questions)
        VALUES(p_attempt_id,p_user_id,p_version_id,clock_timestamp(),clock_timestamp(),1) RETURNING * INTO a;
    RETURN a;
END $$;


--
-- TOC entry 255 (class 1255 OID 25167)
-- Name: submit_attempt(bigint, uuid, integer, jsonb, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_attempt(p_user_id bigint, p_attempt_id uuid, p_expected_sync integer, p_answers jsonb DEFAULT '[]'::jsonb, p_client_ended_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS public.attempts
    LANGUAGE plpgsql
    AS $$
DECLARE a attempts%ROWTYPE;
BEGIN
    SELECT * INTO a FROM attempts WHERE id=p_attempt_id AND user_id=p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy lượt làm thuộc tài khoản.'; END IF;
    -- Idempotent: đã chốt trả kết quả cũ, không áp dụng lại payload.
    IF a.status <> 'in_progress' THEN RETURN a; END IF;
    IF p_expected_sync IS NULL OR a.sync_version <> p_expected_sync THEN RAISE EXCEPTION 'SYNC_CONFLICT' USING ERRCODE='40001'; END IF;
    -- MVP tự luyện: cho đồng bộ snapshot offline sau deadline; vẫn đánh dấu timed_out.
    -- Không thể chứng minh lúc chọn offline; không dùng chính sách này cho kỳ thi có giám sát.
    PERFORM apply_answer_batch(a.id,p_answers);
    UPDATE attempts SET status='submitted',client_ended_at=p_client_ended_at,
        sync_version=sync_version+1,last_synced_at=clock_timestamp()
        WHERE id=a.id RETURNING * INTO a;
    RETURN a;
END $$;


--
-- TOC entry 234 (class 1255 OID 25149)
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at := clock_timestamp(); RETURN NEW; END $$;


--
-- TOC entry 230 (class 1259 OID 25115)
-- Name: attempt_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attempt_answers (
    attempt_id uuid NOT NULL,
    question_id uuid NOT NULL,
    exam_version_id uuid NOT NULL,
    selected_answer character(1),
    is_flagged boolean DEFAULT false NOT NULL,
    is_correct boolean,
    answered_at timestamp with time zone,
    CONSTRAINT attempt_answers_selected_answer_check CHECK ((selected_answer = ANY (ARRAY['a'::bpchar, 'b'::bpchar, 'c'::bpchar, 'd'::bpchar])))
);


--
-- TOC entry 231 (class 1259 OID 25132)
-- Name: attempt_leave_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attempt_leave_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attempt_id uuid NOT NULL,
    kind character varying(8) DEFAULT 'hidden'::character varying NOT NULL,
    hidden_at timestamp with time zone NOT NULL,
    visible_at timestamp with time zone,
    ended_at timestamp with time zone,
    CONSTRAINT attempt_leave_events_check CHECK (((visible_at IS NULL) OR (visible_at >= hidden_at))),
    CONSTRAINT attempt_leave_events_check1 CHECK (((ended_at IS NULL) OR (ended_at >= hidden_at))),
    CONSTRAINT attempt_leave_events_check2 CHECK (((visible_at IS NULL) OR (ended_at IS NULL))),
    CONSTRAINT attempt_leave_events_kind_check CHECK (((kind)::text = ANY ((ARRAY['hidden'::character varying, 'blur'::character varying])::text[])))
);


--
-- TOC entry 227 (class 1259 OID 25031)
-- Name: exam_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    exam_id uuid NOT NULL,
    version_no integer NOT NULL,
    title character varying(120) NOT NULL,
    duration_minutes integer NOT NULL,
    content_hash text,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT exam_versions_duration_minutes_check CHECK (((duration_minutes >= 1) AND (duration_minutes <= 180))),
    CONSTRAINT exam_versions_title_check CHECK (((title)::text ~ '[^[:space:]]'::text)),
    CONSTRAINT exam_versions_version_no_check CHECK ((version_no >= 1))
);


--
-- TOC entry 226 (class 1259 OID 25007)
-- Name: exams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id bigint,
    subject_id smallint,
    legacy_key character varying(60),
    description text,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT exams_legacy_key_check CHECK (((legacy_key IS NULL) OR (btrim((legacy_key)::text) <> ''::text)))
);


--
-- TOC entry 228 (class 1259 OID 25050)
-- Name: questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    exam_version_id uuid NOT NULL,
    question_no integer NOT NULL,
    body text NOT NULL,
    option_a text NOT NULL,
    option_b text NOT NULL,
    option_c text NOT NULL,
    option_d text NOT NULL,
    correct_answer character(1) NOT NULL,
    explanation text,
    CONSTRAINT questions_body_check CHECK (((body ~ '[^[:space:]]'::text) AND (char_length(body) <= 10000))),
    CONSTRAINT questions_correct_answer_check CHECK ((correct_answer = ANY (ARRAY['a'::bpchar, 'b'::bpchar, 'c'::bpchar, 'd'::bpchar]))),
    CONSTRAINT questions_explanation_check CHECK (((explanation IS NULL) OR (char_length(explanation) <= 20000))),
    CONSTRAINT questions_option_a_check CHECK (((option_a ~ '[^[:space:]]'::text) AND (char_length(option_a) <= 10000))),
    CONSTRAINT questions_option_b_check CHECK (((option_b ~ '[^[:space:]]'::text) AND (char_length(option_b) <= 10000))),
    CONSTRAINT questions_option_c_check CHECK (((option_c ~ '[^[:space:]]'::text) AND (char_length(option_c) <= 10000))),
    CONSTRAINT questions_option_d_check CHECK (((option_d ~ '[^[:space:]]'::text) AND (char_length(option_d) <= 10000))),
    CONSTRAINT questions_question_no_check CHECK (((question_no >= 1) AND (question_no <= 100)))
);


--
-- TOC entry 225 (class 1259 OID 24999)
-- Name: subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subjects (
    id smallint NOT NULL,
    name character varying(60) NOT NULL,
    CONSTRAINT subjects_name_check CHECK (((name)::text ~ '[^[:space:]]'::text))
);


--
-- TOC entry 224 (class 1259 OID 24998)
-- Name: subjects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.subjects ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.subjects_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 223 (class 1259 OID 24978)
-- Name: user_otps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_otps (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    purpose character varying(20) NOT NULL,
    otp_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    failed_attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_otps_check CHECK ((expires_at > created_at)),
    CONSTRAINT user_otps_check1 CHECK (((used_at IS NULL) OR (used_at >= created_at))),
    CONSTRAINT user_otps_failed_attempts_check CHECK (((failed_attempts >= 0) AND (failed_attempts <= 5))),
    CONSTRAINT user_otps_otp_hash_check CHECK ((btrim(otp_hash) <> ''::text)),
    CONSTRAINT user_otps_purpose_check CHECK (((purpose)::text = ANY ((ARRAY['login'::character varying, 'password_reset'::character varying])::text[])))
);


--
-- TOC entry 222 (class 1259 OID 24977)
-- Name: user_otps_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.user_otps ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.user_otps_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 221 (class 1259 OID 24966)
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    user_id bigint NOT NULL,
    goal character varying(200),
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 220 (class 1259 OID 24950)
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    email character varying(254) NOT NULL,
    password_hash text NOT NULL,
    display_name character varying(100) NOT NULL,
    role character varying(10) DEFAULT 'student'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_display_name_check CHECK (((display_name)::text ~ '[^[:space:]]'::text)),
    CONSTRAINT users_email_check CHECK ((((email)::text = btrim((email)::text)) AND (POSITION(('@'::text) IN (email)) > 1))),
    CONSTRAINT users_password_hash_check CHECK ((btrim(password_hash) <> ''::text)),
    CONSTRAINT users_role_check CHECK (((role)::text = 'student'::text))
);


--
-- TOC entry 219 (class 1259 OID 24949)
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.users ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 232 (class 1259 OID 25169)
-- Name: v_attempt_history; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_attempt_history AS
 SELECT a.id,
    a.user_id,
    a.exam_version_id,
    a.status,
    a.started_at,
    a.deadline_at,
    a.ended_at,
    a.submitted_at,
    a.client_ended_at,
    a.last_seen_at,
    a.sync_version,
    a.last_synced_at,
    a.current_question,
    a.total_questions,
    a.answered_count,
    a.correct_count,
    a.wrong_count,
    a.score,
    a.page_leave_count,
    e.id AS exam_id,
    e.legacy_key,
    e.deleted_at AS exam_deleted_at,
    v.version_no,
    v.title,
    v.duration_minutes,
    v.content_hash,
    (a.total_questions - a.answered_count) AS unanswered_count,
        CASE a.status
            WHEN 'submitted'::text THEN 'manual'::text
            WHEN 'timed_out'::text THEN 'timeout'::text
            ELSE NULL::text
        END AS reason
   FROM ((public.attempts a
     JOIN public.exam_versions v ON ((v.id = a.exam_version_id)))
     JOIN public.exams e ON ((e.id = v.exam_id)))
  WHERE ((a.status)::text = ANY ((ARRAY['submitted'::character varying, 'timed_out'::character varying])::text[]));


--
-- TOC entry 233 (class 1259 OID 25174)
-- Name: v_attempt_review; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_attempt_review AS
 SELECT a.id AS attempt_id,
    a.user_id,
    q.id AS question_id,
    q.question_no,
    q.body,
    q.option_a,
    q.option_b,
    q.option_c,
    q.option_d,
    q.correct_answer,
    q.explanation,
    aa.selected_answer,
    COALESCE(aa.is_flagged, false) AS is_flagged,
    COALESCE((aa.selected_answer = q.correct_answer), false) AS is_correct
   FROM ((public.attempts a
     JOIN public.questions q ON ((q.exam_version_id = a.exam_version_id)))
     LEFT JOIN public.attempt_answers aa ON (((aa.attempt_id = a.id) AND (aa.question_id = q.id))))
  WHERE ((a.status)::text = ANY ((ARRAY['submitted'::character varying, 'timed_out'::character varying])::text[]));


--
-- TOC entry 5081 (class 0 OID 25115)
-- Dependencies: 230
-- Data for Name: attempt_answers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.attempt_answers (attempt_id, question_id, exam_version_id, selected_answer, is_flagged, is_correct, answered_at) FROM stdin;
2689cf3f-cbac-4fe8-8762-1ca2607cdd2a	fb898fbb-6f41-40e4-a8d0-15d327d54233	7afe2750-cee0-4d97-b7f7-914f0725247e	b	f	t	2026-11-01 08:22:00.168879+07
2689cf3f-cbac-4fe8-8762-1ca2607cdd2a	0dfa412e-1c63-4044-8bce-236639a87d45	7afe2750-cee0-4d97-b7f7-914f0725247e	c	f	t	2026-11-01 08:22:00.169259+07
2689cf3f-cbac-4fe8-8762-1ca2607cdd2a	a969ddc2-9bbc-462c-85c6-27e457b9b05e	7afe2750-cee0-4d97-b7f7-914f0725247e	a	f	f	2026-11-01 08:22:00.169327+07
2689cf3f-cbac-4fe8-8762-1ca2607cdd2a	fd34082d-3650-4748-b0f1-dc10f6172922	7afe2750-cee0-4d97-b7f7-914f0725247e	b	f	t	2026-11-01 08:22:00.169383+07
2689cf3f-cbac-4fe8-8762-1ca2607cdd2a	e7099b14-5922-44c3-9f12-24c6a14dc9e3	7afe2750-cee0-4d97-b7f7-914f0725247e	b	f	t	2026-11-01 08:22:00.169434+07
dc0f4ce6-fb16-4026-ba41-5e9398461958	773bcdfb-91b7-4f26-8d5d-1a0a6b5ed564	7d601828-f631-442f-aee5-d104d85c68df	b	f	t	2026-11-01 08:22:00.171993+07
dc0f4ce6-fb16-4026-ba41-5e9398461958	de61d51e-1f8c-4457-8346-9b7b156eb037	7d601828-f631-442f-aee5-d104d85c68df	c	f	t	2026-11-01 08:22:00.172025+07
dc0f4ce6-fb16-4026-ba41-5e9398461958	b177332e-8510-4a4c-b205-05fcd5ba6741	7d601828-f631-442f-aee5-d104d85c68df	b	f	t	2026-11-01 08:22:00.172041+07
dc0f4ce6-fb16-4026-ba41-5e9398461958	e585b08d-35b9-48ea-bdf0-bc1e7f528625	7d601828-f631-442f-aee5-d104d85c68df	a	f	t	2026-11-01 08:22:00.172056+07
dc0f4ce6-fb16-4026-ba41-5e9398461958	37377ca4-f38c-4601-9ce9-e20b8d9aaac7	7d601828-f631-442f-aee5-d104d85c68df	\N	t	\N	\N
a13064d1-441e-4bc1-9000-9d9c6b2b4ba6	dc0d09f6-3de9-46f9-b5be-04fab01b0cd5	cc240a6c-23ad-4f69-904e-d16ea9e71165	b	f	t	2026-11-01 08:22:00.174074+07
505c4ea5-b76e-4f2b-84f8-0cb3886a81b4	54c557c8-8993-45df-8187-8fcc2cc99a63	8009874e-b5d1-4539-8fca-dc495ce94eb2	c	f	t	2026-11-01 08:22:00.178651+07
ea18da60-2878-42c4-867d-7fed049c87c3	70832bc9-bb11-4a0d-9f05-15bbab79372a	a1d0fd80-fefd-471d-9ea1-1dc7a5264c7b	\N	t	\N	\N
ea18da60-2878-42c4-867d-7fed049c87c3	00a854ef-e0d7-4e4f-a412-210515837242	a1d0fd80-fefd-471d-9ea1-1dc7a5264c7b	\N	f	\N	\N
\.


--
-- TOC entry 5082 (class 0 OID 25132)
-- Dependencies: 231
-- Data for Name: attempt_leave_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.attempt_leave_events (id, attempt_id, kind, hidden_at, visible_at, ended_at) FROM stdin;
343c6815-7663-414d-8acf-d8ad99d3fb7b	2689cf3f-cbac-4fe8-8762-1ca2607cdd2a	hidden	2026-11-01 08:18:00.154417+07	2026-11-01 08:18:20.154417+07	\N
\.


--
-- TOC entry 5080 (class 0 OID 25075)
-- Dependencies: 229
-- Data for Name: attempts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.attempts (id, user_id, exam_version_id, status, started_at, deadline_at, ended_at, submitted_at, client_ended_at, last_seen_at, sync_version, last_synced_at, current_question, total_questions, answered_count, correct_count, wrong_count, score, page_leave_count) FROM stdin;
2689cf3f-cbac-4fe8-8762-1ca2607cdd2a	1	7afe2750-cee0-4d97-b7f7-914f0725247e	submitted	2026-11-01 08:17:00.154417+07	2026-11-01 08:32:00.154417+07	2026-11-01 08:22:00.169957+07	2026-11-01 08:22:00.169957+07	\N	2026-11-01 08:22:00.164663+07	1	2026-11-01 08:22:00.169786+07	\N	5	5	4	1	8.00	1
dc0f4ce6-fb16-4026-ba41-5e9398461958	1	7d601828-f631-442f-aee5-d104d85c68df	timed_out	2026-10-31 08:22:00.171402+07	2026-10-31 08:32:00.171402+07	2026-10-31 08:32:00.171402+07	2026-11-01 08:22:00.17233+07	\N	\N	1	2026-11-01 08:22:00.172196+07	\N	5	4	4	0	8.00	0
a13064d1-441e-4bc1-9000-9d9c6b2b4ba6	1	cc240a6c-23ad-4f69-904e-d16ea9e71165	submitted	2026-11-01 08:20:00.173545+07	2026-11-01 08:35:00.173545+07	2026-11-01 08:22:00.174322+07	2026-11-01 08:22:00.174322+07	\N	\N	1	2026-11-01 08:22:00.174165+07	\N	1	1	1	0	10.00	0
505c4ea5-b76e-4f2b-84f8-0cb3886a81b4	1	8009874e-b5d1-4539-8fca-dc495ce94eb2	submitted	2026-11-01 08:21:00.177353+07	2026-11-01 08:31:00.177353+07	2026-11-01 08:22:00.179176+07	2026-11-01 08:22:00.179176+07	\N	\N	1	2026-11-01 08:22:00.17882+07	\N	1	1	1	0	10.00	0
ea18da60-2878-42c4-867d-7fed049c87c3	1	a1d0fd80-fefd-471d-9ea1-1dc7a5264c7b	in_progress	2026-11-01 08:22:00.181991+07	2026-11-01 08:37:00.181991+07	\N	\N	\N	2026-11-01 08:22:00.184585+07	1	2026-11-01 08:22:00.184585+07	1	2	0	0	0	\N	0
\.


--
-- TOC entry 5078 (class 0 OID 25031)
-- Dependencies: 227
-- Data for Name: exam_versions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.exam_versions (id, exam_id, version_no, title, duration_minutes, content_hash, published_at, created_at) FROM stdin;
7afe2750-cee0-4d97-b7f7-914f0725247e	77cef60a-5772-4aa9-826d-e194b90f869e	1	Toán học — Khởi động	15	ca66c958512964b3d8b84d82e622e2e5	2026-11-01 08:22:00.152508+07	2026-11-01 08:22:00.079723+07
80686b42-aec2-4bef-973a-b3dda9bbaec1	fc89a952-a1ee-46b6-bec5-8f9f94bca37b	1	Tin học — Kiến thức nền tảng	10	83f3efa29da931a035b5d0b03803b830	2026-11-01 08:22:00.152888+07	2026-11-01 08:22:00.079723+07
7d601828-f631-442f-aee5-d104d85c68df	744c15ff-f707-4696-ad6c-ff2a04f2ee29	1	Tiếng Anh — Everyday English	10	14b30a21168bae00269f71895a4879d4	2026-11-01 08:22:00.152969+07	2026-11-01 08:22:00.079723+07
7d2820df-f9a7-4558-b04b-74f6aa706449	091e22d9-af7a-47d8-9a08-0ca4211434e3	1	Ngữ văn — Kiến thức cơ bản	10	f7eb017e316ecde43ca8d54b85019e57	2026-11-01 08:22:00.153085+07	2026-11-01 08:22:00.079723+07
a1d0fd80-fefd-471d-9ea1-1dc7a5264c7b	1b8a8d2a-864d-4d74-b57b-4bd63a0de2f9	1	Toán học — Công thức và lời giải	15	7a8fcdbdcaccf3f6a9dc46ec2c6908f9	2026-11-01 08:22:00.153154+07	2026-11-01 08:22:00.079723+07
cc240a6c-23ad-4f69-904e-d16ea9e71165	662fc160-18b6-458f-bab5-da47dcb99fd2	1	Đề riêng của Giang — phiên bản 1	15	8b1816d81bebe4723105cc541c4f51f0	2026-11-01 08:22:00.173449+07	2026-11-01 08:22:00.079723+07
b1a1f764-d664-41d9-9e63-c83b3d205ab1	662fc160-18b6-458f-bab5-da47dcb99fd2	2	Đề riêng của Giang — phiên bản 2	20	f0819f76678f9ae13e1da47d41619dc8	2026-11-01 08:22:00.175836+07	2026-11-01 08:22:00.079723+07
8009874e-b5d1-4539-8fca-dc495ce94eb2	108b4e32-4925-4f2e-8730-b81192027491	1	Đề đã xóa — lịch sử còn nguyên	10	f68cd2c21ffae937e58a6ef70c882781	2026-11-01 08:22:00.177092+07	2026-11-01 08:22:00.079723+07
\.


--
-- TOC entry 5077 (class 0 OID 25007)
-- Dependencies: 226
-- Data for Name: exams; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.exams (id, owner_id, subject_id, legacy_key, description, deleted_at, created_at, updated_at) FROM stdin;
77cef60a-5772-4aa9-826d-e194b90f869e	\N	1	sample-math	Ôn số học, phương trình và hình học cơ bản.	\N	2026-11-01 08:22:00.079723+07	2026-11-01 08:22:00.079723+07
fc89a952-a1ee-46b6-bec5-8f9f94bca37b	\N	9	sample-computing	Làm quen với dữ liệu, lập trình và kiến thức web.	\N	2026-11-01 08:22:00.079723+07	2026-11-01 08:22:00.079723+07
744c15ff-f707-4696-ad6c-ff2a04f2ee29	\N	3	sample-english	Luyện từ vựng và ngữ pháp tiếng Anh cơ bản.	\N	2026-11-01 08:22:00.079723+07	2026-11-01 08:22:00.079723+07
091e22d9-af7a-47d8-9a08-0ca4211434e3	\N	2	van-hoc-co-ban	Ôn tác giả, tác phẩm và biện pháp tu từ.	\N	2026-11-01 08:22:00.079723+07	2026-11-01 08:22:00.079723+07
1b8a8d2a-864d-4d74-b57b-4bd63a0de2f9	\N	1	toan-cong-thuc	\N	\N	2026-11-01 08:22:00.079723+07	2026-11-01 08:22:00.079723+07
662fc160-18b6-458f-bab5-da47dcb99fd2	1	1	demo-personal	Đề cá nhân để thử quản lý phiên bản	\N	2026-11-01 08:22:00.079723+07	2026-11-01 08:22:00.079723+07
108b4e32-4925-4f2e-8730-b81192027491	1	\N	demo-deleted	\N	2026-11-01 08:22:00.180321+07	2026-11-01 08:22:00.079723+07	2026-11-01 08:22:00.180492+07
\.


--
-- TOC entry 5079 (class 0 OID 25050)
-- Dependencies: 228
-- Data for Name: questions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.questions (id, exam_version_id, question_no, body, option_a, option_b, option_c, option_d, correct_answer, explanation) FROM stdin;
fb898fbb-6f41-40e4-a8d0-15d327d54233	7afe2750-cee0-4d97-b7f7-914f0725247e	1	Giá trị của 2 + 3 × 4 là bao nhiêu?	20	14	24	9	b	\N
0dfa412e-1c63-4044-8bce-236639a87d45	7afe2750-cee0-4d97-b7f7-914f0725247e	2	Nghiệm của phương trình 2x + 6 = 14 là gì?	2	3	4	5	c	\N
a969ddc2-9bbc-462c-85c6-27e457b9b05e	7afe2750-cee0-4d97-b7f7-914f0725247e	3	Diện tích hình chữ nhật dài 8 cm, rộng 5 cm là bao nhiêu?	13 cm²	26 cm²	40 cm²	80 cm²	c	\N
fd34082d-3650-4748-b0f1-dc10f6172922	7afe2750-cee0-4d97-b7f7-914f0725247e	4	25% của 200 bằng bao nhiêu?	25	50	75	100	b	\N
e7099b14-5922-44c3-9f12-24c6a14dc9e3	7afe2750-cee0-4d97-b7f7-914f0725247e	5	Trung bình cộng của 4, 6 và 8 bằng bao nhiêu?	5	6	7	8	b	\N
a7ab217c-5e74-4f6d-8250-579154ccd311	80686b42-aec2-4bef-973a-b3dda9bbaec1	1	Một byte thường gồm bao nhiêu bit?	2	4	8	16	c	\N
6aad709e-ebb6-4527-b659-72547c3eb7bb	80686b42-aec2-4bef-973a-b3dda9bbaec1	2	HTML được dùng chủ yếu để làm gì?	Mô tả cấu trúc trang web	Quản lý bộ nhớ RAM	Mã hóa ổ đĩa	Biên dịch Java	a	\N
9a507624-c421-4332-a43d-af7f82257061	80686b42-aec2-4bef-973a-b3dda9bbaec1	3	Trong Python, len([1, 2, 3]) trả về giá trị nào?	1	2	3	4	c	\N
21b4c92d-16db-4096-be85-624f9d363faf	80686b42-aec2-4bef-973a-b3dda9bbaec1	4	SQL SELECT được dùng để làm gì?	Xóa một bảng	Truy vấn dữ liệu	Định dạng văn bản	Tắt máy chủ	b	\N
9ee3c9bd-4992-4745-8e7a-c1858abe1177	80686b42-aec2-4bef-973a-b3dda9bbaec1	5	CSS chủ yếu dùng để làm gì?	Lưu mật khẩu	Thiết lập kiểu hiển thị trang web	Chia địa chỉ IP	Quản lý tiến trình	b	\N
773bcdfb-91b7-4f26-8d5d-1a0a6b5ed564	7d601828-f631-442f-aee5-d104d85c68df	1	Choose the correct sentence.	She go to school every day.	She goes to school every day.	She going to school every day.	She gone to school every day.	b	\N
de61d51e-1f8c-4457-8346-9b7b156eb037	7d601828-f631-442f-aee5-d104d85c68df	2	What is the plural of 'child'?	Childs	Childes	Children	Childrens	c	\N
b177332e-8510-4a4c-b205-05fcd5ba6741	7d601828-f631-442f-aee5-d104d85c68df	3	Complete: I have lived here ___ 2020.	for	since	at	on	b	\N
e585b08d-35b9-48ea-bdf0-bc1e7f528625	7d601828-f631-442f-aee5-d104d85c68df	4	Choose the opposite of 'expensive'.	Cheap	Large	Fast	Heavy	a	\N
37377ca4-f38c-4601-9ce9-e20b8d9aaac7	7d601828-f631-442f-aee5-d104d85c68df	5	Complete: If it rains, we ___ stay at home.	will	would	did	have	a	\N
7983e7d0-d42b-4847-9ca9-205cfc520b0b	7d2820df-f9a7-4558-b04b-74f6aa706449	1	Tác giả của tác phẩm "Truyện Kiều" là ai?	Nguyễn Trãi	Nguyễn Du	Hồ Xuân Hương	Nguyễn Khuyến	b	\N
0524281c-f097-4491-9fb2-2879501ff1dd	7d2820df-f9a7-4558-b04b-74f6aa706449	2	Bài thơ "Tây Tiến" là của nhà thơ nào?	Quang Dũng	Tố Hữu	Chế Lan Viên	Xuân Diệu	a	\N
c7c8ef9e-fda4-4c8e-9861-09b01efc13f9	7d2820df-f9a7-4558-b04b-74f6aa706449	3	Truyện ngắn "Vợ nhặt" là của nhà văn nào?	Nam Cao	Kim Lân	Ngô Tất Tố	Nguyên Hồng	b	\N
e0f725ee-56e0-42e1-a6d9-f698524eed97	7d2820df-f9a7-4558-b04b-74f6aa706449	4	Thể thơ lục bát có đặc điểm nào sau đây?	Mỗi câu bảy chữ	Mỗi câu năm chữ	Câu sáu chữ xen kẽ câu tám chữ	Không hạn chế số chữ	c	\N
e504f101-7c3e-4d66-903e-aaad11950c86	7d2820df-f9a7-4558-b04b-74f6aa706449	5	Biện pháp tu từ so sánh là gì?	Đối chiếu sự vật này với sự vật khác có nét tương đồng	Phóng đại mức độ của sự vật	Gọi sự vật bằng tên của sự vật khác	Lặp lại một từ nhiều lần	a	\N
70832bc9-bb11-4a0d-9f05-15bbab79372a	a1d0fd80-fefd-471d-9ea1-1dc7a5264c7b	1	Tính tích phân \\( \\int_0^1 x^2\\,dx \\).	\\( \\frac{1}{2} \\)	\\( \\frac{1}{3} \\)	\\( 1 \\)	\\( 2 \\)	b	Nguyên hàm là \\( \\frac{x^3}{3} \\). Do đó \\[ \\int_0^1 x^2\\,dx=\\left[\\frac{x^3}{3}\\right]_0^1=\\frac{1}{3}. \\]
00a854ef-e0d7-4e4f-a412-210515837242	a1d0fd80-fefd-471d-9ea1-1dc7a5264c7b	2	Cho \\( A=\\begin{pmatrix}1 & 2\\\\3 & 4\\end{pmatrix} \\). Tính \\( \\det(A) \\).	2	10	−2	−10	c	Với ma trận cấp hai, \\( \\det(A)=ad-bc=1\\times4-2\\times3=-2 \\).
dc0d09f6-3de9-46f9-b5be-04fab01b0cd5	cc240a6c-23ad-4f69-904e-d16ea9e71165	1	2 + 2 = ?	3	4	5	6	b	Cộng hai số 2.
f752e2f5-79a2-42b9-bd40-58c524d0c14d	b1a1f764-d664-41d9-9e63-c83b3d205ab1	1	3 + 3 = ?	3	4	5	6	d	3 + 3 = 6.
54c557c8-8993-45df-8187-8fcc2cc99a63	8009874e-b5d1-4539-8fca-dc495ce94eb2	1	Một tuần có bao nhiêu ngày?	5	6	7	8	c	\N
\.


--
-- TOC entry 5076 (class 0 OID 24999)
-- Dependencies: 225
-- Data for Name: subjects; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.subjects (id, name) FROM stdin;
1	Toán học
2	Ngữ văn
3	Tiếng Anh
4	Vật lý
5	Hóa học
6	Sinh học
7	Lịch sử
8	Địa lý
9	Tin học
\.


--
-- TOC entry 5074 (class 0 OID 24978)
-- Dependencies: 223
-- Data for Name: user_otps; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_otps (id, user_id, purpose, otp_hash, expires_at, used_at, failed_attempts, created_at) FROM stdin;
\.


--
-- TOC entry 5072 (class 0 OID 24966)
-- Dependencies: 221
-- Data for Name: user_profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_profiles (user_id, goal, updated_at) FROM stdin;
1	Đạt 8 điểm Toán	2026-11-01 08:22:00.079723+07
\.


--
-- TOC entry 5071 (class 0 OID 24950)
-- Dependencies: 220
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, password_hash, display_name, role, is_active, created_at, updated_at) FROM stdin;
1	demo@matchday.local	pbkdf2_sha256$600000$matchday-demo-v2$QIWMSirx5KR/bIfQKDgo7ocwhH7ehqvOKfHriIZeiwM=	Cầu thủ Demo	student	t	2026-11-01 08:22:00.079723+07	2026-11-01 08:22:00.079723+07
\.


--
-- TOC entry 5088 (class 0 OID 0)
-- Dependencies: 224
-- Name: subjects_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.subjects_id_seq', 9, true);


--
-- TOC entry 5089 (class 0 OID 0)
-- Dependencies: 222
-- Name: user_otps_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user_otps_id_seq', 1, false);


--
-- TOC entry 5090 (class 0 OID 0)
-- Dependencies: 219
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 2, true);


--
-- TOC entry 4900 (class 2606 OID 25121)
-- Name: attempt_answers attempt_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attempt_answers
    ADD CONSTRAINT attempt_answers_pkey PRIMARY KEY (attempt_id, question_id);


--
-- TOC entry 4902 (class 2606 OID 25142)
-- Name: attempt_leave_events attempt_leave_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attempt_leave_events
    ADD CONSTRAINT attempt_leave_events_pkey PRIMARY KEY (id);


--
-- TOC entry 4893 (class 2606 OID 25101)
-- Name: attempts attempts_id_exam_version_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attempts
    ADD CONSTRAINT attempts_id_exam_version_id_key UNIQUE (id, exam_version_id);


--
-- TOC entry 4895 (class 2606 OID 25099)
-- Name: attempts attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attempts
    ADD CONSTRAINT attempts_pkey PRIMARY KEY (id);


--
-- TOC entry 4883 (class 2606 OID 25044)
-- Name: exam_versions exam_versions_exam_id_version_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_versions
    ADD CONSTRAINT exam_versions_exam_id_version_no_key UNIQUE (exam_id, version_no);


--
-- TOC entry 4885 (class 2606 OID 25042)
-- Name: exam_versions exam_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_versions
    ADD CONSTRAINT exam_versions_pkey PRIMARY KEY (id);


--
-- TOC entry 4878 (class 2606 OID 25019)
-- Name: exams exams_legacy_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_legacy_key_key UNIQUE (legacy_key);


--
-- TOC entry 4880 (class 2606 OID 25017)
-- Name: exams exams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_pkey PRIMARY KEY (id);


--
-- TOC entry 4887 (class 2606 OID 25067)
-- Name: questions questions_exam_version_id_question_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_exam_version_id_question_no_key UNIQUE (exam_version_id, question_no);


--
-- TOC entry 4889 (class 2606 OID 25069)
-- Name: questions questions_id_exam_version_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_id_exam_version_id_key UNIQUE (id, exam_version_id);


--
-- TOC entry 4891 (class 2606 OID 25065)
-- Name: questions questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_pkey PRIMARY KEY (id);


--
-- TOC entry 4874 (class 2606 OID 25006)
-- Name: subjects subjects_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_name_key UNIQUE (name);


--
-- TOC entry 4876 (class 2606 OID 25004)
-- Name: subjects subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_pkey PRIMARY KEY (id);


--
-- TOC entry 4872 (class 2606 OID 24991)
-- Name: user_otps user_otps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_otps
    ADD CONSTRAINT user_otps_pkey PRIMARY KEY (id);


--
-- TOC entry 4869 (class 2606 OID 24971)
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (user_id);


--
-- TOC entry 4867 (class 2606 OID 24964)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 4896 (class 1259 OID 25112)
-- Name: idx_attempts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attempts_user ON public.attempts USING btree (user_id, started_at DESC);


--
-- TOC entry 4897 (class 1259 OID 25113)
-- Name: idx_attempts_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attempts_version ON public.attempts USING btree (exam_version_id);


--
-- TOC entry 4881 (class 1259 OID 25030)
-- Name: idx_exams_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exams_owner ON public.exams USING btree (owner_id) WHERE (deleted_at IS NULL);


--
-- TOC entry 4903 (class 1259 OID 25148)
-- Name: idx_leave_attempt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leave_attempt ON public.attempt_leave_events USING btree (attempt_id);


--
-- TOC entry 4870 (class 1259 OID 24997)
-- Name: idx_otp_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_user ON public.user_otps USING btree (user_id, created_at DESC);


--
-- TOC entry 4898 (class 1259 OID 25114)
-- Name: uq_attempt_practice_in_progress; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_attempt_practice_in_progress ON public.attempts USING btree (user_id, exam_version_id) WHERE ((status)::text = 'in_progress'::text);


--
-- TOC entry 4865 (class 1259 OID 24965)
-- Name: uq_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_users_email ON public.users USING btree (lower((email)::text));


--
-- TOC entry 4921 (class 2620 OID 25158)
-- Name: attempt_answers trg_answer_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_answer_guard BEFORE INSERT OR DELETE OR UPDATE ON public.attempt_answers FOR EACH ROW EXECUTE FUNCTION public.guard_attempt_answer();


--
-- TOC entry 4920 (class 2620 OID 25162)
-- Name: attempts trg_attempt_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_attempt_guard BEFORE INSERT OR DELETE OR UPDATE ON public.attempts FOR EACH ROW EXECUTE FUNCTION public.guard_attempt();


--
-- TOC entry 4917 (class 2620 OID 25152)
-- Name: exams trg_exams_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_exams_updated BEFORE UPDATE ON public.exams FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- TOC entry 4922 (class 2620 OID 25160)
-- Name: attempt_leave_events trg_leave_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_leave_guard BEFORE INSERT OR DELETE OR UPDATE ON public.attempt_leave_events FOR EACH ROW EXECUTE FUNCTION public.guard_leave_event();


--
-- TOC entry 4916 (class 2620 OID 25151)
-- Name: user_profiles trg_profiles_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- TOC entry 4919 (class 2620 OID 25154)
-- Name: questions trg_questions_locked; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_questions_locked BEFORE INSERT OR DELETE OR UPDATE ON public.questions FOR EACH ROW EXECUTE FUNCTION public.guard_question_version();


--
-- TOC entry 4915 (class 2620 OID 25150)
-- Name: users trg_users_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- TOC entry 4918 (class 2620 OID 25156)
-- Name: exam_versions trg_version_locked; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_version_locked BEFORE INSERT OR DELETE OR UPDATE ON public.exam_versions FOR EACH ROW EXECUTE FUNCTION public.guard_exam_version();


--
-- TOC entry 4912 (class 2606 OID 25122)
-- Name: attempt_answers attempt_answers_attempt_id_exam_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attempt_answers
    ADD CONSTRAINT attempt_answers_attempt_id_exam_version_id_fkey FOREIGN KEY (attempt_id, exam_version_id) REFERENCES public.attempts(id, exam_version_id) ON DELETE RESTRICT;


--
-- TOC entry 4913 (class 2606 OID 25127)
-- Name: attempt_answers attempt_answers_question_id_exam_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attempt_answers
    ADD CONSTRAINT attempt_answers_question_id_exam_version_id_fkey FOREIGN KEY (question_id, exam_version_id) REFERENCES public.questions(id, exam_version_id) ON DELETE RESTRICT;


--
-- TOC entry 4914 (class 2606 OID 25143)
-- Name: attempt_leave_events attempt_leave_events_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attempt_leave_events
    ADD CONSTRAINT attempt_leave_events_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.attempts(id) ON DELETE RESTRICT;


--
-- TOC entry 4910 (class 2606 OID 25107)
-- Name: attempts attempts_exam_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attempts
    ADD CONSTRAINT attempts_exam_version_id_fkey FOREIGN KEY (exam_version_id) REFERENCES public.exam_versions(id) ON DELETE RESTRICT;


--
-- TOC entry 4911 (class 2606 OID 25102)
-- Name: attempts attempts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attempts
    ADD CONSTRAINT attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- TOC entry 4908 (class 2606 OID 25045)
-- Name: exam_versions exam_versions_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_versions
    ADD CONSTRAINT exam_versions_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE RESTRICT;


--
-- TOC entry 4906 (class 2606 OID 25020)
-- Name: exams exams_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- TOC entry 4907 (class 2606 OID 25025)
-- Name: exams exams_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);


--
-- TOC entry 4909 (class 2606 OID 25070)
-- Name: questions questions_exam_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_exam_version_id_fkey FOREIGN KEY (exam_version_id) REFERENCES public.exam_versions(id) ON DELETE RESTRICT;


--
-- TOC entry 4905 (class 2606 OID 24992)
-- Name: user_otps user_otps_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_otps
    ADD CONSTRAINT user_otps_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4904 (class 2606 OID 24972)
-- Name: user_profiles user_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- Completed on 2026-11-01 08:48:46

--
-- PostgreSQL database dump complete
--

\unrestrict YPnRFzK7GQcurclocaXyTtqduP5EQ5wnDKKxMqVMxQkdisgVqKaLsl2a7JUWNXY

