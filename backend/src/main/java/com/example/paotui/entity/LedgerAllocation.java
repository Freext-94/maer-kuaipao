package com.example.paotui.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_ledger_allocation")
public class LedgerAllocation {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long paymentEntryId;

    private Long chargedEntryId;

    private Long orderId;

    private Long allocatedFen;

    private LocalDateTime occurredAt;

    private Integer prepaid;

    private String creator;

    private LocalDateTime createTime;
}
