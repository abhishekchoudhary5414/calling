-- Enable uuid extension if needed (usually standard in pg 13+)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  assigned_number VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

-- ============================================
-- SCHOOLS / ENTITIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(100) DEFAULT 'school',
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  phone VARCHAR(50) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'new',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS schools_status_idx ON schools(status);
CREATE INDEX IF NOT EXISTS schools_name_idx ON schools(name);
CREATE INDEX IF NOT EXISTS schools_entity_type_idx ON schools(entity_type);
CREATE INDEX IF NOT EXISTS schools_created_at_idx ON schools(created_at);
CREATE INDEX IF NOT EXISTS schools_phone_idx ON schools(phone);

-- ============================================
-- TASKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS tasks_user_id_idx ON tasks(user_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status);
CREATE INDEX IF NOT EXISTS tasks_created_at_idx ON tasks(created_at);

-- ============================================
-- NOTES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS notes_school_id_idx ON notes(school_id);
CREATE INDEX IF NOT EXISTS notes_author_id_idx ON notes(author_id);
CREATE INDEX IF NOT EXISTS notes_created_at_idx ON notes(created_at);

-- ============================================
-- USER_SCHOOL_ASSIGNMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_school_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, school_id)
);

CREATE INDEX IF NOT EXISTS user_school_assignments_user_id_idx ON user_school_assignments(user_id);
CREATE INDEX IF NOT EXISTS user_school_assignments_school_id_idx ON user_school_assignments(school_id);

-- Default admin user for immediate login if not already present
INSERT INTO users (email, password, name, role)
VALUES ('admin@gmail.com', '$2b$10$WMNu9YjM3yG3e028n9P44O7iM7oTq.m64z1hYnQz2yD5FkJw4t.vK', 'Administrator', 'admin')
ON CONFLICT (email) DO NOTHING;
