fn main() {
    println!("cargo:rerun-if-changed=native/SystemAudio.swift");
    println!("cargo:rerun-if-changed=Info.plist");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let out = std::env::var("OUT_DIR").unwrap();
        let arch = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap();
        let target = if arch == "aarch64" { "arm64-apple-macosx11.0" } else { "x86_64-apple-macosx11.0" };
        let status = std::process::Command::new("xcrun").args([
            "swiftc", "-swift-version", "5", "-parse-as-library", "-emit-library", "-static",
            "-module-cache-path", &format!("{out}/swift-cache"), "-module-name", "EmergeAudio", "-target", target,
            "native/SystemAudio.swift", "-o", &format!("{out}/libEmergeAudio.a"),
        ]).status().expect("需要 Xcode Command Line Tools 的 Swift 编译器");
        assert!(status.success(), "系统音频模块编译失败");
        println!("cargo:rustc-link-search=native={out}");
        let swift = std::process::Command::new("xcrun").args(["--find", "swiftc"]).output().unwrap();
        let swift = std::path::PathBuf::from(String::from_utf8(swift.stdout).unwrap().trim());
        let libraries = swift.parent().unwrap().parent().unwrap().join("lib/swift/macosx");
        println!("cargo:rustc-link-search=native={}", libraries.display());
        println!("cargo:rustc-link-search=native=/usr/lib/swift");
        println!("cargo:rustc-link-lib=static=EmergeAudio");
        for framework in ["ScreenCaptureKit", "AVFoundation", "CoreMedia", "CoreGraphics", "CoreFoundation", "Foundation"] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
        // 把 Info.plist 嵌进可执行文件的 __TEXT,__info_plist。
        // 否则直接运行 target/debug/emerge 时 TCC 读不到用途描述，会直接拒绝录屏/系统音频。
        let info_plist = std::path::Path::new("Info.plist")
            .canonicalize()
            .expect("缺少 src-tauri/Info.plist");
        println!(
            "cargo:rustc-link-arg=-Wl,-sectcreate,__TEXT,__info_plist,{}",
            info_plist.display()
        );
    }
    tauri_build::build()
}
