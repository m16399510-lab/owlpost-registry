-- ============================================
-- Owlpost 学籍登记系统 - 数据库 Schema
-- ============================================

-- 1. 创建 student_registry 表
CREATE TABLE IF NOT EXISTS student_registry (
    id SERIAL PRIMARY KEY,
    nickname TEXT NOT NULL,
    qq_number TEXT NOT NULL,
    uids TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. 启用 RLS
ALTER TABLE student_registry ENABLE ROW LEVEL SECURITY;

-- 3. 允许匿名用户 INSERT（公开注册，无需登录）
CREATE POLICY "Anyone can insert" ON student_registry
    FOR INSERT
    WITH CHECK (true);

-- 4. 创建管理员密码配置表（存储 admin 凭证的哈希）
-- 注意：你需要在 Supabase Dashboard > Table Editor 中手动插入一条管理员记录
-- INSERT INTO admin_credentials (username, password_hash) VALUES ('admin', 'your_password_here');
CREATE TABLE IF NOT EXISTS admin_credentials (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
);

ALTER TABLE admin_credentials ENABLE ROW LEVEL SECURITY;
-- admin_credentials 不允许任何客户端直接访问，只能通过 RPC 函数

-- 5. RPC 函数：管理员登录验证 + 获取注册数据（实时关联订阅状态）
CREATE OR REPLACE FUNCTION admin_get_registry(
    p_username TEXT,
    p_password TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_valid BOOLEAN;
    v_result JSON;
BEGIN
    -- 验证管理员凭证（明文比对，如需更安全可用 pgcrypto）
    SELECT EXISTS(
        SELECT 1 FROM admin_credentials
        WHERE username = p_username AND password_hash = p_password
    ) INTO v_valid;

    IF NOT v_valid THEN
        RETURN json_build_object('success', false, 'message', '用户名或密码错误');
    END IF;

    -- 查询所有注册记录，并实时关联每个 UID 的订阅状态
    SELECT json_build_object(
        'success', true,
        'data', COALESCE(json_agg(row_to_json(t)), '[]'::json)
    )
    FROM (
        SELECT
            sr.id,
            sr.nickname,
            sr.qq_number,
            sr.uids,
            sr.created_at,
            (
                SELECT json_agg(json_build_object(
                    'uid', uid_val,
                    'subscription_end_date', ud.subscription_end_date,
                    'account_status', ud.account_status
                ))
                FROM UNNEST(sr.uids) AS uid_val
                LEFT JOIN user_data ud ON ud.user_id::text = uid_val
            ) AS uid_details
        FROM student_registry sr
        ORDER BY sr.created_at DESC
    ) t
    INTO v_result;

    RETURN v_result;
END;
$$;
