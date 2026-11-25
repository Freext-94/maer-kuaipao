package com.example.paotui.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_attachment")
public class Attachment {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String bizType;

    private Long bizId;

    private String fileName;

    private String storagePath;

    private String contentType;

    private Long sizeBytes;

    private String sha1;

    private String uploader;

    private String creator;

    private LocalDateTime createTime;
}
