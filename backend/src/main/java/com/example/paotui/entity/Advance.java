package com.example.paotui.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_advance")
public class Advance {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long orderId;

    private Long merchantId;

    private Long amountFen;

    private String method;

    private Long voucherAttachmentId;

    private Long recoveredFen;

    private Long lossFen;

    private String status;

    private String creator;

    private LocalDateTime createTime;

    private String updater;

    private LocalDateTime updateTime;
}
