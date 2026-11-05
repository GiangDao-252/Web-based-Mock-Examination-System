BEGIN;

CREATE TABLE IF NOT EXISTS public.password_reset_requests (
    email varchar(254) PRIMARY KEY,
    user_id bigint REFERENCES public.users(id) ON DELETE CASCADE,
    request_id uuid NOT NULL,
    otp_hash text,
    expires_at timestamptz,
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    consumed_at timestamptz,
    last_sent_at timestamptz,
    window_started_at timestamptz NOT NULL DEFAULT now(),
    send_count integer NOT NULL DEFAULT 0 CHECK (send_count >= 0)
);

COMMIT;
