// پوسته‌ی دسکتاپ ویندوز (Tauri 2) — سامانه‌ی مدیریت تجهیزات و قطعات یدکی
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// معماری: سرور Node (باندل esbuild) به‌عنوان پروسه‌ی فرزند کنار پوسته بالا
// می‌آید؛ پنجره به http://localhost:<port> ناوبری می‌کند (کلاینت fetch نسبی
// '/api' می‌زند و سرور همان فرانت بیلدشده را سرو می‌کند — بدون CORS، بدون
// تغییر کد کلاینت). عبارت SUPPORT_PROFILE=customer|support در زمان بیلد
// ثابت می‌شود (build.rs): مشتری پورت 4000 + LICENSE_ENFORCE، پشتیبانی پورت
// 4200 + SUPPORT_ONLY (داده‌ی مشتری اینجا نگه‌داری نمی‌شود).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod paths;

use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::Mutex;

static SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);
static SERVER_PORT: AtomicU16 = AtomicU16::new(0);
static SERVER_CHILD: Mutex<Option<Child>> = Mutex::new(None);

fn main() {
    let debug_env = std::env::var("SUPPORT_DESKTOP_DEBUG").is_ok();
    if debug_env {
        eprintln!("[desktop] profile={} version={}", paths::profile(), paths::app_version());
    }

    // ۱) پوشه‌های داده و لاگ (%LOCALAPPDATA%\<app>\...)
    for dir in [paths::data_dir(), paths::log_dir()] {
        if let Err(e) = std::fs::create_dir_all(&dir) {
            eprintln!("[desktop] خطا در ساخت پوشه {:?}: {e}", dir);
        }
    }

    // ۲) اجرای سرور (باندل esbuild با node.exe داخل resources)
    match spawn_server(debug_env) {
        Ok(child) => {
            if debug_env {
                eprintln!("[desktop] سرور با pid={} اجرا شد.", child.id());
            }
            *SERVER_CHILD.lock().unwrap() = Some(child);
        }
        Err(e) => {
            eprintln!("[desktop] خطای اجرای سرور: {e}");
        }
    }

    let port = SERVER_PORT.load(Ordering::SeqCst);

    // ۳) پنجره
    let url = if port > 0 {
        tauri::Url::parse(&format!("http://localhost:{port}/")).expect("url معتبر نیست")
    } else {
        let fail = paths::resource_path("static/fail.html");
        tauri::Url::from_file_path(fail).ok().unwrap_or_else(|| tauri::Url::parse("http://localhost:0/").unwrap())
    };

    let base_title = paths::base_title();
    let webview_url = url.clone();

    tauri::Builder::default()
        .setup(move |app| {
            let win = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::External(webview_url.clone()),
            )
            .title(base_title.clone())
            .inner_size(1280.0, 820.0)
            .min_inner_size(960.0, 640.0)
            .center()
            .build()?;
            let _ = win.set_focus();
            // نظارت: اگر سرور دیر بالا بیاید و پورت اولیه صفر بود، بعداً ناوبری کن
            if port == 0 {
                let win2 = win.clone();
                std::thread::spawn(move || {
                    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
                    loop {
                        let p = SERVER_PORT.load(Ordering::SeqCst);
                        if p > 0 {
                            let _ = win2.navigate(tauri::Url::parse(&format!("http://localhost:{p}/")).unwrap());
                            break;
                        }
                        if std::time::Instant::now() > deadline || SHUTTING_DOWN.load(Ordering::SeqCst) {
                            break;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(250));
                    }
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("خطا در ساخت اپلیکیشن Tauri")
        .run(|app_handle, event| {
            match event {
                tauri::RunEvent::ExitRequested { api, .. } => {
                    // خروج تمیز: اول سرور خاموش شود، بعد پوسته (PACKAGING.md گام ۲)
                    if !SHUTTING_DOWN.swap(true, Ordering::SeqCst) {
                        api.prevent_exit();
                        kill_server();
                        let _ = app_handle.cleanup_before_exit();
                        std::process::exit(0);
                    }
                }
                _ => {}
            }
        });
}

/// اجرای سرور: node.exe (resources\runtime\node.exe) + باندل (resources\server\server.cjs)
/// محیط: پروفایل‌محور — مشتری: LICENSE_ENFORCE=1 + DB/BK در LOCALAPPDATA؛
/// پشتیبانی: SUPPORT_ONLY=1 + DB موقت نمونه + کلید صدور کنار اجرایی.
fn spawn_server(debug: bool) -> std::io::Result<Child> {
    let node = paths::resource_path("runtime/node.exe");
    let bundle = paths::resource_path("server/server.mjs");
    let node_exe: std::path::PathBuf = if node.exists() {
        node
    } else {
        std::path::PathBuf::from("node")
    };
    if !bundle.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("باندل سرور پیدا نشد: {}", bundle.display()),
        ));
    }

    let is_support = paths::support_only();
    let port = pick_port(if is_support { paths::SUPPORT_PORT } else { paths::CUSTOMER_PORT });

    let mut envs = vec![
        ("PORT", port.to_string()),
        ("APP_VERSION", paths::app_version().to_string()),
        ("NODE_ENV", "production".to_string()),
        // فرانت بیلدشده داخل رزورس‌ها — سرور همان را سرو می‌کند (پنجره به localhost ناوبری می‌کند)
        ("CLIENT_DIST", paths::resource_path("client").display().to_string()),
    ];

    if is_support {
        // سرور پشتیبانی: DB نمونه‌ی موقت + کلید صدور کنار اجرایی + بنر SUPPORT_ONLY
        envs.push(("SUPPORT_ONLY", "1".into()));
        let tmp_db = std::env::temp_dir().join(format!("support-server-sample-{}.db", std::process::id()));
        envs.push(("DB_PATH", tmp_db.display().to_string()));
        envs.push(("BACKUP_DIR", std::env::temp_dir().join("support-server-backups").display().to_string()));
        // محتوای کلید صدور (license.ts محتوا می‌پذیرد نه مسیر) — فقط در نصب پشتیبانی وجود دارد
        let key = std::fs::read_to_string(paths::license_issue_key()).unwrap_or_default();
        if !key.trim().is_empty() {
            envs.push(("LICENSE_ISSUE_KEY", key));
        }
    } else {
        // مشتری: اجرای لایسنس + داده‌ی پایدار محلی
        envs.push(("LICENSE_ENFORCE", "1".into()));
        envs.push(("DB_PATH", paths::data_dir().join("app.db").display().to_string()));
        envs.push(("BACKUP_DIR", paths::data_dir().join("backups").display().to_string()));
    }

    let mut cmd = Command::new(node_exe);
    cmd.arg(&bundle).envs(envs)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if debug {
        eprintln!("[desktop] اجرای سرور روی پورت {port}");
    }

    let mut child = cmd.spawn()?;

    // پمپ لاگ‌ها به فایل (%LOCALAPPDATA%\<app>\logs\server.log)
    let log_path = paths::log_dir().join("server.log");
    if let Ok(log) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
        let stdout = child.stdout.take().map(BufReader::new);
        let stderr = child.stderr.take().map(BufReader::new);
        let mut writer = std::io::BufWriter::new(log);
        use std::io::Write;
        if let Some(r) = stdout {
            std::thread::spawn(move || {
                for line in r.lines().map_while(Result::ok) {
                    let _ = writeln!(writer, "{line}");
                }
            });
        }
        // stderr هم به همان فایل (ساده: فایل جدا)
        if let Some(r) = stderr {
            let mut err_log = std::fs::OpenOptions::new().create(true).append(true).open(log_path.with_extension("err.log")).ok();
            std::thread::spawn(move || {
                let mut w = err_log.take();
                for line in r.lines().map_while(Result::ok) {
                    if let Some(w) = w.as_mut() {
                        let _ = writeln!(w, "{line}");
                    }
                }
            });
        }
    } else if debug {
        eprintln!("[desktop] لاگ فایل نشد: {}", log_path.display());
    }

    // آماده‌شدن سرور → ثبت پورت برای ناوبری پنجره
    std::thread::spawn(move || {
        if wait_http(port, std::time::Duration::from_secs(20)) {
            SERVER_PORT.store(port, Ordering::SeqCst);
        }
    });

    Ok(child)
}

/// poll ساده‌ی GET /api/health تا سرور بالا بیاید
fn wait_http(port: u16, timeout: std::time::Duration) -> bool {
    use std::net::TcpStream;
    use std::time::{Duration, Instant};
    let deadline = Instant::now() + timeout;
    loop {
        if SHUTTING_DOWN.load(Ordering::SeqCst) {
            return false;
        }
        if let Ok(_s) = TcpStream::connect(("127.0.0.1", port)) {
            return true;
        }
        if Instant::now() > deadline {
            return false;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

fn pick_port(preferred: u16) -> u16 {
    use std::net::TcpListener;
    if TcpListener::bind(("127.0.0.1", preferred)).is_ok() {
        return preferred;
    }
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|l| l.local_addr().map(|a| a.port()))
        .unwrap_or(preferred)
}

/// خاموشی تمیز سرور (exit event — RunEvent::ExitRequested فقط در run() می‌آید)
fn kill_server() {
    let mut guard = SERVER_CHILD.lock().unwrap();
    if let Some(child) = guard.as_mut() {
        if debug_enabled() {
            eprintln!("[desktop] خاموشی سرور…");
        }
        let _ = child.kill();
        let _ = child.wait();
    }
    *guard = None;
}

fn debug_enabled() -> bool {
    std::env::var("SUPPORT_DESKTOP_DEBUG").is_ok()
}
