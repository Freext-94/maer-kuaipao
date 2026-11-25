package com.example.paotui.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_rider_task")
public class RiderTask {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long orderId;

    private Long riderId;

    private Long assignedByUserId;

    private String status;

    private LocalDateTime pickedAt;

    private LocalDateTime deliveredAt;

    private String note;

    private String creator;

    private LocalDateTime createTime;

    private String updater;

    private LocalDateTime updateTime;
}
