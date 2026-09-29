-- ============================================================
-- سامانه‌ی مدیریت پروژه و تجهیزات — اسکیمای پایگاه داده (SQLite)
-- طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi
-- ایمیل: M.Ijadi@Hotmail.com  |  تلفن: +989022964006
-- ----------------------------------------------------------------
-- قواعد کلی:
--   • تمام تاریخ‌ها هم به‌صورت شمسی (متنی YYYY/MM/DD در ستون *_jalali)
--     و هم میلادی (ISO YYYY-MM-DD در ستون *_gregorian) ذخیره می‌شوند.
--   • تاریخ شمسی فقط در UI نمایش داده می‌شود؛ مرتب‌سازی و محاسبات
--     همیشه با ستون میلادی انجام می‌شود.
--   • نقش‌ها: admin / warehouse / sales / tech / viewer (دسترسی‌ها در lib/auth.ts).
--   • موجودیت داخلی «devices» در رابط کاربری «تجهیزات» نامیده می‌شود.
-- ============================================================

-- --------------------------------------------------------
-- احراز هویت و کاربران
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  email         TEXT,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'warehouse', 'sales', 'tech', 'viewer')) DEFAULT 'viewer',
  active        INTEGER NOT NULL DEFAULT 1,           -- 1 = فعال، 0 = غیرفعال
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --------------------------------------------------------
-- لیست‌های پیش‌تعریف‌شده (ورودی از لیست، نه نوشتن آزاد)
-- --------------------------------------------------------

-- کارشناسان فروش (نقش حرفه‌ای: sales/warehouse/tech/business)
CREATE TABLE IF NOT EXISTS sales_experts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  phone       TEXT,
  role        TEXT NOT NULL DEFAULT 'sales' CHECK (role IN ('sales', 'warehouse', 'tech', 'business')),
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- کارشناسان فنی (نقش حرفه‌ای: tech/warehouse/sales/business)
CREATE TABLE IF NOT EXISTS technical_experts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  phone       TEXT,
  role        TEXT NOT NULL DEFAULT 'tech' CHECK (role IN ('sales', 'warehouse', 'tech', 'business')),
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- برندها
CREATE TABLE IF NOT EXISTS brands (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- انواع تجهیز
CREATE TABLE IF NOT EXISTS device_types (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- مدل‌های تجهیز (وابسته به برند)
CREATE TABLE IF NOT EXISTS device_models (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_id    INTEGER NOT NULL,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (brand_id, name),
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE RESTRICT
);

-- پروژه‌ها (مشتری): نام پروژه + شماره قرارداد + کارشناس فروش
CREATE TABLE IF NOT EXISTS projects (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,               -- نام پروژه / مشتری
  contract_number   TEXT,                        -- شماره قرارداد
  sales_expert_id   INTEGER,                     -- کارشناس فروش
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (sales_expert_id) REFERENCES sales_experts(id) ON DELETE SET NULL
);

-- دلایل/انواع خرابی (برای تحلیل گزارش‌ها)
CREATE TABLE IF NOT EXISTS failure_reasons (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --------------------------------------------------------
-- موجودیت‌های اصلی
-- --------------------------------------------------------

-- تجهیزات (داخلی: devices). هر پروژه می‌تواند چند تجهیز داشته باشد.
CREATE TABLE IF NOT EXISTS devices (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id               INTEGER NOT NULL,          -- پروژه (مشتری) مالک تجهیز
  contract_number          TEXT,                      -- شماره قرارداد
  sales_expert_id          INTEGER,                   -- کارشناس فروش
  main_serial              TEXT,                      -- شماره سریال تجهیز
  part_number_1            TEXT,                      -- پارت‌نامبر اول تجهیز
  part_number_2            TEXT,                      -- پارت‌نامبر دوم تجهیز
  device_type_id           INTEGER NOT NULL,          -- نوع تجهیز
  device_model_id          INTEGER,                   -- مدل تجهیز
  brand_id                 INTEGER,                   -- برند تجهیز
  technical_expert_id      INTEGER,                   -- کارشناس فنی
  description              TEXT,

  -- تاریخ خروج از انبار (شمسی + میلادی)
  warehouse_exit_jalali    TEXT,
  warehouse_exit_gregorian TEXT,

  -- تاریخ تحویل به مشتری (شمسی + میلادی)
  customer_delivery_jalali    TEXT,
  customer_delivery_gregorian TEXT,

  -- میزان گارانتی داده‌شده به مشتری
  warranty_duration_months INTEGER,                  -- مدت گارانتی (ماه)
  warranty_start_jalali    TEXT,                     -- شروع گارانتی (شمسی)
  warranty_start_gregorian TEXT,                     -- شروع گارانتی (میلادی)
  warranty_end_jalali      TEXT,                     -- پایان گارانتی (شمسی) — در backend محاسبه می‌شود
  warranty_end_gregorian   TEXT,                     -- پایان گارانتی (میلادی) — در backend محاسبه می‌شود

  -- وضعیت تجهیز: فعال / معیوب / در حال تعویض / تعویض‌شده
  status                   TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'defective', 'replacing', 'replaced')),

  -- دلایل تعویض: نوع (سخت‌افزاری/نرم‌افزاری/سایر) + توضیحات آزاد
  replacement_reason_type  TEXT CHECK (replacement_reason_type IN ('hardware', 'software', 'other')),
  replacement_reason_desc  TEXT,

  -- تاریخ فروش (قدیمی — برای سازگاری نگه داشته شد)
  sold_at_jalali           TEXT,
  sold_at_gregorian        TEXT,

  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  created_by               INTEGER,
  FOREIGN KEY (project_id)          REFERENCES projects(id),
  FOREIGN KEY (sales_expert_id)     REFERENCES sales_experts(id),
  FOREIGN KEY (device_type_id)      REFERENCES device_types(id),
  FOREIGN KEY (device_model_id)     REFERENCES device_models(id),
  FOREIGN KEY (brand_id)            REFERENCES brands(id),
  FOREIGN KEY (technical_expert_id) REFERENCES technical_experts(id),
  FOREIGN KEY (created_by)          REFERENCES users(id)
);

-- کاتالوگ قطعات — تعریف مرجع یکتا برای هر «مدل قطعه»
-- یک قطعه‌ی مشخص (پارت‌نامبر) که در پروژه‌ها/تجهیزات مختلف با سریال‌های
-- متفاوت نصب می‌شود، فقط یک بار اینجا تعریف می‌شود: عنوان، مشخصات فنی،
-- پارت‌نامبر ۱ و ۲. رکوردهای جدول parts به این تعریف وصل می‌شوند تا
-- توضیحات همیشه یکسان بماند و ورودی به کمترین حد برسد.
CREATE TABLE IF NOT EXISTS part_catalog (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  part_number_1  TEXT NOT NULL,                    -- کلید کاتالوگ (نرمال‌شده: بدون فاصله، حروف بزرگ)
  part_number_2  TEXT,                             -- پارت‌نامبر دوم (اختیاری)
  title          TEXT NOT NULL,                    -- عنوان مرجع
  tech_specs     TEXT,                             -- مشخصات فنی مرجع
  notes          TEXT,                             -- یادداشت داخلی
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT,
  UNIQUE (part_number_1)
);

CREATE INDEX IF NOT EXISTS idx_part_catalog_pn ON part_catalog(part_number_1);

-- قطعات (هر تجهیز می‌تواند چند قطعه داشته باشد)
CREATE TABLE IF NOT EXISTS parts (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id             INTEGER NOT NULL,         -- تجهیز مالک قطعه
  title                 TEXT NOT NULL,            -- عنوان قطعه
  tech_specs            TEXT,                     -- مشخصات فنی
  part_number_1         TEXT,                     -- پارت‌نامبر اول
  part_number_2         TEXT,                     -- پارت‌نامبر دوم
  part_serial_number    TEXT,                     -- شماره سریال قطعه
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'replaced', 'defective')),
  sold_at_jalali        TEXT,                     -- تاریخ فروش (شمسی)
  sold_at_gregorian     TEXT,                     -- تاریخ فروش (میلادی ISO)
  replaces_part_id      INTEGER,                  -- قطعه‌ای که این قطعه جایگزین آن شده (برای زنجیره گارانتی)
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  created_by            INTEGER,
  FOREIGN KEY (device_id)          REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY (replaces_part_id)   REFERENCES parts(id)    ON DELETE SET NULL,
  FOREIGN KEY (created_by)         REFERENCES users(id)
);

-- --------------------------------------------------------
-- ردیابی تعویض قطعه تحت گارانتی (هسته‌ی تحلیل زنجیره‌ی قطعه)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS warranty_replacements (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id             INTEGER NOT NULL,
  old_part_id           INTEGER NOT NULL,         -- قطعه‌ی قدیمی (جایگزینی‌شده)
  new_part_id           INTEGER NOT NULL,         -- قطعه‌ی جدید
  replaced_by_expert_id INTEGER,                  -- کارشناس انجام‌دهنده‌ی تعویض
  failure_reason_id     INTEGER,                  -- دلیل/نوع خرابی
  description           TEXT,                     -- توضیحات
  replaced_at_jalali    TEXT NOT NULL,            -- تاریخ تعویض (شمسی)
  replaced_at_gregorian TEXT NOT NULL,            -- تاریخ تعویض (میلادی ISO)
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  created_by            INTEGER,
  FOREIGN KEY (device_id)             REFERENCES devices(id),
  FOREIGN KEY (old_part_id)           REFERENCES parts(id),
  FOREIGN KEY (new_part_id)           REFERENCES parts(id),
  FOREIGN KEY (replaced_by_expert_id) REFERENCES technical_experts(id),
  FOREIGN KEY (failure_reason_id)     REFERENCES failure_reasons(id),
  FOREIGN KEY (created_by)            REFERENCES users(id)
);

-- --------------------------------------------------------
-- درخواست گارانتی برای هر تجهیز
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS warranty_requests (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id             INTEGER NOT NULL,                 -- تجهیزِ مرتبط
  description           TEXT,                             -- توضیحات درخواست
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  request_jalali        TEXT,                             -- تاریخ درخواست (شمسی)
  request_gregorian     TEXT,                             -- تاریخ درخواست (میلادی ISO)
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  created_by            INTEGER,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- --------------------------------------------------------
-- تأمین قطعات (Procurement)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurement (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  part_id                     INTEGER NOT NULL UNIQUE,    -- یک قطعه → یک رکورد تأمین
  source                      TEXT NOT NULL DEFAULT 'internal'
                               CHECK (source IN ('internal', 'external')),  -- سورس خرید: داخلی/خارجی
  source_detail               TEXT,                       -- اطلاعات تکمیلی منبع (آماده برای توسعه)
  purchase_jalali             TEXT,                       -- تاریخ خرید (شمسی)
  purchase_gregorian          TEXT,                       -- تاریخ خرید (میلادی ISO)
  supplier_warranty_months    INTEGER,                    -- میزان گارانتی از ساپلایر (ماه)
  extra_notes                 TEXT,                       -- یادداشت‌های اختیاری
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  created_by                  INTEGER,
  FOREIGN KEY (part_id) REFERENCES parts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- --------------------------------------------------------
-- لایسنس سامانه (فقط یک ردیف id=1) — طرح/بازه/دارنده
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS license_info (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  plan           TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'month', 'quarter', 'half-year', 'year', 'lifetime')),
  starts_at      TEXT,
  expires_at     TEXT,
  licensed_to    TEXT,
  notes          TEXT,
  updated_at     TEXT
);
INSERT OR IGNORE INTO license_info (id, plan, licensed_to, notes)
  VALUES (1, 'trial', 'ارزیابی', 'نسخه‌ی رایگان — بدون محدودیت زمانی فعلاً');

-- --------------------------------------------------------
-- نمایه‌ها برای کارایی گزارش‌ها و جستجو
-- --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_devices_project        ON devices(project_id);
CREATE INDEX IF NOT EXISTS idx_devices_sales_expert   ON devices(sales_expert_id);
CREATE INDEX IF NOT EXISTS idx_devices_tech_expert    ON devices(technical_expert_id);
CREATE INDEX IF NOT EXISTS idx_devices_status         ON devices(status);
CREATE INDEX IF NOT EXISTS idx_parts_device           ON parts(device_id);
CREATE INDEX IF NOT EXISTS idx_parts_status           ON parts(status);
CREATE INDEX IF NOT EXISTS idx_replacements_device    ON warranty_replacements(device_id);
CREATE INDEX IF NOT EXISTS idx_replacements_old_part  ON warranty_replacements(old_part_id);
CREATE INDEX IF NOT EXISTS idx_replacements_failure   ON warranty_replacements(failure_reason_id);
CREATE INDEX IF NOT EXISTS idx_wreq_device            ON warranty_requests(device_id);
CREATE INDEX IF NOT EXISTS idx_wreq_status            ON warranty_requests(status);CREATE INDEX IF NOT EXISTS idx_proc_part             ON procurement(part_id);

-- ایندکس‌های جست‌وجوی سراسری و ضدتکراری‌سازی سریال (کارایی چندکاربره)
CREATE INDEX IF NOT EXISTS idx_devices_main_serial   ON devices(main_serial);
CREATE INDEX IF NOT EXISTS idx_devices_project_serial ON devices(project_id, main_serial);
CREATE INDEX IF NOT EXISTS idx_devices_pn1            ON devices(part_number_1);
CREATE INDEX IF NOT EXISTS idx_devices_pn2            ON devices(part_number_2);
CREATE INDEX IF NOT EXISTS idx_parts_serial           ON parts(part_serial_number);
-- یکتایی سریال قطعه در کل سامانه (مقدار خالی/NULL مجاز است)
CREATE UNIQUE INDEX IF NOT EXISTS idx_parts_serial_unique
  ON parts(UPPER(TRIM(part_serial_number)))
  WHERE part_serial_number IS NOT NULL AND TRIM(part_serial_number) != '';
CREATE INDEX IF NOT EXISTS idx_parts_pn1              ON parts(part_number_1);
CREATE INDEX IF NOT EXISTS idx_parts_pn2              ON parts(part_number_2);
CREATE INDEX IF NOT EXISTS idx_projects_name          ON projects(name);
CREATE INDEX IF NOT EXISTS idx_users_active           ON users(active);
