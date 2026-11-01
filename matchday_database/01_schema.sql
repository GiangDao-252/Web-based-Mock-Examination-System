-- MATCHDAY: PostgreSQL 14+, MVP học sinh tự luyện.
-- Bản thay thế có chọn lọc từ mock_exam_schema.sql; KHÔNG phải migration.
-- Chạy trên DATABASE MỚI/RỖNG. Không DROP, không tác động database cũ.
-- Nếu chạy bằng psql: psql -X -v ON_ERROR_STOP=1 -d matchday_v2 -f <file>
-- Bảng/hàm dùng public để giữ cách ánh xạ tên bảng của bản gốc.
BEGIN;
SET LOCAL search_path = public, pg_catalog;

CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(254) NOT NULL CHECK (email = btrim(email) AND position('@' IN email) > 1),
    password_hash TEXT NOT NULL CHECK (btrim(password_hash) <> ''),
    display_name VARCHAR(100) NOT NULL CHECK (display_name ~ '[^[:space:]]'),
    role VARCHAR(10) NOT NULL DEFAULT 'student' CHECK (role = 'student'),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_users_email ON users(lower(email));

CREATE TABLE user_profiles (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    goal VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_otps (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('login','password_reset')),
    otp_hash TEXT NOT NULL CHECK (btrim(otp_hash) <> ''),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (expires_at > created_at),
    CHECK (used_at IS NULL OR used_at >= created_at)
);
CREATE INDEX idx_otp_user ON user_otps(user_id, created_at DESC);

CREATE TABLE subjects (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(60) NOT NULL UNIQUE CHECK (name ~ '[^[:space:]]')
);

CREATE TABLE exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- RESTRICT: xóa tài khoản không biến đề cá nhân thành đề hệ thống.
    owner_id BIGINT REFERENCES users(id) ON DELETE RESTRICT,
    subject_id SMALLINT REFERENCES subjects(id),
    legacy_key VARCHAR(60) UNIQUE CHECK (legacy_key IS NULL OR btrim(legacy_key) <> ''),
    description TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_exams_owner ON exams(owner_id) WHERE deleted_at IS NULL;

CREATE TABLE exam_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE RESTRICT,
    version_no INTEGER NOT NULL CHECK (version_no >= 1),
    title VARCHAR(120) NOT NULL CHECK (title ~ '[^[:space:]]'),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 180),
    content_hash TEXT,
    -- NULL = nháp; công bố => bất biến, kể cả chưa có lượt làm.
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(exam_id, version_no)
);

CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_version_id UUID NOT NULL REFERENCES exam_versions(id) ON DELETE RESTRICT,
    question_no INTEGER NOT NULL CHECK (question_no BETWEEN 1 AND 100),
    body TEXT NOT NULL CHECK (body ~ '[^[:space:]]' AND char_length(body) <= 10000),
    option_a TEXT NOT NULL CHECK (option_a ~ '[^[:space:]]' AND char_length(option_a) <= 10000),
    option_b TEXT NOT NULL CHECK (option_b ~ '[^[:space:]]' AND char_length(option_b) <= 10000),
    option_c TEXT NOT NULL CHECK (option_c ~ '[^[:space:]]' AND char_length(option_c) <= 10000),
    option_d TEXT NOT NULL CHECK (option_d ~ '[^[:space:]]' AND char_length(option_d) <= 10000),
    correct_answer CHAR(1) NOT NULL CHECK (correct_answer IN ('a','b','c','d')),
    explanation TEXT CHECK (explanation IS NULL OR char_length(explanation) <= 20000),
    UNIQUE(exam_version_id, question_no),
    UNIQUE(id, exam_version_id)
);

CREATE TABLE attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    exam_version_id UUID NOT NULL REFERENCES exam_versions(id) ON DELETE RESTRICT,
    status VARCHAR(12) NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress','submitted','timed_out')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deadline_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    -- submitted_at = lúc server nhận/chốt; ended_at = lúc kết thúc bài.
    submitted_at TIMESTAMPTZ,
    client_ended_at TIMESTAMPTZ, -- chỉ tham khảo; không dùng để chứng minh nộp đúng giờ
    last_seen_at TIMESTAMPTZ,
    sync_version INTEGER NOT NULL DEFAULT 0 CHECK (sync_version >= 0),
    last_synced_at TIMESTAMPTZ,
    current_question INTEGER,
    total_questions INTEGER NOT NULL CHECK (total_questions BETWEEN 1 AND 100),
    answered_count INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    wrong_count INTEGER NOT NULL DEFAULT 0,
    score NUMERIC(4,2),
    page_leave_count INTEGER NOT NULL DEFAULT 0 CHECK (page_leave_count >= 0),
    UNIQUE(id, exam_version_id),
    CHECK (deadline_at > started_at),
    CHECK (current_question IS NULL OR current_question BETWEEN 1 AND total_questions),
    CHECK (answered_count BETWEEN 0 AND total_questions),
    CHECK (correct_count BETWEEN 0 AND answered_count),
    CHECK (wrong_count = answered_count - correct_count),
    CHECK (score IS NULL OR score = round(correct_count * 10.0 / total_questions, 2)),
    CHECK (
        (status = 'in_progress' AND submitted_at IS NULL AND ended_at IS NULL AND score IS NULL)
        OR
        (status IN ('submitted','timed_out') AND submitted_at IS NOT NULL
            AND ended_at IS NOT NULL AND score IS NOT NULL
            AND ended_at >= started_at AND ended_at <= deadline_at
            AND submitted_at >= ended_at)
    ),
    CHECK (status <> 'timed_out' OR ended_at = deadline_at)
);
CREATE INDEX idx_attempts_user ON attempts(user_id, started_at DESC);
CREATE INDEX idx_attempts_version ON attempts(exam_version_id);
CREATE UNIQUE INDEX uq_attempt_practice_in_progress
    ON attempts(user_id, exam_version_id) WHERE status = 'in_progress';

CREATE TABLE attempt_answers (
    attempt_id UUID NOT NULL,
    question_id UUID NOT NULL,
    -- Dư cột có chủ đích: hai FK tổng hợp bảo đảm câu hỏi đúng phiên bản.
    exam_version_id UUID NOT NULL,
    selected_answer CHAR(1) CHECK (selected_answer IN ('a','b','c','d')),
    is_flagged BOOLEAN NOT NULL DEFAULT FALSE,
    is_correct BOOLEAN, -- do trigger tính; không tin giá trị frontend gửi
    answered_at TIMESTAMPTZ,
    PRIMARY KEY(attempt_id, question_id),
    FOREIGN KEY(attempt_id, exam_version_id) REFERENCES attempts(id, exam_version_id) ON DELETE RESTRICT,
    FOREIGN KEY(question_id, exam_version_id) REFERENCES questions(id, exam_version_id) ON DELETE RESTRICT
);

CREATE TABLE attempt_leave_events (
    -- UUID do client tạo ổn định cho mỗi sự kiện, chống trùng khi đồng bộ lại.
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
    kind VARCHAR(8) NOT NULL DEFAULT 'hidden' CHECK (kind IN ('hidden','blur')),
    hidden_at TIMESTAMPTZ NOT NULL,
    visible_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    CHECK (visible_at IS NULL OR visible_at >= hidden_at),
    CHECK (ended_at IS NULL OR ended_at >= hidden_at),
    CHECK (visible_at IS NULL OR ended_at IS NULL)
);
CREATE INDEX idx_leave_attempt ON attempt_leave_events(attempt_id);

CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := clock_timestamp(); RETURN NEW; END $$;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_exams_updated BEFORE UPDATE ON exams FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE FUNCTION guard_question_version() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER trg_questions_locked BEFORE INSERT OR UPDATE OR DELETE ON questions
    FOR EACH ROW EXECUTE FUNCTION guard_question_version();

CREATE FUNCTION guard_exam_version() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER trg_version_locked BEFORE INSERT OR UPDATE OR DELETE ON exam_versions
    FOR EACH ROW EXECUTE FUNCTION guard_exam_version();

CREATE FUNCTION guard_attempt_answer() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER trg_answer_guard BEFORE INSERT OR UPDATE OR DELETE ON attempt_answers
    FOR EACH ROW EXECUTE FUNCTION guard_attempt_answer();

CREATE FUNCTION guard_leave_event() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER trg_leave_guard BEFORE INSERT OR UPDATE OR DELETE ON attempt_leave_events
    FOR EACH ROW EXECUTE FUNCTION guard_leave_event();

CREATE FUNCTION guard_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
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
    SELECT count(*) INTO NEW.page_leave_count FROM attempt_leave_events WHERE attempt_id = OLD.id AND kind = 'hidden';
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
CREATE TRIGGER trg_attempt_guard BEFORE INSERT OR UPDATE OR DELETE ON attempts
    FOR EACH ROW EXECUTE FUNCTION guard_attempt();

-- API tạo phiên bản: khóa đề, kiểm tra expected_version chống ghi đè nhiều tab.
-- p_questions: [{text,options:{a,b,c,d},correctAnswer,explanation?}, ...]
CREATE OR REPLACE FUNCTION public.create_exam_version(
    p_exam_id UUID,
    p_user_id BIGINT,
    p_expected_version INTEGER,
    p_title TEXT,
    p_duration INTEGER,
    p_questions JSONB
)
RETURNS UUID
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
CREATE FUNCTION start_attempt(p_user_id BIGINT, p_version_id UUID, p_attempt_id UUID DEFAULT gen_random_uuid())
RETURNS attempts LANGUAGE plpgsql AS $$
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

-- PATCH: chỉ các câu được gửi sẽ đổi; null selectedAnswer = xóa lựa chọn, vẫn giữ cờ.
CREATE FUNCTION apply_answer_batch(p_attempt_id UUID, p_answers JSONB) RETURNS void LANGUAGE plpgsql AS $$
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

CREATE FUNCTION save_attempt(p_user_id BIGINT,p_attempt_id UUID,p_expected_sync INTEGER,p_answers JSONB,p_current_question INTEGER)
RETURNS attempts LANGUAGE plpgsql AS $$
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

CREATE FUNCTION submit_attempt(p_user_id BIGINT,p_attempt_id UUID,p_expected_sync INTEGER,
    p_answers JSONB DEFAULT '[]'::jsonb,p_client_ended_at TIMESTAMPTZ DEFAULT NULL)
RETURNS attempts LANGUAGE plpgsql AS $$
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

-- Idempotent event upsert; backend gọi trước submit, cùng transaction nếu đồng bộ offline.
CREATE FUNCTION record_leave_event(p_user_id BIGINT,p_attempt_id UUID,p_event_id UUID,p_kind TEXT,
    p_hidden_at TIMESTAMPTZ,p_visible_at TIMESTAMPTZ DEFAULT NULL,p_ended_at TIMESTAMPTZ DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
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

-- View này KHÔNG lọc quyền theo tài khoản; backend phải WHERE user_id = user đã xác thực.
CREATE VIEW v_attempt_history AS
SELECT a.*, e.id AS exam_id,e.legacy_key,e.deleted_at AS exam_deleted_at,
       v.version_no,v.title,v.duration_minutes,v.content_hash,
       a.total_questions-a.answered_count AS unanswered_count,
       CASE a.status WHEN 'submitted' THEN 'manual' WHEN 'timed_out' THEN 'timeout' END AS reason
FROM attempts a JOIN exam_versions v ON v.id=a.exam_version_id JOIN exams e ON e.id=v.exam_id
WHERE a.status IN ('submitted','timed_out');

CREATE VIEW v_attempt_review AS
SELECT a.id AS attempt_id,a.user_id,q.id AS question_id,q.question_no,q.body,
       q.option_a,q.option_b,q.option_c,q.option_d,q.correct_answer,q.explanation,
       aa.selected_answer,COALESCE(aa.is_flagged,false) AS is_flagged,
       COALESCE(aa.selected_answer=q.correct_answer,false) AS is_correct
FROM attempts a JOIN questions q ON q.exam_version_id=a.exam_version_id
LEFT JOIN attempt_answers aa ON aa.attempt_id=a.id AND aa.question_id=q.id
WHERE a.status IN ('submitted','timed_out');

-- Tránh vai trò không liên quan tự gọi hàm qua quyền EXECUTE mặc định của PostgreSQL.
-- Chủ sở hữu DB vẫn có quyền; README hướng dẫn grant đúng backend role.
REVOKE EXECUTE ON FUNCTION touch_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION guard_question_version() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION guard_exam_version() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION guard_attempt_answer() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION guard_leave_event() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION guard_attempt() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_exam_version(UUID,BIGINT,INTEGER,TEXT,INTEGER,JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION start_attempt(BIGINT,UUID,UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION apply_answer_batch(UUID,JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION save_attempt(BIGINT,UUID,INTEGER,JSONB,INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION submit_attempt(BIGINT,UUID,INTEGER,JSONB,TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION record_leave_event(BIGINT,UUID,UUID,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TIMESTAMPTZ) FROM PUBLIC;

INSERT INTO subjects(name) VALUES ('Toán học'),('Ngữ văn'),('Tiếng Anh'),('Vật lý'),('Hóa học'),
    ('Sinh học'),('Lịch sử'),('Địa lý'),('Tin học');
COMMIT;
