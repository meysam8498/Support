// مسیرها و ثابت‌های پروفایل — مقادیر SUPPORT_PROFILE/APP_VERSION در زمان بیلد ثابت می‌شوند.
use std::path::PathBuf;

pub const CUSTOMER_PORT: u16 = 4000;
pub const SUPPORT_PORT: u16 = 4200;

/// پروفایل بسته: مشتری یا سرور پشتیبانی (build.rs → cargo:rustc-env)
pub fn profile() -> &'static str {
    if option_env!("SUPPORT_PROFILE") == Some("support") {
        "support"
    } else {
        "customer"
    }
}

pub fn support_only() -> bool {
    profile() == "support"
}

pub fn app_version() -> &'static str {
    option_env!("APP_VERSION").unwrap_or("0.0.0")
}

pub fn base_title() -> String {
    match profile() {
        "support" => String::from("سرور پشتیبانی — سامانه‌ی مدیریت تجهیزات و قطعات یدکی"),
        _ => String::from("مدیریت تجهیزات و قطعات یدکی"),
    }
}

/// ریشه‌ی داده‌های محلی (%LOCALAPPDATA%) — هر پروفایل پوشه‌ی جدا تا
/// داده‌ی مشتری هرگز با نمونه‌ی پشتیبانی قاطی نشود (PACKAGING.md).
fn local_root() -> PathBuf {
    std::env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir())
}

pub fn app_folder_name() -> &'static str {
    if support_only() {
        "SupportSupportServer"
    } else {
        "SupportEquipment"
    }
}

pub fn data_dir() -> PathBuf {
    local_root().join(app_folder_name()).join("data")
}

pub fn log_dir() -> PathBuf {
    local_root().join(app_folder_name()).join("logs")
}

/// مسیر یک رزورس کنار exe (در نصب NSIS: <نصب>\resources\...)
/// در اجرای dev (cargo run) به desktop/src-tauri/resources برمی‌گردد.
pub fn resource_path(rel: &str) -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p = dir.join("resources").join(rel);
            if p.exists() {
                return p;
            }
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources").join(rel)
}

/// کلید خصوصی صدور لایسنس — فقط در نصب پشتیبانی بسته‌بندی می‌شود (PACKAGING.md:
/// هرگز داخل نصب‌کننده‌ی مشتری نباشد). در نصب مشتری این مسیر وجود ندارد.
pub fn license_issue_key() -> PathBuf {
    resource_path("keys/license_private.pem")
}
