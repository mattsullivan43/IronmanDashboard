-- JARVIS Business Command Center - Database Schema (MySQL)
-- Cornerstone Technology & AI Solutions
-- ============================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) DEFAULT 'Mr. Sullivan',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  company_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  product_line VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  contract_start_date DATE,
  contract_end_date DATE,
  contract_terms TEXT,
  monthly_revenue DECIMAL(12,2) DEFAULT 0,
  one_time_fee DECIMAL(12,2) DEFAULT 0,
  one_time_fee_collected TINYINT(1) DEFAULT 0,
  crane_count INT DEFAULT 0,
  per_crane_rate DECIMAL(8,2) DEFAULT 0,
  implementation_fee DECIMAL(12,2) DEFAULT 0,
  implementation_fee_collected TINYINT(1) DEFAULT 0,
  setup_fee DECIMAL(12,2) DEFAULT 0,
  setup_fee_collected TINYINT(1) DEFAULT 0,
  monthly_recurring_fee DECIMAL(12,2) DEFAULT 0,
  cogs_monthly DECIMAL(12,2) DEFAULT 0,
  project_value DECIMAL(12,2) DEFAULT 0,
  project_paid DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CHECK (product_line IN ('boomline', 'ai_receptionist', 'custom_software')),
  CHECK (status IN ('active', 'prospect', 'churned', 'paused'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  description TEXT,
  source VARCHAR(20) DEFAULT 'manual',
  type VARCHAR(20) DEFAULT 'expense',
  category VARCHAR(50),
  custom_category VARCHAR(100),
  account_name VARCHAR(100),
  file_upload_id CHAR(36),
  client_id CHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (source IN ('csv', 'manual')),
  CHECK (type IN ('income', 'expense')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- CSV uploads tracking
CREATE TABLE IF NOT EXISTS csv_uploads (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  filename VARCHAR(255) NOT NULL,
  row_count INT DEFAULT 0,
  column_mapping JSON,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Expense categories with keyword rules
CREATE TABLE IF NOT EXISTS expense_categories (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(100) NOT NULL UNIQUE,
  keywords JSON DEFAULT ('[]'),
  color VARCHAR(7) DEFAULT '#00D4FF',
  is_default TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Commissions table
CREATE TABLE IF NOT EXISTS commissions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  rep_name VARCHAR(255) NOT NULL,
  client_id CHAR(36),
  deal_description TEXT,
  deal_value DECIMAL(12,2) NOT NULL,
  commission_rate DECIMAL(5,4) NOT NULL,
  commission_amount DECIMAL(12,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'unpaid',
  date_closed DATE,
  date_paid DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('paid', 'unpaid', 'pending')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- JARVIS chat history
CREATE TABLE IF NOT EXISTS chat_messages (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  tokens_used INT DEFAULT 0,
  conversation_id CHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (role IN ('user', 'assistant', 'system'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AI usage tracking
CREATE TABLE IF NOT EXISTS ai_usage (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  date DATE NOT NULL DEFAULT (CURDATE()),
  request_count INT DEFAULT 0,
  total_tokens INT DEFAULT 0,
  UNIQUE KEY unique_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Calendar connections
CREATE TABLE IF NOT EXISTS calendar_connections (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  provider VARCHAR(20) NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expiry TIMESTAMP NULL,
  calendar_ids JSON DEFAULT ('[]'),
  connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CHECK (provider IN ('google', 'microsoft'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Calendar events cache
CREATE TABLE IF NOT EXISTS calendar_events (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  external_id VARCHAR(255),
  provider VARCHAR(20) NOT NULL,
  title VARCHAR(500),
  description TEXT,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  location VARCHAR(500),
  calendar_name VARCHAR(255),
  all_day TINYINT(1) DEFAULT 0,
  last_synced TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_event (external_id, provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Settings (key-value store)
CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(100) PRIMARY KEY,
  value JSON NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Manual cash balance entries
CREATE TABLE IF NOT EXISTS cash_balances (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  balance DECIMAL(14,2) NOT NULL,
  source VARCHAR(50) DEFAULT 'manual',
  date DATE DEFAULT (CURDATE()),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Revenue entries (monthly snapshots)
CREATE TABLE IF NOT EXISTS revenue_snapshots (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  month DATE NOT NULL,
  mrr DECIMAL(12,2) DEFAULT 0,
  new_mrr DECIMAL(12,2) DEFAULT 0,
  expansion_mrr DECIMAL(12,2) DEFAULT 0,
  churned_mrr DECIMAL(12,2) DEFAULT 0,
  boomline_mrr DECIMAL(12,2) DEFAULT 0,
  ai_receptionist_mrr DECIMAL(12,2) DEFAULT 0,
  custom_software_revenue DECIMAL(12,2) DEFAULT 0,
  total_customers INT DEFAULT 0,
  churned_customers INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_month (month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create indexes
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_category ON transactions(category);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_file_upload ON transactions(file_upload_id);
CREATE INDEX idx_chat_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at);
CREATE INDEX idx_calendar_events_time ON calendar_events(start_time, end_time);
CREATE INDEX idx_commissions_rep ON commissions(rep_name);
CREATE INDEX idx_commissions_status ON commissions(status);
CREATE INDEX idx_clients_product_line ON clients(product_line);
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_ai_usage_date ON ai_usage(date);

-- Seed default expense categories
INSERT IGNORE INTO expense_categories (id, name, keywords, color, is_default) VALUES
  (UUID(), 'COGS', '["retell", "twilio", "openai", "deepseek", "api usage", "n8n"]', '#FF3B3B', 1),
  (UUID(), 'Sales & Marketing', '["ads", "advertising", "marketing", "hubspot", "linkedin"]', '#FFB800', 1),
  (UUID(), 'Payroll & Contractors', '["payroll", "contractor", "freelance", "gusto", "salary"]', '#00D4FF', 1),
  (UUID(), 'Software & Tools', '["github", "figma", "slack", "notion", "vercel", "stripe"]', '#00FF88', 1),
  (UUID(), 'Infrastructure', '["aws", "amazon web services", "digitalocean", "hosting", "domain", "cloudflare"]', '#8B5CF6', 1),
  (UUID(), 'Office & Misc', '["office", "supplies", "lunch", "travel"]', '#6B7280', 1),
  (UUID(), 'Commissions', '["commission"]', '#F59E0B', 1);

-- Seed clients
INSERT IGNORE INTO clients (id, company_name, product_line, status, crane_count, per_crane_rate, monthly_revenue, implementation_fee, contract_start_date, notes)
SELECT UUID(), 'O''Donnell Crane', 'boomline', 'active', 25, 35.00, 875.00, 30000.00, '2025-01-15', 'First BoomLine customer. 25 cranes active.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM clients WHERE company_name = 'O''Donnell Crane');

INSERT IGNORE INTO clients (id, company_name, product_line, status, monthly_recurring_fee, setup_fee, setup_fee_collected, cogs_monthly, contract_start_date, notes)
SELECT UUID(), 'RAFV / Realtor Association of Fox Valley', 'ai_receptionist', 'active', 500.00, 2500.00, 1, 85.00, '2025-06-01', 'AI Receptionist client. Handles inbound calls for the association.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM clients WHERE company_name = 'RAFV / Realtor Association of Fox Valley');

INSERT IGNORE INTO clients (id, company_name, product_line, status, crane_count, per_crane_rate, monthly_revenue, notes)
SELECT UUID(), 'RH Marlin', 'boomline', 'prospect', 72, 35.00, 0, 'Pipeline prospect. 70-75 cranes. In discussions.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM clients WHERE company_name = 'RH Marlin');

-- Seed commission rep
INSERT INTO commissions (id, rep_name, deal_description, deal_value, commission_rate, commission_amount, status, date_closed)
SELECT UUID(), 'Marlon Ridley', 'RH Marlin - BoomLine prospect', 0, 0.35, 0, 'pending', NULL
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM commissions WHERE rep_name = 'Marlon Ridley');

-- Seed settings
INSERT IGNORE INTO settings (`key`, value) VALUES
  ('company_name', '"Cornerstone Technology & AI Solutions"'),
  ('owner_name', '"Mr. Sullivan"'),
  ('sound_effects', 'false'),
  ('voice_enabled', 'true'),
  ('voice_rate', '1.0'),
  ('voice_pitch', '1.0'),
  ('voice_auto_read_briefing', 'false'),
  ('theme', '"dark"'),
  ('csv_column_mapping', '{}');

-- Seed initial cash balance
INSERT INTO cash_balances (id, balance, source, notes)
SELECT UUID(), 50000.00, 'manual', 'Initial seed balance'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM cash_balances LIMIT 1);
