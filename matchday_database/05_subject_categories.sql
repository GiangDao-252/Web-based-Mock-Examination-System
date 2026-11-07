BEGIN;

-- NULL: môn chung; có owner_id: môn riêng của tài khoản.
ALTER TABLE public.subjects
ADD COLUMN IF NOT EXISTS owner_id bigint
REFERENCES public.users(id) ON DELETE RESTRICT;

-- Chuẩn hóa khoảng trắng trong tên môn hiện có.
UPDATE public.subjects
SET name = btrim(regexp_replace(name, '\s+', ' ', 'g'))
WHERE name IS DISTINCT FROM
      btrim(regexp_replace(name, '\s+', ' ', 'g'));

-- Dừng nếu dữ liệu hiện tại có tên trùng sau chuẩn hóa.
-- Không tự xóa hoặc gộp môn vì các đề có thể đang tham chiếu.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.subjects
        GROUP BY owner_id, lower(name)
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Có tên môn trùng sau chuẩn hóa. Cần kiểm tra trước khi tiếp tục.';
    END IF;
END;
$$;

-- Bỏ UNIQUE(name) cũ để hai tài khoản có thể có
-- môn riêng cùng tên.
DO $$
DECLARE
    item record;
BEGIN
    FOR item IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid
         AND a.attname = 'name'
        WHERE c.conrelid = 'public.subjects'::regclass
          AND c.contype = 'u'
          AND c.conkey = ARRAY[a.attnum]::smallint[]
    LOOP
        EXECUTE format(
            'ALTER TABLE public.subjects DROP CONSTRAINT %I',
            item.conname
        );
    END LOOP;
END;
$$;

-- Môn chung không được trùng tên, không phân biệt hoa/thường.
CREATE UNIQUE INDEX IF NOT EXISTS uq_subjects_shared_name
ON public.subjects (lower(name))
WHERE owner_id IS NULL;

-- Mỗi tài khoản không được tạo hai môn riêng trùng tên.
CREATE UNIQUE INDEX IF NOT EXISTS uq_subjects_owner_name
ON public.subjects (owner_id, lower(name))
WHERE owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_exams_subject_id
ON public.exams (subject_id);

COMMIT;