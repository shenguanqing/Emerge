import Foundation
import AppKit
import ScreenCaptureKit
import CoreMedia
import AVFoundation
import CoreGraphics

// 只传递频段能量，不保存音频，也不接收屏幕帧。
typealias FeatureCallback = @convention(c) (Double, Double, Double, Int32) -> Void
typealias ErrorCallback = @convention(c) (UnsafePointer<CChar>) -> Void
private var capture: AnyObject?

private func reportFailure(_ message: String, _ failure: ErrorCallback) {
    message.withCString { failure($0) }
}

/// 检查并请求「屏幕与系统音频录制」权限。返回 true 表示可以继续捕获。
private func ensureScreenCaptureAccess() -> Bool {
    if CGPreflightScreenCaptureAccess() { return true }
    // 系统弹窗出现后通常需要用户在设置中确认，并重启应用才会生效。
    return CGRequestScreenCaptureAccess()
}

@available(macOS 13.0, *)
final class AudioCapture: NSObject, SCStreamOutput, SCStreamDelegate {
    var stream: SCStream?
    var cancelled = false
    let callback: FeatureCallback
    let failure: ErrorCallback
    var low = 0.0
    var midLow = 0.0
    init(_ callback: @escaping FeatureCallback, _ failure: @escaping ErrorCallback) { self.callback = callback; self.failure = failure }
    @MainActor func start() async {
        guard !cancelled else { return }
        if !ensureScreenCaptureAccess() {
            if cancelled { return }
            reportFailure(
                "error.audioPermission",
                failure
            )
            callback(0, 0, 0, -1)
            return
        }
        do {
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            guard !cancelled else { return }
            guard let display = content.displays.first else {
                reportFailure("error.audioNoDisplay", failure)
                callback(0, 0, 0, -1)
                return
            }
            let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
            let config = SCStreamConfiguration()
            config.capturesAudio = true
            config.excludesCurrentProcessAudio = true
            config.sampleRate = 48000
            config.channelCount = 1
            config.width = 2
            config.height = 2
            config.minimumFrameInterval = CMTime(value: 1, timescale: 1)
            let stream = SCStream(filter: filter, configuration: config, delegate: self)
            self.stream = stream
            try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: .main)
            try await stream.startCapture()
            if cancelled { try? await stream.stopCapture(); return }
            callback(0, 0, 0, 1)
        } catch {
            if !cancelled {
                let ns = error as NSError
                let text = ns.localizedDescription
                let denied = ns.domain == "com.apple.ScreenCaptureKit" || text.contains("TCC") || text.contains("拒绝") || text.contains("denied") || text.contains("Denied")
                if denied {
                    reportFailure(
                        "error.audioDenied",
                        failure
                    )
                } else {
                    reportFailure("error.audioStart\t\(text)", failure)
                }
                callback(0, 0, 0, -1)
            }
        }
    }
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        if !cancelled {
            reportFailure("error.audioStopped\t\((error as NSError).localizedDescription)", failure)
            callback(0, 0, 0, -1)
        }
    }
    func stream(_ stream: SCStream, didOutputSampleBuffer sample: CMSampleBuffer, of type: SCStreamOutputType) {
        guard !cancelled, type == .audio, sample.isValid,
              let description = sample.formatDescription else { return }
        let format = AVAudioFormat(cmAudioFormatDescription: description)
        let count = CMSampleBufferGetNumSamples(sample)
        guard count > 0, let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(count)) else { return }
        pcm.frameLength = AVAudioFrameCount(count)
        guard CMSampleBufferCopyPCMDataIntoAudioBufferList(sample, at: 0, frameCount: Int32(count), into: pcm.mutableAudioBufferList) == noErr,
              let samples = pcm.floatChannelData?[0] else { return }
        let a = 1 - exp(-2 * Double.pi * 150 / format.sampleRate)
        let b = 1 - exp(-2 * Double.pi * 2000 / format.sampleRate)
        var bass = 0.0, mid = 0.0, treble = 0.0
        for i in 0..<count {
            let x = Double(samples[i])
            low += a * (x - low)
            midLow += b * (x - midLow)
            bass += low * low
            mid += (midLow - low) * (midLow - low)
            treble += (x - midLow) * (x - midLow)
        }
        callback(min(1, sqrt(bass / Double(count)) * 5), min(1, sqrt(mid / Double(count)) * 5), min(1, sqrt(treble / Double(count)) * 5), 1)
    }
}

@_cdecl("emerge_audio_start")
func startAudio(_ callback: @escaping FeatureCallback, _ failure: @escaping ErrorCallback) {
    DispatchQueue.main.async {
    if #available(macOS 13.0, *) {
        let next = AudioCapture(callback, failure)
        capture = next
        Task { await next.start() }
    } else {
        reportFailure("error.audioVersion", failure)
        callback(0, 0, 0, -2)
    }
    }
}

@_cdecl("emerge_audio_stop")
func stopAudio() {
    DispatchQueue.main.async {
    if #available(macOS 13.0, *), let current = capture as? AudioCapture {
        current.cancelled = true
        capture = nil
        Task { try? await current.stream?.stopCapture() }
    }
    }
}

// MARK: - 系统「正在播放」曲名
// 仅查询已在运行的播放器（NSWorkspace 判断），绝不拉起 App，也不用 MediaRemote 私有 API。

private var nowPlayingCache: (text: String, at: Date)?

private func nowPlayingFromRunningPlayers() -> String? {
    let ids = Set(NSWorkspace.shared.runningApplications.compactMap { $0.bundleIdentifier })
    let targets: [(String, String)] = [
        ("com.apple.Music", "tell application \"Music\" to if player state is playing then name of current track & \" - \" & artist of current track"),
        ("com.spotify.client", "tell application \"Spotify\" to if player state is playing then name of current track & \" - \" & artist of current track"),
    ]
    for (bundle, script) in targets {
        guard ids.contains(bundle) else { continue }
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        task.arguments = ["-e", script]
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = FileHandle.nullDevice
        do {
            try task.run()
            task.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let out = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if task.terminationStatus == 0, !out.isEmpty, out.lowercased() != "missing value" {
                return out
            }
        } catch { /* 下一个 */ }
    }
    return nil
}

/// 把当前播放写入 buffer，返回字节数；0 表示取不到。
@_cdecl("emerge_now_playing")
func emergeNowPlaying(_ buffer: UnsafeMutablePointer<CChar>?, _ capacity: Int) -> Int32 {
    guard let buffer = buffer, capacity > 1 else { return 0 }
    // 短缓存；空结果不缓存，便于换歌后尽快跟上。
    if let cache = nowPlayingCache, !cache.text.isEmpty, Date().timeIntervalSince(cache.at) < 3.0 {
        let utf8 = Array(cache.text.utf8)
        let n = min(utf8.count, capacity - 1)
        for i in 0..<n { buffer[i] = CChar(bitPattern: utf8[i]) }
        buffer[n] = 0
        return Int32(n)
    }
    let text = nowPlayingFromRunningPlayers() ?? ""
    nowPlayingCache = (text, Date())
    if text.isEmpty { return 0 }
    let utf8 = Array(text.utf8)
    let n = min(utf8.count, capacity - 1)
    for i in 0..<n { buffer[i] = CChar(bitPattern: utf8[i]) }
    buffer[n] = 0
    return Int32(n)
}
