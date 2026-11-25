package com.example.paotui.service;

import com.example.paotui.common.BizException;
import com.example.paotui.config.AppProperties;
import com.example.paotui.entity.Attachment;
import com.example.paotui.mapper.AttachmentMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.util.HexFormat;
import java.util.Set;

/**
 * 小票与送达照落本地磁盘，DB 只存相对路径。
 * 文件名是随机串：拿到 URL 就等于拿到凭证，所以只允许图片、不列目录。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class UploadService {

    /** 图片 + 语音：客户在电话里说的话，拍不了照就得能录音。 */
    private static final Set<String> ALLOWED = Set.of(
            "image/jpeg", "image/png", "image/webp", "image/heic", "image/gif", "image/bmp",
            "audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/amr");
    private static final long MAX_BYTES = 8L * 1024 * 1024;
    private static final SecureRandom RNG = new SecureRandom();

    private final AttachmentMapper attachmentMapper;
    private final AppProperties props;

    public Attachment save(MultipartFile file, String bizType, long bizId, String uploader) {
        if (file == null || file.isEmpty()) {
            throw new BizException("请选择要上传的文件");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new BizException("单个文件不能超过 8MB，拍之前把美颜/超清关掉");
        }
        String ct = file.getContentType() == null ? "" : file.getContentType().toLowerCase();
        if (!ALLOWED.contains(ct)) {
            throw new BizException("只接受图片（jpg/png/webp/gif）或语音（mp3/m4a/wav），收到的是 " + ct);
        }
        String ext = switch (ct) {
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            case "image/heic" -> ".heic";
            case "image/gif" -> ".gif";
            case "image/bmp" -> ".bmp";
            case "audio/mpeg" -> ".mp3";
            case "audio/mp4", "audio/aac" -> ".m4a";
            case "audio/wav", "audio/x-wav" -> ".wav";
            case "audio/webm" -> ".webm";
            case "audio/ogg" -> ".ogg";
            case "audio/amr" -> ".amr";
            default -> ".jpg";
        };
        byte[] rnd = new byte[12];
        RNG.nextBytes(rnd);
        String name = LocalDate.now() + "-" + HexFormat.of().formatHex(rnd) + ext;
        try {
            Path dir = Path.of(props.getUploadDir()).toAbsolutePath().normalize();
            Files.createDirectories(dir);
            Path target = dir.resolve(name);
            file.transferTo(target);
            Attachment a = new Attachment();
            a.setBizType(bizType);
            a.setBizId(bizId);
            a.setFileName(sanitize(file.getOriginalFilename()));
            a.setStoragePath("/files/" + name);
            a.setContentType(ct);
            a.setSizeBytes(file.getSize());
            a.setSha1(sha1(target));
            a.setUploader(uploader == null ? "" : uploader);
            a.setCreator(uploader);
            attachmentMapper.insert(a);
            return a;
        } catch (IOException e) {
            log.error("保存上传文件失败", e);
            throw new BizException("照片保存失败，请重试");
        }
    }

    public Attachment link(String bizType, long bizId, String storagePath, String uploader) {
        Attachment a = new Attachment();
        a.setBizType(bizType);
        a.setBizId(bizId);
        a.setFileName(storagePath);
        a.setStoragePath(storagePath);
        a.setContentType("");
        a.setSizeBytes(0L);
        a.setSha1("");
        a.setUploader(uploader == null ? "" : uploader);
        a.setCreator(uploader);
        attachmentMapper.insert(a);
        return a;
    }

    private String sha1(Path p) throws IOException {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-1").digest(Files.readAllBytes(p)));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** 原始文件名只用于展示，不能带路径分隔符。 */
    private String sanitize(String raw) {
        if (raw == null || raw.isBlank()) {
            return "photo";
        }
        return raw.replaceAll("[\\\\/:*?\"<>|]", "_");
    }
}
