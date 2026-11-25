package com.example.paotui.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_order_edit_log")
public class OrderEditLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long orderId;

    private String field;

    private String oldValue;

    private String newValue;

    private String reason;

    private String actor;

    private LocalDateTime createTime;
}
