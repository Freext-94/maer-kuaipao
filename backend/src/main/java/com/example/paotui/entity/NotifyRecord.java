package com.example.paotui.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_notify_record")
public class NotifyRecord {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long orderId;

    private String scene;

    private String channel;

    private String target;

    private String status;

    private String errCode;

    private String errMsg;

    private Integer attempts;

    private LocalDateTime sentAt;

    private LocalDateTime ackedAt;

    private String creator;

    private LocalDateTime createTime;
}
