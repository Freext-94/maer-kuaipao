package com.example.paotui.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_order_exception")
public class OrderException {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long orderId;

    private String type;

    private Long disputedFen;

    private String status;

    private String text;

    private String resolution;

    private String resolvedBy;

    private String creator;

    private LocalDateTime createTime;

    private String updater;

    private LocalDateTime updateTime;
}
