package com.example.paotui.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/** 列表/看板/详情页统一用它，金额全部是「分」，由前端格式化。 */
@Data
public class OrderView {

    private Long id;
    private String orderNo;
    private String source;
    private String sourceChannel;
    private String sourceChannelNote;
    private String serviceType;
    private String serviceTypeName;
    private java.util.Map<String, Object> serviceDetails;
    private String status;
    private String statusLabel;
    private Long customerId;
    private String customerName;
    private String customerPhone;
    private Long merchantId;
    private String merchantName;
    private String merchantPhone;
    private List<java.util.Map<String, Object>> merchantGroups;
    private Long riderId;
    private String riderName;
    private String goodsText;
    private String note;
    private Long goodsEstFen;
    private Long goodsRealFen;
    private Long serviceFeeFen;
    private Long extraFeeFen;
    private long receivableFen;
    private long paidFen;
    private long owedFen;
    /** 冲正/减免等调整金额（带符号），供订单统计展示「其他调整金额」 */
    private long adjustmentsFen;
    private Long advanceFen;
    private String advanceStatus;
    private Long customerOwedFen;
    private Boolean polled;
    private LocalDateTime createTime;
    private LocalDateTime pickedAt;
    private LocalDateTime deliveredAt;
    private LocalDateTime finishedAt;
    private String cancelCode;
    private String cancelText;
    private AddressSnap address;
    private List<AttachmentRef> attachments;

    @Data
    public static class AddressSnap {
        /** 一行文本地址；历史订单快照会在读取时自动折算成这一行 */
        private String address;
    }

    @Data
    public static class AttachmentRef {
        private Long id;
        private String bizType;
        private String url;
        private String fileName;
        private String contentType;
    }
}
