package com.example.paotui.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("t_order_merchant")
public class OrderMerchant {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long orderId;
    private Long merchantId;
    private String prepStatus;
    private Long pickedGoodsFen;
    private String note;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
