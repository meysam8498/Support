// اسکریپت بیلد — پروفایل (customer/support) و ورژن را در زمان کامپایل داخل باینری می‌گذارد.
fn main() {
    let raw = std::env::var("SUPPORT_PROFILE").unwrap_or_default();
    let profile = if raw == "support" { "support" } else { "customer" };
    println!("cargo:rustc-env=SUPPORT_PROFILE={profile}");
    println!("cargo:rerun-if-env-changed=SUPPORT_PROFILE");

    // ورژن از اسکریپت npm می‌آید (npm_package_version)؛ در بیلد مستقیم cargo از Cargo.toml
    let version = std::env::var("npm_package_version")
        .unwrap_or_else(|_| env!("CARGO_PKG_VERSION").to_string());
    println!("cargo:rustc-env=APP_VERSION={version}");

    tauri_build::build();
}
