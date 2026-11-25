package com.example.paotui.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_order")
public class Order {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String orderNo;

    private String source;

    private String sourceChannel;

    private String sourceChannelNote;

    private String serviceType;

    private String serviceDetails;

    private Long createdByUserId;

    private Long customerId;

    private Long merchantId;

    private Long riderId;

    private String addressSnapshot;

    private Long goodsEstFen;

    // 可空；取货（PICKED_UP）后锁定，之后不允许再改
    private Long goodsRealFen;

    private Long serviceFeeFen;

    private Long extraFeeFen;

    private String status;

    private String note;

    private String cancelCode;

    private String cancelText;

    private String periodMonth;

    private LocalDateTime dispatchedAt;

    private LocalDateTime pickedAt;

    private LocalDateTime deliveredAt;

    private LocalDateTime finishedAt;

    private LocalDateTime cancelledAt;

    private String creator;

    private LocalDateTime createTime;

    private String updater;

    private LocalDateTime updateTime;
}
