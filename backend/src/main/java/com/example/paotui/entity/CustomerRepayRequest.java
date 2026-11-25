package com.example.paotui.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("t_customer_repay_request")
public class CustomerRepayRequest {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long customerId;
    private Long amountFen;
    private String method;
    private String status;
    private String handledBy;
    private LocalDateTime handledAt;
    private LocalDateTime createTime;
}
