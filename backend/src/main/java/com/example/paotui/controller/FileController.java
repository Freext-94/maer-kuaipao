package com.example.paotui.controller;

import com.example.paotui.common.BizException;
import com.example.paotui.config.AppProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * 凭证文件出口。
 * 不用 Spring 的 ResourceHandler：部署目录常含中文（如「同城跑腿」），
 * toUri() 编码后在部分环境下解析不到文件，直接读盘更稳，也能顺手挡住目录穿越。
 */
@RestController
@RequiredArgsConstructor
public class FileController {

    private final AppProperties props;

    @GetMapping("/files/{name:.+}")
    public ResponseEntity<Resource> get(@PathVariable String name) {
        if (name.contains("..") || name.contains("/") || name.contains("\\")) {
            throw new BizException("文件名不合法");
        }
        Path base = Paths.get(props.getUploadDir()).toAbsolutePath().normalize();
        Path file = base.resolve(name).normalize();
        if (!file.startsWith(base)) {
            throw new BizException("文件名不合法");
        }
        if (!Files.isRegularFile(file)) {
            return ResponseEntity.notFound().build();
        }
        MediaType type = MediaType.APPLICATION_OCTET_STREAM;
        String lower = name.toLowerCase();
        if (lower.endsWith(".png")) {
            type = MediaType.IMAGE_PNG;
        } else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
            type = MediaType.IMAGE_JPEG;
        } else if (lower.endsWith(".webp")) {
            type = MediaType.parseMediaType("image/webp");
        } else if (lower.endsWith(".gif")) {
            type = MediaType.IMAGE_GIF;
        } else if (lower.endsWith(".svg")) {
            type = MediaType.parseMediaType("image/svg+xml");
        } else if (lower.endsWith(".mp3")) {
            type = MediaType.parseMediaType("audio/mpeg");
        } else if (lower.endsWith(".m4a") || lower.endsWith(".aac")) {
            type = MediaType.parseMediaType("audio/mp4");
        } else if (lower.endsWith(".wav")) {
            type = MediaType.parseMediaType("audio/wav");
        } else if (lower.endsWith(".ogg") || lower.endsWith(".webm") || lower.endsWith(".amr")) {
            type = MediaType.parseMediaType("audio/" + lower.substring(lower.lastIndexOf('.') + 1));
        }
        return ResponseEntity.ok()
                .contentType(type)
                .header("Cache-Control", "private, max-age=86400")
                .body(new FileSystemResource(file));
    }
}
