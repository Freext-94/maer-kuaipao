package com.example.paotui.dto;

import lombok.Data;

/** 改单：为空表示不动。状态白名单和字段锁在 OrderService.editOrder 里把关。 */
@Data
public class OrderEditCmd {

    private String goodsText;

    private Long goodsEstFen;

    private Long serviceFeeFen;

    private String note;

    /** 改地址：直接改快照里的地址，不动客户主档 */
    private String address;

    private Long riderId;

    /** 改商家：客户填的商家不存在时，管理员改成正确商家 */
    private Long merchantId;

    private String reason;

    private String sourceChannel;
    private String sourceChannelNote;
}
