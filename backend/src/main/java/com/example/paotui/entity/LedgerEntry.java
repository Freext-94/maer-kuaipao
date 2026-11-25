package com.example.paotui.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_ledger_entry")
public class LedgerEntry {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long customerId;

    private Long orderId;

    private String type;

    // 带符号：挂账为正，收款为负；只追加，改错用反向流水
    private Long amountFen;

    private Long reversalOfId;

    private LocalDateTime occurredAt;

    private String periodMonth;

    private String method;

    private String note;

    private String operator;

    private Long evidenceAttachmentId;

    private String idempotencyKey;

    private String creator;

    private LocalDateTime createTime;
}
